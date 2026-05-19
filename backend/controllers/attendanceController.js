import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import axios from 'axios';
import Attendance from '../models/Attendance.js';
import FormData from 'form-data';

// ─────────────────────────────────────────────────────────────────────────────
// All your existing helpers stay exactly the same
// ─────────────────────────────────────────────────────────────────────────────

const cosineSimilarity = (a, b) => {
  const dot  = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
};

const cosineDistance = (a, b) => 1 - cosineSimilarity(a, b);

const iou = (boxA, boxB) => {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;
  const interX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const interY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  const interArea = interX * interY;
  const unionArea  = aw * ah + bw * bh - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
};

const hungarian = (costMatrix) => {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;
  const size = Math.max(n, m);
  const C = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      (i < n && j < m) ? costMatrix[i][j] : 0
    )
  );
  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0);
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
      matches.push([p[j] - 1, j - 1]);
    }
  }
  return matches;
};

const FACESORT = {
  lambda:   0.7,
  beta:     0.98,
  alpha:    0.9,
  theta:    0.6,
  thetaPos: 0.5,
  Nmax:     5,
  Ninit:    1,
};

class FaceSORT {
  constructor() {
    this.tracks = [];
    this.nextId = 0;
  }

  _predictPositions() {}

  _Cbio(trackBio, detBio) { return cosineDistance(trackBio, detBio); }
  _Capp(trackApp, detApp) { return cosineDistance(trackApp, detApp); }
  _Cpos(trackPos, detPos) { return 1 - iou(trackPos, detPos); }

  _buildCostMatrix(confirmedTracks, detections) {
    const INF = Infinity;
    return confirmedTracks.map(track =>
      detections.map(det => {
        const cPos = this._Cpos(track.pos, det.bbox);
        if (cPos > FACESORT.thetaPos) return INF;
        const cBio = this._Cbio(track.bio, det.bio);
        const cApp = this._Capp(track.app, det.app);
        const cAppBio = FACESORT.lambda * cBio + (1 - FACESORT.lambda) * cApp;
        const c = FACESORT.beta * cAppBio + (1 - FACESORT.beta) * cPos;
        return c > FACESORT.theta ? INF : c;
      })
    );
  }

  _emaUpdate(stored, observed) {
    return stored.map((v, i) =>
      FACESORT.alpha * v + (1 - FACESORT.alpha) * observed[i]
    );
  }

  update(detections) {
    this._predictPositions();
    const confirmed = this.tracks.filter(t => t.state === 'confirmed');
    const tentative = this.tracks.filter(t => t.state === 'tentative');
    let unmatchedDets = [...detections.keys()];
    const matchedTrackIds = new Set();
    const maxAge = confirmed.reduce((mx, t) => Math.max(mx, t.age), 0);

    for (let age = 1; age <= maxAge; age++) {
      if (unmatchedDets.length === 0) break;
      const ageTracks = confirmed.filter(t => t.age === age);
      if (ageTracks.length === 0) continue;
      const subDets = unmatchedDets.map(i => detections[i]);
      const C = this._buildCostMatrix(ageTracks, subDets);
      const finiteVals = C.flat().filter(v => isFinite(v));
      if (finiteVals.length === 0) continue;
      const Cmax = Math.max(...finiteVals);
      const profitMatrix = C.map(row =>
        row.map(v => isFinite(v) ? Cmax - v : 0)
      );
      const matches = hungarian(profitMatrix);
      const validMatches = matches.filter(([ti, di]) => isFinite(C[ti][di]));
      for (const [ti, di] of validMatches) {
        const track = ageTracks[ti];
        const det   = detections[unmatchedDets[di]];
        track.bio = this._emaUpdate(track.bio, det.bio);
        track.app = this._emaUpdate(track.app, det.app);
        track.pos = det.bbox;
        track.age = 1;
        track.missed = 0;
        track.allBio.push(det.bio);
        matchedTrackIds.add(track.id);
      }
      const matchedDetLocal = new Set(validMatches.map(([, di]) => di));
      unmatchedDets = unmatchedDets.filter((_, idx) =>
        !matchedDetLocal.has(idx)
      );
    }

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
          const profit = iouMatrix.map(row =>
            row.map(v => isFinite(v) ? Cmax - v : 0)
          );
          const iouMatches = hungarian(profit).filter(
            ([ti, di]) => iouMatrix[ti][di] < 0.7
          );
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

    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.id)) {
        track.missed++;
        track.age++;
      }
    }
    for (const track of this.tracks) {
      if (track.state === 'tentative' && track.allBio.length >= FACESORT.Ninit) {
        track.state = 'confirmed';
      }
    }
    this.tracks = this.tracks.filter(t => t.missed <= FACESORT.Nmax);
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
        allBio: [det.bio],
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
// CONTROLLER — only this function changes significantly
// ─────────────────────────────────────────────────────────────────────────────

export const markAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No video uploaded' });
    }

    const PYTHON_URL = process.env.PYTHON_SERVER_URL || "http://localhost:8000";

    // Send video buffer directly to Python — no disk save
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname || 'classroom.mp4',
      contentType: file.mimetype || 'video/mp4',
    });

    const pyResponse = await axios.post(
      `${PYTHON_URL}/attendance`,
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        // video processing takes time — give it 3 minutes
        timeout: 180000,
      }
    );

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
      tracker.update(dets);
    }

    const trackedFaces = tracker.getAveragedEmbeddings();

    if (trackedFaces.length === 0) {
      return res.status(400).json({ error: 'No embeddings found' });
    }

    console.log(`FaceSORT produced ${trackedFaces.length} unique face track(s)`);

    const enrollments = await Enrollment.find({ course: courseId });
    const presentStudents = [];

    for (const face of trackedFaces) {
      let bestSim    = -1;
      let bestEnroll = null;

      for (const enrollment of enrollments) {
        const sim = cosineSimilarity(face.embedding, enrollment.embedding);
        console.log(
          `Track ${face.trackId} vs ${enrollment.studentId}: sim=${sim.toFixed(3)}`
        );
        if (sim > bestSim) {
          bestSim    = sim;
          bestEnroll = enrollment;
        }
      }

      if (bestSim > 0.5 && bestEnroll) {
        const student = await Student.findOne({
          studentId: bestEnroll.studentId
        });
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

    const unique = {};
    presentStudents.forEach(s => {
      if (!unique[s.studentId] ||
          s.similarity > unique[s.studentId].similarity) {
        unique[s.studentId] = s;
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const presentIds = new Set(Object.keys(unique));
    const students   = await Student.find();

    const bulkOps = students.map(student => ({
      updateOne: {
        filter: { studentId: student.studentId, courseId, date: today },
        update: {
          $set: {
            status: presentIds.has(String(student.studentId))
              ? 'present'
              : 'absent'
          }
        },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(bulkOps);

    res.json({
      present:     Object.values(unique),
      totalTracks: trackedFaces.length,
      totalFrames: frames.length,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};