import express from 'express';
import { createCourse, getCourses, getStudentsByCourse, getcourse, deleteCourse } from '../controllers/courseController.js';

const router = express.Router();

router.post('/', createCourse);
router.get('/', getCourses);
router.get('/:courseId', getcourse);
router.get("/course/:courseId/students", getStudentsByCourse);
router.delete('/:courseId', deleteCourse);

export default router;