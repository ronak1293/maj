import express from 'express';
import multer from 'multer';
import { markAttendance } from '../controllers/attendanceController.js';
import { getBelow75 } from '../controllers/attendanceController.js';
const router = express.Router();


const storage = multer.memoryStorage();
export const upload = multer({ storage });

router.post('/mark/:courseId', upload.single('video'), markAttendance);
router.get('/below75/:courseId', getBelow75);
export default router;