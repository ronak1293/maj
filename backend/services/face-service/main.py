from fastapi import FastAPI, UploadFile, File
import numpy as np
import cv2
from insightface.app import FaceAnalysis
from insightface.utils import face_align
import os
import torch
import tempfile

app = FastAPI()

# ══════════════════════════════════════════════
#  MODEL LOADING
# ══════════════════════════════════════════════

face_app = FaceAnalysis(name="buffalo_l")
face_app.prepare(ctx_id=-1, det_size=(640, 640))

recognizer = None

def get_recognizer():
    global recognizer
    if recognizer is None:
        recognizer = face_app.models.get('recognition')
        if recognizer is None:
            for m in face_app.models.values():
                if hasattr(m, 'get_feat'):
                    recognizer = m
                    break
    return recognizer


# ══════════════════════════════════════════════
#  CODEFORMER — lazy load
# ══════════════════════════════════════════════

codeformer_net = None
codeformer_device = None

def load_codeformer():
    global codeformer_net, codeformer_device
    if codeformer_net is not None:
        return codeformer_net, codeformer_device
    try:
        from codeformer.basicsr.utils.registry import ARCH_REGISTRY
        from codeformer.basicsr.utils import img2tensor, tensor2img

        codeformer_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        net = ARCH_REGISTRY.get('CodeFormer')(
            dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
            connect_list=['32', '64', '128', '256']
        ).to(codeformer_device)

        ckpt_path = 'weights/codeformer.pth'
        if not os.path.exists(ckpt_path):
            os.makedirs('weights', exist_ok=True)
            print('Downloading CodeFormer weights...')
            import urllib.request
            urllib.request.urlretrieve(
                'https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth',
                ckpt_path
            )
        checkpoint = torch.load(ckpt_path, map_location=codeformer_device)
        net.load_state_dict(checkpoint['params_ema'])
        net.eval()
        codeformer_net = net
        print(f'CodeFormer loaded on {codeformer_device}')
        return codeformer_net, codeformer_device
    except ImportError:
        print('WARNING: codeformer-pytorch not installed.')
        return None, None
    except Exception as e:
        print(f'WARNING: CodeFormer load failed: {e}')
        return None, None


# ══════════════════════════════════════════════
#  FACE QUALITY ASSESSMENT
# ══════════════════════════════════════════════

BLUR_THRESHOLD      = 40.0
SIZE_THRESHOLD      = 60.0
OCCLUSION_THRESHOLD = 8.0

