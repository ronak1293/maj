import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import axios from 'axios';
import path from 'path';
import Attendance from '../models/Attendance.js';

// ─────────────────────────────────────────────────────────────────────────────
// DISTANCE / SIMILARITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two embedding vectors.
 * Used as dbio and dapp in the paper (equation 1).
 * Returns a value in [-1, 1]; higher = more similar.
 */
const cosineSimilarity = (a, b) => {
  const dot  = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
};

/**
 * Cosine DISTANCE = 1 - cosine similarity.
 * Used so that "lower = better match" (cost matrix convention).
 */
const cosineDistance = (a, b) => 1 - cosineSimilarity(a, b);

/**
 * IoU (Intersection over Union) between two bounding boxes.
 * Used in the IoU-fallback matching step (Algorithm 1, line 12).
 * Box format: [x, y, w, h]
 */
const iou = (boxA, boxB) => {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;
  const interX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const interY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const interArea = interX * interY;
  const unionArea  = aw * ah + bw * bh - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// HUNGARIAN ALGORITHM  (equation 5 in the paper)
// Finds the minimum-cost bipartite matching between tracks and detections.
// Returns an array of [trackIdx, detectionIdx] pairs.
// ─────────────────────────────────────────────────────────────────────────────
const hungarian = (costMatrix) => {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;

  // Work on a square matrix padded with zeros
  const size = Math.max(n, m);
  const C = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      (i < n && j < m) ? costMatrix[i][j] : 0
    )
  );

  const u = new Array(size + 1).fill(0); // row potentials
  const v = new Array(size + 1).fill(0); // col potentials
  const p = new Array(size + 1).fill(0); // col → row assignment
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minDist = new Array(size + 1).fill(Infinity);
    const used    = new Array(size + 1).fill(false);
    do {
      used[j0] = true;
      let i0 = p[j0], delta = Infinity, j1;
      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minDist[j]) { minDist[j] = cur; way[j] = j0; }
          if (minDist[j] < delta) { delta = minDist[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minDist[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }

  const matches = [];
  for (let j = 1; j <= size; j++) {
    if (p[j] !== 0 && p[j] - 1 < n && j - 1 < m) {
      matches.push([p[j] - 1, j - 1]); // [trackIdx, detectionIdx]
    }
  }
  return matches;
};

// ─────────────────────────────────────────────────────────────────────────────
// FACESORT PARAMETERS  (tunable)
// ─────────────────────────────────────────────────────────────────────────────
const FACESORT = {
  lambda:   0.7,   // λ  — weight of biometric vs appearance features (eq. 1)
  beta:     0.98,  // β  — weight of appearance/bio cost vs positional cost (eq. 1)
  alpha:    0.9,   // α  — EMA momentum for feature memory update (eq. 2)
  theta:    0.6,   // θ  — global cost gate; inf-out anything above this (eq. 4)
  thetaPos: 0.5,   // θ_pos — spatial gate on C_pos (eq. 3)
  Nmax:     5,     // max consecutive unmatched frames before track deletion
  Ninit:    1,     // frames a tentative track must match before being confirmed
};

// ─────────────────────────────────────────────────────────────────────────────
// FACESORT TRACKER CLASS

//
// Track memory (Φ) stores per-track:
//   Φ_bio   — EMA-averaged face (biometric) embedding
//   Φ_app   — EMA-averaged appearance embedding (we reuse face emb here since
//              the Python service returns one embedding per face; the gating and
//              cost weighting still behave correctly)
//   Φ_pos   — last known bounding box [x, y, w, h]  (simple linear prediction)
//   age     — how many frames it has been active
//   missed  — consecutive frames without a match
//   state   — 'tentative' | 'confirmed'
//   id      — unique track id
//   allBio  — all raw bio embeddings collected (for final averaging)
// ─────────────────────────────────────────────────────────────────────────────
class FaceSORT {
  constructor() {
    this.tracks   = [];   // Φ — active track memory
    this.nextId   = 0;
  }

  // ── Simple linear position prediction (replaces Kalman filter here) ──
  // The paper uses an NSA Kalman filter; we use last-known position since
  // the video clips are short (4 s) and camera is stationary.
  _predictPositions() {
    // No velocity model — position stays the same until updated
  }

  // ── Compute C_bio (eq. 1): cosine distance between stored and detected bio emb ──
  _Cbio(trackBio, detBio) {
    return cosineDistance(trackBio, detBio);
  }

  // ── Compute C_app (eq. 1): cosine distance on appearance features ──
  _Capp(trackApp, detApp) {
    return cosineDistance(trackApp, detApp);
  }

  // ── Compute C_pos (eq. 1): normalised IoU distance ──
  _Cpos(trackPos, detPos) {
    return 1 - iou(trackPos, detPos);
  }

  // ── Build the full cost matrix C (equations 1–4) ──
  _buildCostMatrix(confirmedTracks, detections) {
    const INF = Infinity;
    return confirmedTracks.map(track =>
      detections.map(det => {
        // Spatial gate (eq. 3): skip if positions too far apart
        const cPos = this._Cpos(track.pos, det.bbox);
        if (cPos > FACESORT.thetaPos) return INF;

        // Appearance/bio combined cost (eq. 1, inner formula)
        const cBio = this._Cbio(track.bio, det.bio);
        const cApp = this._Capp(track.app, det.app);
        const cAppBio = FACESORT.lambda * cBio + (1 - FACESORT.lambda) * cApp;

        // Full cost (eq. 1)
        const c = FACESORT.beta * cAppBio + (1 - FACESORT.beta) * cPos;

        // Global threshold gate (eq. 4)
        return c > FACESORT.theta ? INF : c;
      })
    );
  }

  // ── EMA feature update (eq. 2) ──
  _emaUpdate(stored, observed) {
    return stored.map((v, i) => FACESORT.alpha * v + (1 - FACESORT.alpha) * observed[i]);
  }

  // ── Core per-frame update — Algorithm 1 ──
  update(detections) {
    // detections: Array of { bio: float[], app: float[], bbox: [x,y,w,h] }

    // Step 1 (Algorithm 1, line 1): predict positions
    this._predictPositions();

    // Step 2 (line 2): separate confirmed tracks
    const confirmed  = this.tracks.filter(t => t.state === 'confirmed');
    const tentative  = this.tracks.filter(t => t.state === 'tentative');

    let unmatchedDets = [...detections.keys()]; // indices into detections[]
    const matchedTrackIds = new Set();

    // Step 3–11 (lines 3–11): Matching Cascade
    // Iterate from age=1 (most recently matched) up to max age
    const maxAge = confirmed.reduce((mx, t) => Math.max(mx, t.age), 0);

    for (let age = 1; age <= maxAge; age++) {
      if (unmatchedDets.length === 0) break;

      // Subset of confirmed tracks whose age equals current cascade level
      const ageTracks = confirmed.filter(t => t.age === age);
      if (ageTracks.length === 0) continue;

      // Build cost matrix only for this age-level (line 5)
      const subDets = unmatchedDets.map(i => detections[i]);
      const C = this._buildCostMatrix(ageTracks, subDets);

      // Find minimum-cost bipartite matches (line 6, eq. 5)
      // Convert cost matrix to a "profit" matrix by subtracting from Cmax
      const finiteVals = C.flat().filter(v => isFinite(v));
      if (finiteVals.length === 0) continue;
      const Cmax = Math.max(...finiteVals);
      const profitMatrix = C.map(row => row.map(v => isFinite(v) ? Cmax - v : 0));

      const matches = hungarian(profitMatrix);

      // Filter out matches where original cost was INF (gated out)
      const validMatches = matches.filter(([ti, di]) => isFinite(C[ti][di]));

      // Update matched tracks and remove matched detections from pool (line 7)
      for (const [ti, di] of validMatches) {
        const track = ageTracks[ti];
        const det   = detections[unmatchedDets[di]];

        // EMA update of feature memory (eq. 2)
        track.bio = this._emaUpdate(track.bio, det.bio);
        track.app = this._emaUpdate(track.app, det.app);
        track.pos = det.bbox;
        track.age = 1;         // reset age on successful match
        track.missed = 0;
        track.allBio.push(det.bio); // accumulate raw embeddings for final avg

        matchedTrackIds.add(track.id);
      }

      // Remove matched detection indices from unmatched pool
      const matchedDetLocal = new Set(validMatches.map(([, di]) => di));
      unmatchedDets = unmatchedDets.filter((_, idx) => !matchedDetLocal.has(idx));
    }

    // Step 12 (line 12): IoU fallback for remaining unmatched detections
    if (unmatchedDets.length > 0) {
      const unmatchedTracks = [
        ...confirmed.filter(t => !matchedTrackIds.has(t.id)),
        ...tentative,
      ];

      if (unmatchedTracks.length > 0) {
        const iouMatrix = unmatchedTracks.map(track =>
          unmatchedDets.map(di => 1 - iou(track.pos, detections[di].bbox))
        );

        const finiteVals = iouMatrix.flat().filter(v => isFinite(v));
        if (finiteVals.length > 0) {
          const Cmax = Math.max(...finiteVals);
          const profit = iouMatrix.map(row => row.map(v => isFinite(v) ? Cmax - v : 0));
          const iouMatches = hungarian(profit).filter(([ti, di]) => iouMatrix[ti][di] < 0.7);

          for (const [ti, di] of iouMatches) {
            const track = unmatchedTracks[ti];
            const det   = detections[unmatchedDets[di]];
            track.bio = this._emaUpdate(track.bio, det.bio);
            track.app = this._emaUpdate(track.app, det.app);
            track.pos = det.bbox;
            track.age = 1;
            track.missed = 0;
            track.allBio.push(det.bio);
            matchedTrackIds.add(track.id);
            unmatchedDets = unmatchedDets.filter(idx => idx !== unmatchedDets[di]);
          }
        }
      }
    }

    // Step 13 (line 13): update Φ_bio and Φ_app for ALL detections
    // (already done above per match; new detections create new tentative tracks)

    // Increment age and missed count for unmatched confirmed/tentative tracks
    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.id)) {
        track.missed++;
        track.age++;
      }
    }

    // Promote tentative tracks that have matched enough times
    for (const track of this.tracks) {
      if (track.state === 'tentative' && track.allBio.length >= FACESORT.Ninit) {
        track.state = 'confirmed';
      }
    }

    // Delete tracks that exceeded Nmax consecutive misses
    this.tracks = this.tracks.filter(t => t.missed <= FACESORT.Nmax);

    // Create new tentative tracks for unmatched detections
    for (const di of unmatchedDets) {
      const det = detections[di];
      this.tracks.push({
        id:     this.nextId++,
        state:  'tentative',
        bio:    [...det.bio],
        app:    [...det.app],
        pos:    det.bbox,
        age:    1,
        missed: 0,
        allBio: [det.bio],   // start collecting embeddings immediately
      });
    }
  }

  
  getAveragedEmbeddings() {
    return this.tracks
      .filter(t => t.state === 'confirmed' && t.allBio.length > 0)
      .map(track => {
        const len = track.allBio.length;
        const avg = track.allBio[0].map((_, i) =>
          track.allBio.reduce((sum, emb) => sum + emb[i], 0) / len
        );
        return { trackId: track.id, embedding: avg, frameCount: len };
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

export const markAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No video uploaded' });
    }

    const fullPath = path.resolve(file.path).replace(/\\/g, '/');

   const PYTHON_URL = process.env.PYTHON_SERVER_URL || "http://localhost:8000";
    const pyResponse = await axios.post(`${PYTHON_URL}/attendance`, {
      videoPath: fullPath,
    });

    const frames = pyResponse.data.frames;

    if (!frames || frames.length === 0) {
      return res.status(400).json({ error: 'No embeddings found' });
    }

    
    const tracker = new FaceSORT();

    for (const frame of frames) {
      
      const dets = (frame.detections || []).map(d => ({
        bio:  d.bio  || d.embedding,
        app:  d.app  || d.bio || d.embedding, 
        bbox: d.bbox || [0, 0, 1, 1],
      }));

      tracker.update(dets); // Algorithm 1
    }

    
    const trackedFaces = tracker.getAveragedEmbeddings();

    if (trackedFaces.length === 0) {
      return res.status(400).json({ error: 'No embeddings found' });
    }

    console.log(`FaceSORT produced ${trackedFaces.length} unique face track(s)`);

    // ── 4. Match averaged track embeddings against enrolled students ─────────
    const enrollments = await Enrollment.find({ course: courseId });

    const presentStudents = [];

    for (const face of trackedFaces) {
      let bestSim   = -1;
      let bestEnroll = null;

      for (const enrollment of enrollments) {
        const sim = cosineSimilarity(face.embedding, enrollment.embedding);
        console.log(`Track ${face.trackId} vs ${enrollment.studentId}: sim=${sim.toFixed(3)}`);

        if (sim > bestSim) {
          bestSim    = sim;
          bestEnroll = enrollment;
        }
      }

      // Threshold: only accept matches with cosine similarity > 0.5
      if (bestSim > 0.5 && bestEnroll) {
        const student = await Student.findOne({ studentId: bestEnroll.studentId });
        if (student) {
          presentStudents.push({
            studentId:  student.studentId,
            name:       student.name,
            similarity: bestSim,
            frameCount: face.frameCount,
          });
        }
      }
    }

    // ── 5. De-duplicate (one student may have been tracked multiple times) ──
    const unique = {};
    presentStudents.forEach(s => {
      if (!unique[s.studentId] || s.similarity > unique[s.studentId].similarity) {
        unique[s.studentId] = s;
      }
    });

    // ── 6. Write attendance to DB ───────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const presentIds = new Set(Object.keys(unique));
    const students   = await Student.find();

    const bulkOps = students.map(student => ({
      updateOne: {
        filter: { studentId: student.studentId, courseId, date: today },
        update: { $set: { status: presentIds.has(String(student.studentId)) ? 'present' : 'absent' } },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(bulkOps);

    res.json({
      present:       Object.values(unique),
      totalTracks:   trackedFaces.length,
      totalFrames:   frames.length,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};