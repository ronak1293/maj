import express from 'express';
import { loginTeacher, getTeacherCourses } from '../controllers/teacherController.js';

const router = express.Router();

router.post('/login', loginTeacher);
router.get('/courses/:phone', getTeacherCourses);

export default router;