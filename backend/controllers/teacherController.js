import Course from '../models/Course.js';

//  LOGIN (verify teacher exists)
export const loginTeacher = async (req, res) => {
  try {
    const { phone } = req.body;

    const teacherCourses = await Course.find({
      teacherPhone: phone
    });

    if (teacherCourses.length === 0) {
      return res.status(404).json({
        error: "Teacher not found"
      });
    }

    res.json({
      message: "Login successful",
      teacherPhone: phone,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//  GET COURSES FOR TEACHER
export const getTeacherCourses = async (req, res) => {
  try {
    const { phone } = req.params;

    const courses = await Course.find({
      teacherPhone: phone
    });

    res.json(courses);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};