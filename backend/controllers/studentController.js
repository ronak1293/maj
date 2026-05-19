import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import Attendance from '../models/Attendance.js';
import axios from 'axios';
import FormData from 'form-data';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — send image buffer to Python /embed endpoint
// Instead of passing a file path, we POST the raw image bytes
// ─────────────────────────────────────────────────────────────────────────────
const getEmbeddingFromBuffer = async (buffer, filename) => {
  const PYTHON_URL = process.env.PYTHON_SERVER_URL || "http://localhost:8000";

  const formData = new FormData();
  formData.append('file', buffer, {
    filename: filename || 'image.jpg',
    contentType: 'image/jpeg',
  });

  const response = await axios.post(`${PYTHON_URL}/embed`, formData, {
    headers: formData.getHeaders(),
  });

  return response.data.embedding;
};


export const uploadStudents = async (req, res) => {
  try {
    console.log("received");

    const { courseId } = req.params;
    const { studentIds, names } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    if (!studentIds || !names) {
      return res.status(400).json({ error: "Missing student data" });
    }

    const studentIdsArr = Array.isArray(studentIds) ? studentIds : [studentIds];
    const namesArr = Array.isArray(names) ? names : [names];

    if (files.length !== studentIdsArr.length) {
      return res.status(400).json({
        error: "Mismatch between images and studentIds"
      });
    }

    const savedStudents = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const studentId = studentIdsArr[i];
      const name = namesArr[i];

      // file.buffer contains the image in memory — no disk involved
      const embedding = await getEmbeddingFromBuffer(
        file.buffer,
        file.originalname
      );

      if (!embedding || embedding.length === 0) {
        console.log(`No face found for student ${studentId}, skipping`);
        continue;
      }

      let student = await Student.findOne({ studentId });

      if (!student) {
        student = await Student.create({ studentId, name });
      }

      const enrollment = await Enrollment.create({
        studentId,
        course: courseId,
        embedding,
        // no imageUrl stored since we are not saving to disk
      });

      savedStudents.push({ student, enrollment });
    }

    res.json({
      message: "Students processed successfully",
      count: savedStudents.length,
      students: savedStudents,
    });

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
};


export const getStudentCourses = async (req, res) => {
  try {
    const { studentId } = req.params;

    const enrollments = await Enrollment.find({ studentId }).populate("course");

    if (!enrollments || enrollments.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const courseMap = {};
    enrollments.forEach(e => {
      if (e.course) {
        courseMap[e.course._id] = e.course;
      }
    });

    res.json({
      studentId,
      courses: Object.values(courseMap)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getAttendanceStats = async (req, res) => {
  try {
    const { studentId, courseId } = req.params;

    const records = await Attendance.find({
      studentId,
      courseId
    }).sort({ date: 1 });

    const total = records.length;
    const present = records.filter(r => r.status === "present").length;
    const absent = total - present;
    const percentage = total === 0
      ? 0
      : ((present / total) * 100).toFixed(2);

    res.json({ totalClasses: total, present, absent, percentage, records });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const getStudentDetails = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ studentId });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const enrollments = await Enrollment.find({ studentId }).populate("course");

    res.json({
      student: {
        studentId: student.studentId,
        name: student.name,
      },
      enrollments
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};