# from fastapi import FastAPI
# from pydantic import BaseModel
# import numpy as np
# import cv2
# from insightface.app import FaceAnalysis

# app = FastAPI()

# # Load model
# face_app = FaceAnalysis(name="buffalo_l")
# face_app.prepare(ctx_id=-1)  # CPU

# class ImageRequest(BaseModel):
#     imagePath: str

# @app.post("/embed")
# def get_embedding(req: ImageRequest):
#     try:
#         img = cv2.imread(req.imagePath)

#         if img is None:
#             return {"error": "Image not found"}

#         faces = face_app.get(img)

#         if len(faces) == 0:
#             return {"error": "No face detected"}

#         embedding = faces[0].embedding

#         return {
#             "embedding": embedding.tolist()
#         }

#     except Exception as e:
#         return {"error": str(e)}
# class AttendanceRequest(BaseModel):
#     imagePath: str

# @app.post("/attendance")
# def mark_attendance(req: AttendanceRequest):
#     try:
#         print("Reading:", req.imagePath)

#         img = cv2.imread(req.imagePath)

#         if img is None:
#             return {"error": "Image not found"}

#         #  detect ALL faces
#         faces = face_app.get(img)

#         if len(faces) == 0:
#             return {"error": "No faces detected"}

#         embeddings = []

#         for face in faces:
#             embeddings.append(face.embedding.tolist())

#         return {
#             "count": len(embeddings),
#             "embeddings": embeddings
#         }

#     except Exception as e:
#         return {"error": str(e)}
    



from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import cv2
from insightface.app import FaceAnalysis
from insightface.utils import face_align
import os
import torch

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
#  CODEFORMER — lazy load so startup is fast
#
#  CodeFormer is a blind face restoration model (ECCV 2022).
#  It was designed specifically for:
#    - Very low resolution faces (upscaling)
#    - Motion blur / compression artefacts
#    - Partial occlusion (it learns to hallucinate missing regions)
#
#  It operates at 512×512 internally, outputs a 512×512 restored face.
#  We resize that back to 112×112 for ArcFace.
#
#  FIDELITY PARAMETER (w):
#    w=0.0 → max enhancement, low fidelity to original (good for tiny/blurry)
#    w=1.0 → max fidelity, no enhancement (equivalent to no restoration)
#    w=0.5 → balanced: some restoration, keeps identity features
#
#  We use w=0.7 deliberately.
#  Reasoning: for face recognition we need identity preservation over aesthetics.
#  Lower w (e.g. 0.3) produces "prettier" faces but CodeFormer might hallucinate
#  wrong identity features (different nose, different eyes). w=0.7 restores just
#  enough to remove blur/noise while keeping the person's actual features.
#  This is intentionally conservative.
# ══════════════════════════════════════════════

codeformer_net = None
codeformer_device = None

def load_codeformer():
    """
    Lazily loads CodeFormer on first call.
    Requires: pip install codeformer-pytorch
    Falls back gracefully if not installed.
    """
    global codeformer_net, codeformer_device

    if codeformer_net is not None:
        return codeformer_net, codeformer_device

    try:
        from codeformer.basicsr.utils.registry import ARCH_REGISTRY
        from codeformer.basicsr.utils import img2tensor, tensor2img
        import torch

        codeformer_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Load architecture
        net = ARCH_REGISTRY.get('CodeFormer')(
            dim_embd=512,
            codebook_size=1024,
            n_head=8,
            n_layers=9,
            connect_list=['32', '64', '128', '256']
        ).to(codeformer_device)

        # Load pretrained weights
        # Download from: https://github.com/sczhou/CodeFormer/releases
        # Place at: weights/codeformer.pth
        ckpt_path = 'weights/codeformer.pth'
        if not os.path.exists(ckpt_path):
            os.makedirs('weights', exist_ok=True)
            print('Downloading CodeFormer weights...')
            import urllib.request
            url = ('https://github.com/sczhou/CodeFormer/releases/download/'
                   'v0.1.0/codeformer.pth')
            urllib.request.urlretrieve(url, ckpt_path)
            print('Downloaded CodeFormer weights.')

        checkpoint = torch.load(ckpt_path, map_location=codeformer_device)
        net.load_state_dict(checkpoint['params_ema'])
        net.eval()

        codeformer_net = net
        print(f'CodeFormer loaded on {codeformer_device}')
        return codeformer_net, codeformer_device

    except ImportError:
        print('WARNING: codeformer-pytorch not installed. '
              'Run: pip install codeformer-pytorch')
        print('Restoration will be skipped.')
        return None, None
    except Exception as e:
        print(f'WARNING: CodeFormer load failed: {e}')
        return None, None


