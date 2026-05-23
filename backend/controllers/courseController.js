import Course from '../models/Course.js';
import Student from '../models/Student.js';
import Enrollment from '../models/Enrollment.js';

export const createCourse = async (req, res) => {
  try {
    const { name, teacherName, teacherPhone } = req.body;

    const course = await Course.create({
      name,
      teacherName,
      teacherPhone,
    });

    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStudentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // changed here
    const enrollments = await Enrollment.find({ course: courseId });

    const studentIds = enrollments.map(e => e.studentId);

    // changed here
    const students = await Student.find({
      studentId: { $in: studentIds }
    });

    res.json(students);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getcourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);

    res.json(course);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



export const deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Remove the course
    await Course.findByIdAndDelete(courseId);

    // Remove all enrollments associated with this course
    await Enrollment.deleteMany({ course: courseId });

    res.json({ message: 'Course and related enrollments deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};