def measure_blur(img_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()

def measure_face_size(bbox: list) -> float:
    x1, y1, x2, y2 = bbox
    return min(x2 - x1, y2 - y1)

def measure_occlusion_proxy(aligned_112: np.ndarray) -> float:
    gray = cv2.cvtColor(aligned_112, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    return float(np.mean(np.sqrt(gx**2 + gy**2)))

def needs_restoration(aligned_112: np.ndarray, bbox: list) -> tuple[bool, str]:
    if measure_face_size(bbox) < SIZE_THRESHOLD:
        return True, f'small_face({measure_face_size(bbox):.1f}px)'
    blur = measure_blur(aligned_112)
    if blur < BLUR_THRESHOLD:
        return True, f'blurry(laplacian={blur:.1f})'
    occ = measure_occlusion_proxy(aligned_112)
    if occ < OCCLUSION_THRESHOLD:
        return True, f'occluded(grad={occ:.2f})'
    return False, ''


# ══════════════════════════════════════════════
#  CODEFORMER RESTORATION
# ══════════════════════════════════════════════

def restore_with_codeformer(aligned_112: np.ndarray, fidelity_weight: float = 0.7) -> np.ndarray:
    net, device = load_codeformer()
    if net is None:
        return _fallback_enhance(aligned_112)
    try:
        from codeformer.basicsr.utils import img2tensor, tensor2img
        img_512 = cv2.resize(aligned_112, (512, 512), interpolation=cv2.INTER_CUBIC)
        img_t = img2tensor(img_512, bgr2rgb=True, float32=True).unsqueeze(0).to(device)
        with torch.no_grad():
            output = net(img_t, w=fidelity_weight, adain=True)[0]
        restored_512 = tensor2img(output, rgb2bgr=True, min_max=(0, 1))
        return cv2.resize(restored_512, (112, 112), interpolation=cv2.INTER_AREA)
    except Exception as e:
        print(f'CodeFormer failed: {e}')
        return aligned_112

def _fallback_enhance(img_112: np.ndarray) -> np.ndarray:
    up   = cv2.resize(img_112, (224, 224), interpolation=cv2.INTER_CUBIC)
    down = cv2.resize(up, (112, 112), interpolation=cv2.INTER_AREA)
    blur = cv2.GaussianBlur(down, (0, 0), sigmaX=1.5)
    return cv2.addWeighted(down, 1.5, blur, -0.5, 0)


# ══════════════════════════════════════════════
#  PREPROCESSING
# ══════════════════════════════════════════════

def apply_gamma_correction(img: np.ndarray, gamma: float = 1.5) -> np.ndarray:
    lut = np.array([((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)], dtype=np.uint8)
    return cv2.LUT(img, lut)

def apply_clahe(img: np.ndarray, clip_limit: float = 2.0, tile_grid: tuple = (8, 8)) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l_eq = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid).apply(l)
    return cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

def apply_bilateral_denoise(img: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(img, 9, 75, 75)

def enhance_image(img: np.ndarray) -> np.ndarray:
    img = apply_gamma_correction(img, gamma=1.5)
    img = apply_clahe(img)
    img = apply_bilateral_denoise(img)
    return img


# ══════════════════════════════════════════════
#  CORE EMBEDDING FUNCTION
# ══════════════════════════════════════════════

def embedding_from_face(full_img: np.ndarray, face, bbox: list = None,
                        enable_restoration: bool = True) -> np.ndarray:
    aligned = face_align.norm_crop(full_img, landmark=face.kps)
    restored = aligned
    if enable_restoration:
        dummy_bbox = bbox if bbox is not None else [0, 0, 112, 112]
        should_restore, reason = needs_restoration(aligned, dummy_bbox)
        if should_restore:
            print(f'  [CodeFormer] Restoring — {reason}')
            restored = restore_with_codeformer(aligned, fidelity_weight=0.7)
    rec = get_recognizer()
    embedding = rec.get_feat(restored).flatten() if rec is not None else face.embedding
    norm = np.linalg.norm(embedding)
    return embedding / norm if norm > 0 else embedding


# ══════════════════════════════════════════════
#  NMS
# ══════════════════════════════════════════════

def compute_iou(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2-ix1) * max(0, iy2-iy1)
    if inter == 0: return 0.0
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / union if union > 0 else 0.0

def nms(detections: list, iou_threshold: float = 0.4) -> list:
    if not detections: return []
    detections = sorted(detections, key=lambda d: d['score'], reverse=True)
    kept = []
    while detections:
        best = detections.pop(0)
        kept.append(best)
        detections = [d for d in detections
                      if compute_iou(best['bbox'], d['bbox']) < iou_threshold]
    return kept


# ══════════════════════════════════════════════
#  SAHI TILED DETECTION
# ══════════════════════════════════════════════

def sahi_detect(img: np.ndarray, tile_size: int = 640,
                overlap_ratio: float = 0.2, min_face_score: float = 0.4) -> list:
    img_h, img_w = img.shape[:2]
    step = int(tile_size * (1 - overlap_ratio))
    all_detections = []

    y = 0
    while y < img_h:
        y2 = min(y + tile_size, img_h)
        y1 = max(0, y2 - tile_size)
        x = 0
        while x < img_w:
            x2 = min(x + tile_size, img_w)
            x1 = max(0, x2 - tile_size)
            tile = img[y1:y2, x1:x2]
            for face in face_app.get(tile):
                score = float(face.det_score)
                if score < min_face_score:
                    continue
                tx1, ty1, tx2, ty2 = face.bbox
                abs_kps = face.kps.copy()
                abs_kps[:, 0] += x1
                abs_kps[:, 1] += y1
                all_detections.append({
                    'bbox':  [float(tx1)+x1, float(ty1)+y1,
                              float(tx2)+x1, float(ty2)+y1],
                    'score': score,
                    'kps':   abs_kps,
                    'face':  face
                })
            if x2 == img_w:
                break
            x += step
        if y2 == img_h:
            break
        y += step

    # Full-image pass for large/nearby faces
    for face in face_app.get(img):
        score = float(face.det_score)
        if score < min_face_score:
            continue
        tx1, ty1, tx2, ty2 = face.bbox
        all_detections.append({
            'bbox':  [float(tx1), float(ty1), float(tx2), float(ty2)],
            'score': score,
            'kps':   face.kps.copy(),
            'face':  face
        })

    return nms(all_detections, iou_threshold=0.4)


# ══════════════════════════════════════════════
#  VIDEO FRAME EXTRACTION
# ══════════════════════════════════════════════

FRAME_SAMPLE_INTERVAL = 8

def extract_frames(video_path: str) -> list[tuple[int, np.ndarray]]:
    """
    Opens a video file and returns (frameIndex, enhanced_frame) tuples
    for every FRAME_SAMPLE_INTERVAL-th frame.

    Enhancement (Gamma → CLAHE → Bilateral) is applied per frame
    so lighting changes mid-clip are handled correctly per frame.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    frames = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % FRAME_SAMPLE_INTERVAL == 0:
            enhanced = enhance_image(frame)
            frames.append((frame_idx, enhanced))
        frame_idx += 1

    cap.release()
    print(f"Video: {frame_idx} total frames → "
          f"{len(frames)} sampled (every {FRAME_SAMPLE_INTERVAL}th)")
    return frames


# ══════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════

@app.post("/embed")
async def get_embedding(file: UploadFile = File(...)):
    """
    Enrollment endpoint.
    Accepts a raw image file upload (multipart/form-data).
    Returns one 512-d L2-normalised embedding.
    Restoration is OFF — enrollment images assumed to be good quality.
    """
    try:
        contents = await file.read()

        # Decode image bytes directly into numpy array — no disk write
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Could not decode image"}

        img = enhance_image(img)
        faces = face_app.get(img)

        if not faces:
            return {"error": "No face detected"}

        embedding = embedding_from_face(
            img, faces[0],
            bbox=faces[0].bbox.tolist(),
            enable_restoration=False
        )

        return {"embedding": embedding.tolist()}

    except Exception as e:
        return {"error": str(e)}


@app.post("/attendance")
async def mark_attendance(file: UploadFile = File(...)):
    """
    Multi-face video attendance endpoint.
    Accepts a video file upload (multipart/form-data).

    ── FLOW ────────────────────────────────────────────────────────────────
    1. Write uploaded video bytes to an OS temp file
    2. Extract every FRAME_SAMPLE_INTERVAL-th frame
    3. Run SAHI detection + NMS on each frame
    4. Run embedding_from_face (with conditional CodeFormer) per detection
    5. Return frames[] with per-frame detections for FaceSORT in Node.js
    6. Always delete the temp file in the finally block

    ── RESPONSE SHAPE ──────────────────────────────────────────────────────
    {
      "totalFrames":   int,
      "sampledFrames": int,
      "frames": [
        {
          "frameIndex": int,
          "detections": [
            {
              "bio":  [512 floats],   // L2-normalised embedding
              "app":  [512 floats],   // same as bio (no separate ReID model)
              "bbox": [x, y, w, h]   // XYWH format for FaceSORT IoU
            }
          ]
        }
      ]
    }

    ── WHY TEMP FILE ────────────────────────────────────────────────────────
    OpenCV VideoCapture requires a file path — it cannot read from a buffer.
    tempfile.NamedTemporaryFile gives us a real path on any OS without
    leaving files behind permanently. The finally block always cleans up.
    """
    tmp_path = None
    try:
        contents = await file.read()

        # Determine file suffix from original filename for OpenCV codec detection
        suffix = os.path.splitext(file.filename)[1] if file.filename else '.mp4'
        if not suffix:
            suffix = '.mp4'

        # Write to OS temp directory — NOT the uploads folder
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        print(f"Processing video from temp: {tmp_path}")

        # ── Step 1: Extract sampled frames ──────────────────────────────
        try:
            sampled_frames = extract_frames(tmp_path)
        except ValueError as e:
            return {"error": str(e)}

        if not sampled_frames:
            return {"error": "No frames extracted from video"}

        total_frames = sampled_frames[-1][0] + 1 if sampled_frames else 0

        # ── Step 2: SAHI detection + embedding per frame ─────────────────
        frames_output = []

        for frame_idx, enhanced_frame in sampled_frames:
            detections_raw = sahi_detect(
                enhanced_frame,
                tile_size=640,
                overlap_ratio=0.2,
                min_face_score=0.4
            )

            frame_detections = []

            for det in detections_raw:
                # Proxy face object carrying landmarks from SAHI
                class FaceLike:
                    pass
                proxy = FaceLike()
                proxy.kps       = det['kps']
                proxy.embedding = det['face'].embedding

                # L2-normalised embedding with conditional CodeFormer restoration
                bio_emb = embedding_from_face(
                    enhanced_frame, proxy,
                    bbox=det['bbox'],
                    enable_restoration=True
                )

                # Convert XYXY → XYWH for FaceSORT IoU function in Node.js
                x1, y1, x2, y2 = det['bbox']
                bbox_xywh = [x1, y1, x2 - x1, y2 - y1]

                frame_detections.append({
                    "bio":  bio_emb.tolist(),
                    "app":  bio_emb.tolist(),  # reuse bio — no separate ReID model
                    "bbox": bbox_xywh,
                })

            frames_output.append({
                "frameIndex": frame_idx,
                "detections": frame_detections,
            })

            print(f"  Frame {frame_idx}: {len(frame_detections)} face(s) detected")

        if not any(f['detections'] for f in frames_output):
            return {"error": "No embeddings found"}

        return {
            "totalFrames":   total_frames,
            "sampledFrames": len(sampled_frames),
            "frames":        frames_output,
        }

    except Exception as e:
        return {"error": str(e)}

    finally:
        # Always clean up temp file regardless of success or failure
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
            print(f"Temp file deleted: {tmp_path}")


@app.post("/enroll-directory")
async def enroll_from_directory(file: UploadFile = File(...)):
    """
    Bulk enrollment from a zip file containing student images.

    ── FLOW ────────────────────────────────────────────────────────────────
    Previously this accepted a directory path on disk, which only worked
    when Node.js and Python were on the same machine.

    New approach: Node.js zips the image folder and sends it here.
    Python extracts to a temp directory, processes each image,
    then cleans up the temp directory.

    ── EXPECTED ZIP STRUCTURE ───────────────────────────────────────────────
    studentId_name.jpg   (e.g. 2022UCP1729_Ronak.jpg)
    2022UCP1312_Digvijay.jpg
    ...

    ── RESPONSE ─────────────────────────────────────────────────────────────
    {
      "count": int,
      "results": [
        { "file": "2022UCP1729_Ronak.jpg", "embedding": [512 floats] },
        { "file": "2022UCP1312_Digvijay.jpg", "error": "No face detected" }
      ]
    }
    """
    import zipfile
    import shutil

    tmp_dir = None
    try:
        contents = await file.read()

        # Extract zip to temp directory
        tmp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(tmp_dir, 'upload.zip')

        with open(zip_path, 'wb') as f:
            f.write(contents)

        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(tmp_dir)

        SUPPORTED = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        results = []

        for filename in sorted(os.listdir(tmp_dir)):
            if os.path.splitext(filename)[1].lower() not in SUPPORTED:
                continue

            filepath = os.path.join(tmp_dir, filename)
            img = cv2.imread(filepath)

            if img is None:
                results.append({"file": filename, "error": "Could not read image"})
                continue

            img = enhance_image(img)
            faces = face_app.get(img)

            if not faces:
                results.append({"file": filename, "error": "No face detected"})
                continue

            embedding = embedding_from_face(
                img, faces[0],
                bbox=faces[0].bbox.tolist(),
                enable_restoration=False
            )

            results.append({
                "file":      filename,
                "embedding": embedding.tolist()
            })

        return {"count": len(results), "results": results}

    except Exception as e:
        return {"error": str(e)}

    finally:
        # Always clean up temp directory
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir)
            print(f"Temp directory deleted: {tmp_dir}")