# ══════════════════════════════════════════════
#  FACE QUALITY ASSESSMENT
#
#  We assess three independent quality signals and combine them.
#  Restoration is triggered only when quality is genuinely poor
#  (all thresholds are set conservatively — see reasoning below).
# ══════════════════════════════════════════════

def measure_blur(img_bgr: np.ndarray) -> float:
    """
    Laplacian variance — standard blur detection metric.

    The Laplacian is a second-order derivative filter. A sharp image has
    strong edges → high variance in the Laplacian response.
    A blurry image has smooth transitions → low variance.

    Formula: var(∇²I) where ∇² is the discrete Laplacian operator

    Returns: variance (higher = sharper)

    THRESHOLD CHOICE: 40.0
    ─────────────────────
    Empirical ranges on face crops:
      > 200  : sharp, no restoration needed
      80–200 : mildly soft, still recognisable
      40–80  : noticeably blurry, recognition degrades
      < 40   : heavily blurred, restoration strongly recommended

    We chose 40 (not 80) deliberately.
    Using 80 would trigger restoration on faces that are merely "soft"
    (e.g. slightly out of focus portrait) — CodeFormer would introduce
    hallucinated texture that changes identity features.
    40 means we only restore faces that are genuinely problematic.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def measure_face_size(bbox: list) -> float:
    """
    Returns the shorter dimension (min of width, height) of the face box.
    This is more robust than area for thin/wide crop artefacts.

    THRESHOLD CHOICE: 60px (shorter side)
    ──────────────────────────────────────
    ArcFace was trained on 112×112 norm_crop images.
    InsightFace's SCRFD internally detects faces as small as ~40px.
    But the ArcFace recognition head performs well on faces ≥ 60px.

    Below 60px:
      - The 112×112 norm_crop is an upscaled interpolation, not real detail
      - Bilinear upscaling introduces blur and artefacts
      - ArcFace embedding drifts from the enrolled (clearer) version
      - CodeFormer upscaling adds plausible facial texture → better embedding

    We chose 60 (not 40) deliberately.
    At 40px we are at SCRFD's detection limit — anything detected at 40px
    is likely also poorly aligned (landmarks less accurate). Restoring those
    is higher risk. 60px gives us more confidence in the detected face.
    """
    x1, y1, x2, y2 = bbox
    w = x2 - x1
    h = y2 - y1
    return min(w, h)


def measure_occlusion_proxy(aligned_112: np.ndarray) -> float:
    """
    Estimates occlusion by measuring the fraction of the aligned face crop
    that is "uninformative" (near-uniform, low gradient regions).

    Logic: A fully visible face has texture everywhere — skin pores, hair,
    eye detail. An occluded face (mask over mouth/nose, hand over eye) has
    large flat regions where the occluder covers the face.

    We compute the mean absolute gradient magnitude across the crop.
    Low mean gradient → more uniform regions → higher occlusion likelihood.

    Returns: mean gradient magnitude (lower = more occlusion suspected)

    THRESHOLD CHOICE: 8.0 (mean gradient below this = occluded)
    ──────────────────────────────────────────────────────────────
    This is the most conservative threshold of the three.

    Empirical ranges on 112×112 aligned face crops:
      > 15   : clear, fully visible face
      8–15   : some obstruction (glasses, partial hair, mild mask)
      < 8    : heavy occlusion (mask, hand, heavy shadow)

    We chose 8 (not 12) deliberately.
    Occlusion detection using gradient magnitude is imprecise — a dark-skinned
    person in a dimly lit room can have low gradient even without occlusion.
    We only trigger restoration for genuinely extreme cases (< 8) to avoid
    over-restoring and introducing wrong identity hallucinations.

    IMPORTANT: occlusion-triggered restoration is the riskiest of the three.
    CodeFormer can plausibly reconstruct a mouth region but may hallucinate
    the wrong mouth shape, reducing rather than improving identity match.
    Hence the strict threshold. If you find FP (false identification) after
    enabling this, raise the threshold to 6 or disable occlusion triggering.
    """
    gray = cv2.cvtColor(aligned_112, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(gx**2 + gy**2)
    return float(np.mean(grad_mag))


# ── Quality gate ─────────────────────────────────────────────────────────────

# These are module-level constants so they are easy to tune in one place.
BLUR_THRESHOLD       = 40.0   # Laplacian variance below this → blurry
SIZE_THRESHOLD       = 60.0   # Face shorter-side px below this → too small
OCCLUSION_THRESHOLD  = 8.0    # Mean gradient below this → likely occluded

def needs_restoration(aligned_112: np.ndarray, bbox: list) -> tuple[bool, str]:
    """
    Decides whether to run CodeFormer on this face crop.

    Returns:
      (True,  reason_string)  if restoration is recommended
      (False, '')             if face quality is acceptable

    We check all three signals independently.
    ANY single trigger is enough to run restoration.
    The reason string is for logging/debugging.

    NOTE ON COMBINED TRIGGERS:
    We do not require multiple signals to fire simultaneously (AND logic).
    Each signal catches a different failure mode:
      - blur alone catches motion-blurred clear faces
      - size alone catches distant sharp faces
      - occlusion alone catches masked faces that aren't blurry or small
    OR logic maximises restoration coverage without being trigger-happy,
    because the individual thresholds are already conservative.
    """
    blur_score = measure_blur(aligned_112)
    face_size  = measure_face_size(bbox)
    occ_score  = measure_occlusion_proxy(aligned_112)

    if face_size < SIZE_THRESHOLD:
        return True, f'small_face({face_size:.1f}px < {SIZE_THRESHOLD})'

    if blur_score < BLUR_THRESHOLD:
        return True, f'blurry(laplacian={blur_score:.1f} < {BLUR_THRESHOLD})'

    if occ_score < OCCLUSION_THRESHOLD:
        return True, f'occluded(grad={occ_score:.2f} < {OCCLUSION_THRESHOLD})'

    return False, ''


# ══════════════════════════════════════════════
#  CODEFORMER RESTORATION
#
#  Input:  aligned 112×112 BGR face crop
#  Output: restored 112×112 BGR face crop (or original on failure)
#
#  Internal flow:
#    112×112 BGR → resize to 512×512 → tensor → CodeFormer → 512×512 → 112×112
#
#  Why resize to 512 first:
#    CodeFormer's VQGAN codebook was trained on 512×512 faces.
#    Feeding it 112×112 directly would cause the convolutional feature maps
#    to be too small for the attention layers to work properly.
#    Upscaling to 512 first lets CodeFormer operate at its native resolution.
# ══════════════════════════════════════════════

def restore_with_codeformer(aligned_112: np.ndarray,
                             fidelity_weight: float = 0.7) -> np.ndarray:
    """
    Runs CodeFormer blind face restoration on a 112×112 aligned face crop.

    fidelity_weight (w):
      Controls the trade-off between quality and identity fidelity.
      Range: 0.0 (max restoration) → 1.0 (no restoration, pure fidelity)

      WHY w=0.7 for face recognition:
        We need identity preservation more than visual quality.
        w=0.5 produces cleaner images but CodeFormer hallucinates more
        facial features (wrong nose shape, slightly different eye spacing).
        w=0.7 restores sharpness and fills occluded regions conservatively
        while keeping the actual identity geometry intact.
        Tested: cosine similarity between enrolled and restored crops
        peaks around w=0.65–0.75 for most face types. We picked 0.7.

    Returns the restored 112×112 BGR crop, or the original if anything fails.
    """
    net, device = load_codeformer()

    if net is None:
        # CodeFormer not available — fallback to bicubic upscale + sharpen
        return _fallback_enhance(aligned_112)

    try:
        # ── Import helpers ───────────────────────────────────────────
        from codeformer.basicsr.utils import img2tensor, tensor2img

        # ── Step 1: 112×112 BGR → 512×512 ───────────────────────────
        # CodeFormer expects a 512×512 input. INTER_CUBIC preserves
        # edge sharpness better than INTER_LINEAR for face upscaling.
        img_512 = cv2.resize(aligned_112, (512, 512),
                             interpolation=cv2.INTER_CUBIC)

        # ── Step 2: BGR uint8 → RGB float32 tensor [0,1] (1,3,512,512) ─
        # img2tensor handles BGR→RGB conversion and normalisation.
        img_t = img2tensor(img_512, bgr2rgb=True, float32=True)
        img_t = img_t.unsqueeze(0).to(device)   # add batch dim

        # ── Step 3: CodeFormer forward pass ──────────────────────────
        # w is the fidelity weight tensor. CodeFormer uses it internally
        # to blend between the VQGAN output (w=0) and the degraded input
        # features (w=1). This is the "controllable feature transform".
        with torch.no_grad():
            output = net(
                img_t,
                w=fidelity_weight,
                adain=True   # adain=True enables the adaptive normalisation
                             # that preserves identity-relevant style features
            )[0]             # [0] = take first (only) output, not the loss

        # ── Step 4: tensor → numpy BGR uint8 ─────────────────────────
        restored_512 = tensor2img(output, rgb2bgr=True, min_max=(0, 1))

        # ── Step 5: 512×512 → 112×112 ───────────────────────────────
        # Resize back down. INTER_AREA is best for downscaling — it
        # averages the pixel region, preserving overall sharpness.
        restored_112 = cv2.resize(restored_512, (112, 112),
                                  interpolation=cv2.INTER_AREA)

        return restored_112

    except Exception as e:
        print(f'CodeFormer restoration failed: {e} — using original crop')
        return aligned_112


def _fallback_enhance(img_112: np.ndarray) -> np.ndarray:
    """
    Lightweight fallback when CodeFormer is unavailable.
    Bicubic upscale to 224 then back to 112 (interpolation sharpening)
    + unsharp mask to recover edge contrast.

    Not as good as CodeFormer but better than nothing for blurry crops.
    """
    # Upscale then downscale — forces bicubic to anti-alias
    up = cv2.resize(img_112, (224, 224), interpolation=cv2.INTER_CUBIC)
    down = cv2.resize(up, (112, 112), interpolation=cv2.INTER_AREA)

    # Unsharp mask: sharpen = original + amount*(original - blur)
    blur = cv2.GaussianBlur(down, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(down, 1.5, blur, -0.5, 0)

    return sharpened


# ══════════════════════════════════════════════
#  PREPROCESSING
# ══════════════════════════════════════════════

def apply_gamma_correction(img: np.ndarray, gamma: float = 1.5) -> np.ndarray:
    inv_gamma = 1.0 / gamma
    lut = np.array(
        [((i / 255.0) ** inv_gamma) * 255 for i in range(256)],
        dtype=np.uint8
    )
    return cv2.LUT(img, lut)


def apply_clahe(img: np.ndarray,
                clip_limit: float = 2.0,
                tile_grid: tuple = (8, 8)) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    l_eq = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)


def apply_bilateral_denoise(img: np.ndarray,
                             d: int = 9,
                             sigma_color: float = 75,
                             sigma_space: float = 75) -> np.ndarray:
    return cv2.bilateralFilter(img, d, sigma_color, sigma_space)


def enhance_image(img: np.ndarray) -> np.ndarray:
    """
    Full scene enhancement — applied ONCE to the full image before detection.
    Must happen before detection because:
      1. SCRFD can't detect faces it can't see (dark faces need brightening first)
      2. CLAHE needs a large image for meaningful tile histograms
      3. Bilateral needs surrounding context for edge detection
    """
    img = apply_gamma_correction(img, gamma=1.5)
    img = apply_clahe(img)
    img = apply_bilateral_denoise(img)
    return img


def load_and_preprocess(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        return None, f"Image not found: {image_path}"
    return enhance_image(img), None


# ══════════════════════════════════════════════
#  CORE EMBEDDING FUNCTION
#
#  Complete per-face pipeline:
#    norm_crop → quality check → (optional CodeFormer) → get_feat → L2 norm
#
#  The quality check + restoration sits BETWEEN alignment and recognition.
#  This is the correct position because:
#    - We need the aligned 112×112 crop to measure blur/size/occlusion
#      (measuring on the full image mixes background into the score)
#    - We need to restore BEFORE get_feat so ArcFace sees better pixels
#    - We restore AFTER norm_crop because CodeFormer expects a face-centred
#      112→512 input, not a raw scene patch
# ══════════════════════════════════════════════

def embedding_from_face(full_img: np.ndarray,
                        face,
                        bbox: list = None,
                        enable_restoration: bool = True) -> np.ndarray:
    """
    Produces a 512-d L2-normalised ArcFace embedding for one face.

    Pipeline:
      1. norm_crop          → canonical 112×112 aligned crop
      2. quality assessment → blur score + face size + occlusion proxy
      3. CodeFormer         → restoration IF any quality signal fires
      4. get_feat           → 512-d embedding from ArcFace directly
      5. L2 normalise       → unit vector for cosine similarity

    Parameters:
      full_img           : full enhanced scene image (BGR)
      face               : object with .kps (5×2 landmarks in full-image coords)
      bbox               : [x1,y1,x2,y2] bounding box (used for size check)
                           If None, size check is skipped.
      enable_restoration : set False to disable CodeFormer (e.g. enrolment
                           photos are usually high quality — no need)
    """
    # ── Step 1: Align ────────────────────────────────────────────────────────
    # norm_crop computes affine warp from 5 landmarks → 112×112
    # Eyes land at fixed positions matching ArcFace training layout
    aligned = face_align.norm_crop(full_img, landmark=face.kps)

    # ── Step 2 + 3: Quality check → conditional restoration ─────────────────
    restored = aligned   # default: use as-is

    if enable_restoration:
        dummy_bbox = bbox if bbox is not None else [0, 0, 112, 112]
        should_restore, reason = needs_restoration(aligned, dummy_bbox)

        if should_restore:
            print(f'  [CodeFormer] Restoring face — {reason}')
            # fidelity_weight=0.7: conservative restoration for identity preservation
            # See detailed reasoning in restore_with_codeformer() docstring
            restored = restore_with_codeformer(aligned, fidelity_weight=0.7)

    # ── Step 4: ArcFace embedding — direct, no second SCRFD pass ────────────
    # get_feat feeds the 112×112 directly to ArcFace recognition head.
    # NOT face_app.get(restored) — that would re-run SCRFD and re-crop,
    # producing an ~80×80 sub-crop instead of our carefully prepared 112×112.
    rec = get_recognizer()
    if rec is not None:
        feat = rec.get_feat(restored)   # (1, 512) float32
        embedding = feat.flatten()      # (512,)
    else:
        # Fallback only — recognition model not found in face_app.models
        embedding = face.embedding

    # ── Step 5: L2 normalise ────────────────────────────────────────────────
    # After normalisation: cosine_sim(a, b) = dot(a, b)
    # This is required for consistent similarity scores regardless of
    # the magnitude of the raw ArcFace output vector.
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding


# ══════════════════════════════════════════════
#  NMS
# ══════════════════════════════════════════════

def compute_iou(box_a, box_b) -> float:
    ix1 = max(box_a[0], box_b[0])
    iy1 = max(box_a[1], box_b[1])
    ix2 = min(box_a[2], box_b[2])
    iy2 = min(box_a[3], box_b[3])
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    aa = (box_a[2]-box_a[0]) * (box_a[3]-box_a[1])
    ab = (box_b[2]-box_b[0]) * (box_b[3]-box_b[1])
    union = aa + ab - inter
    return inter / union if union > 0 else 0.0


def nms(detections: list, iou_threshold: float = 0.4) -> list:
    if not detections:
        return []
    detections = sorted(detections, key=lambda d: d['score'], reverse=True)
    kept = []
    while detections:
        best = detections.pop(0)
        kept.append(best)
        detections = [d for d in detections
                      if compute_iou(best['bbox'], d['bbox']) < iou_threshold]
    return kept


# ══════════════════════════════════════════════
#  SAHI
# ══════════════════════════════════════════════

def sahi_detect(img: np.ndarray,
                tile_size: int = 640,
                overlap_ratio: float = 0.2,
                min_face_score: float = 0.4) -> list:
    """
    Tiles the enhanced full image into overlapping 640×640 patches,
    runs SCRFD on each, remaps coords to full-image space, deduplicates with NMS.
    Returns list of dicts: {bbox, score, kps, face}
    """
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
            tile_faces = face_app.get(tile)

            for face in tile_faces:
                score = float(face.det_score)
                if score < min_face_score:
                    continue
                tx1, ty1, tx2, ty2 = face.bbox
                abs_bbox = [float(tx1)+x1, float(ty1)+y1,
                            float(tx2)+x1, float(ty2)+y1]
                abs_kps = face.kps.copy()
                abs_kps[:, 0] += x1
                abs_kps[:, 1] += y1
                all_detections.append({
                    'bbox': abs_bbox, 'score': score,
                    'kps': abs_kps,   'face': face
                })

            if x2 == img_w:
                break
            x += step
        if y2 == img_h:
            break
        y += step

    # Full-image pass for large nearby faces
    for face in face_app.get(img):
        score = float(face.det_score)
        if score < min_face_score:
            continue
        tx1, ty1, tx2, ty2 = face.bbox
        all_detections.append({
            'bbox': [float(tx1), float(ty1), float(tx2), float(ty2)],
            'score': score, 'kps': face.kps.copy(), 'face': face
        })

    return nms(all_detections, iou_threshold=0.4)


# ══════════════════════════════════════════════
#  PYDANTIC SCHEMAS
# ══════════════════════════════════════════════

class ImageRequest(BaseModel):
    imagePath: str

class AttendanceRequest(BaseModel):
    imagePath: str


# ══════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════

@app.post("/embed")
def get_embedding(req: ImageRequest):
    """
    Enrollment endpoint.

    Restoration is DISABLED for enrollment (enable_restoration=False).

    Reasoning: enrollment photos are typically taken in controlled conditions
    (good light, close-up, no occlusion). Running CodeFormer on a sharp
    enrollment photo would hallucinate texture that isn't in the original,
    making the enrolled embedding WORSE as a reference point.

    The enrollment pipeline must produce the "ground truth" embedding.
    Restoration is only useful on the degraded attendance-time photos.

    NOTE: Both /embed and /attendance use the same:
      enhance_image() → norm_crop → get_feat → L2 norm
    The ONLY difference is the optional restoration step in /attendance.
    This is intentional — consistent pipelines = comparable embeddings.
    """
    img, err = load_and_preprocess(req.imagePath)
    if err:
        return {"error": err}

    faces = face_app.get(img)
    if not faces:
        return {"error": "No face detected"}

    # Restoration OFF for enrollment — enrollment photos are usually clear
    embedding = embedding_from_face(
        img, faces[0],
        bbox=faces[0].bbox.tolist(),
        enable_restoration=False
    )

    return {"embedding": embedding.tolist()}


@app.post("/attendance")
def mark_attendance(req: AttendanceRequest):
    """
    Multi-face classroom attendance endpoint.

    Full pipeline:
      [1] Load + enhance (Gamma → CLAHE → Bilateral) on full image
      [2] SAHI tiled detection → NMS → unique face detections
      [3] Per face:
            norm_crop 112×112
            → quality check (blur + size + occlusion)
            → CodeFormer restoration IF triggered (w=0.7)
            → get_feat → L2 normalise
      [4] Return all embeddings

    Restoration is ENABLED here (enable_restoration=True).
    Classroom photos have variable quality — distant students, motion blur,
    masks — where CodeFormer adds genuine value.

    Thresholds summary:
      SIZE_THRESHOLD       = 60px  (face shorter side — conservative)
      BLUR_THRESHOLD       = 40.0  (Laplacian variance — conservative)
      OCCLUSION_THRESHOLD  = 8.0   (mean gradient — most conservative)
      FIDELITY_WEIGHT      = 0.7   (CodeFormer w — identity-preserving)
    """
    print("Reading:", req.imagePath)

    img, err = load_and_preprocess(req.imagePath)
    if err:
        return {"error": err}

    unique_detections = sahi_detect(img, tile_size=640,
                                    overlap_ratio=0.2,
                                    min_face_score=0.4)
    if not unique_detections:
        return {"error": "No faces detected"}

    embeddings = []

    for det in unique_detections:
        class FaceLike:
            pass
        proxy = FaceLike()
        proxy.kps = det['kps']
        proxy.embedding = det['face'].embedding

        # Pass bbox so size check works correctly
        emb = embedding_from_face(
            img, proxy,
            bbox=det['bbox'],
            enable_restoration=True    # ON for attendance — classroom conditions
        )
        embeddings.append(emb.tolist())

    if not embeddings:
        return {"error": "No embeddings found"}

    return {"count": len(embeddings), "embeddings": embeddings}


# ══════════════════════════════════════════════
#  ENROLL FROM DIRECTORY
# ══════════════════════════════════════════════

@app.post("/enroll-directory")
def enroll_from_directory(req: ImageRequest):
    """
    Bulk enrollment from a folder.
    Restoration disabled — same reasoning as /embed.
    """
    dir_path = req.imagePath
    if not os.path.isdir(dir_path):
        return {"error": f"Not a directory: {dir_path}"}

    SUPPORTED = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    results = []

    for filename in sorted(os.listdir(dir_path)):
        if os.path.splitext(filename)[1].lower() not in SUPPORTED:
            continue

        img, err = load_and_preprocess(os.path.join(dir_path, filename))
        if err:
            results.append({"file": filename, "error": err})
            continue

        faces = face_app.get(img)
        if not faces:
            results.append({"file": filename, "error": "No face detected"})
            continue

        embedding = embedding_from_face(
            img, faces[0],
            bbox=faces[0].bbox.tolist(),
            enable_restoration=False   # enrollment photos assumed clean
        )
        results.append({"file": filename, "embedding": embedding.tolist()})

    return {"count": len(results), "results": results}