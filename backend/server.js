import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import courseRoutes from './routes/courseRoute.js'
import studentRoutes from './routes/studentRoute.js';
import teacherRoutes from './routes/teacherRoute.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use((req, res, next) => {
  console.log("HIT:", req.method, req.url);
  next();
});
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/courses', courseRoutes);
app.use('/students', studentRoutes);
app.use('/teachers', teacherRoutes);
app.use('/attendance', attendanceRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

app.get('/', (req, res) => {
  res.json({ "res": "ok" });
});

// Keep this for local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// This line is what Vercel needs
export default app;