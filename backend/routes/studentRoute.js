// routes/studentRoutes.js
import express from 'express';
import { upload } from '../middleware/upload.js';
import { uploadStudents } from '../controllers/studentController.js';
import { getAttendanceStats } from '../controllers/studentController.js';
import { getStudentDetails } from '../controllers/studentController.js';
import { getStudentCourses } from '../controllers/studentController.js';
const router = express.Router();

router.post(
  '/upload/:courseId',
  upload.array('images'),
  uploadStudents
);
router.get(
  "/:studentId/attendance/:courseId",
  getAttendanceStats
);
router.get('/courses/:studentId',getStudentCourses);
router.get('/:studentId',getStudentDetails);


export default router;