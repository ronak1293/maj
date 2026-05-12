import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import axios from 'axios';
import path from 'path';
import Attendance from '../models/Attendance.js';


const cosineSimilarity = (a, b) => {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
};

export const markAttendance = async (req, res) => {
  try {
    const { courseId } = req.params;

    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    let fullPath = path.resolve(file.path).replace(/\\/g, '/');

    const response = await axios.post('http://127.0.0.1:8000/attendance', {
      imagePath: fullPath,
    });

    console.log(response.data.embeddings);

    const detectedEmbeddings = response.data.embeddings;

    if (!detectedEmbeddings) {
      return res.status(400).json({ error: "No embeddings found" });
    }

    const enrollments = await Enrollment.find({
      course: courseId
    });

    const presentStudents = [];

    for (const detected of detectedEmbeddings) {

      for (const enrollment of enrollments) {

        const sim = cosineSimilarity(
          detected,
          enrollment.embedding
        );

        console.log("sim", sim);

        if (sim > 0.5) {

          const student = await Student.findOne({
            studentId: enrollment.studentId
          });

          if (!student) continue;

          presentStudents.push({
            studentId: student.studentId,
            name: student.name,
            similarity: sim,
          });

        }
      }
    }

    const unique = {};

    presentStudents.forEach(s => {
      unique[s.studentId] = s;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const presentIds = new Set(
      Object.keys(unique)
    );

    const students = await Student.find();

    const bulkOps = students.map(student => ({
      updateOne: {
        filter: {
          studentId: student.studentId,
          courseId: courseId,
          date: today
        },

        update: {
          $set: {
            status: presentIds.has(
              String(student.studentId)
            )
              ? "present"
              : "absent"
          }
        },

        upsert: true
      }
    }));

    await Attendance.bulkWrite(bulkOps);

    res.json({
      present: Object.values(unique),
      totalDetected: detectedEmbeddings.length
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
};