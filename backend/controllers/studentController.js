import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';
import Attendance from '../models/Attendance.js';
import { getEmbedding } from '../services/faceService.js';
import path from 'path';

export const uploadStudents = async (req, res) => {
  try {
    console.log("recieved");
    
    const { courseId } = req.params;

    const { studentIds, names } = req.body;
    const files = req.files;
    console.log(studentIds);
    

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    if (!studentIds || !names) {
      return res.status(400).json({ error: "Missing student data" });
    }

    const studentIdsArr = Array.isArray(studentIds)
      ? studentIds
      : [studentIds];

    const namesArr = Array.isArray(names)
      ? names
      : [names];

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

      let fullPath = path.resolve(file.path);
      fullPath = fullPath.replace(/\\/g, '/');

      const embedding = await getEmbedding(fullPath);

      if (!embedding || embedding.length === 0) {
        continue;
      }

      // changed here
      let student = await Student.findOne({ studentId });

      // changed here
      if (!student) {
        student = await Student.create({
          studentId,
          name,
        });
      }

      // changed here
      const enrollment = await Enrollment.create({
        studentId,
        course: courseId,
        embedding,
        imageUrl: fullPath,
      });

      savedStudents.push({
        student,
        enrollment
      });
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

    // changed here
    const enrollments = await Enrollment.find({
      studentId
    }).populate("course");

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
      studentId: studentId,
      courseId: courseId
    }).sort({ date: 1 });

    const total = records.length;

    const present = records.filter(
      r => r.status === "present"
    ).length;

    const absent = total - present;

    const percentage =
      total === 0
        ? 0
        : ((present / total) * 100).toFixed(2);

    res.json({
      totalClasses: total,
      present,
      absent,
      percentage,
      records
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
};


export const getStudentDetails = async (req, res) => {
  try {

    const { studentId } = req.params;

    // get student basic info
    const student = await Student.findOne({ studentId });

    if (!student) {
      return res.status(404).json({
        error: "Student not found"
      });
    }

    // get all enrollments + courses
    const enrollments = await Enrollment.find({
      studentId
    }).populate("course");

    res.json({
      student: {
        studentId: student.studentId,
        name: student.name,
      },

      enrollments
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};