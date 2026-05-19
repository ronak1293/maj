// routes/studentRoutes.js
import express from 'express';
import { uploadStudents } from '../controllers/studentController.js';
import { getAttendanceStats } from '../controllers/studentController.js';
import { getStudentDetails } from '../controllers/studentController.js';
import { getStudentCourses } from '../controllers/studentController.js';
import multer from 'multer';
const router = express.Router();


const storage = multer.memoryStorage();
export const upload = multer({ storage });
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