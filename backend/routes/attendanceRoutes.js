import express from 'express';
import multer from 'multer';
import { markAttendance } from '../controllers/attendanceController.js';

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post('/mark/:courseId', upload.single('image'), markAttendance);

export default router;