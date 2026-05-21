import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import courseRoutes from './routes/courseRoute.js';
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// REMOVE this line — no disk on Vercel
// app.use('/uploads', express.static('uploads'));

app.use('/courses', courseRoutes);
app.use('/students', studentRoutes);
app.use('/teachers', teacherRoutes);
app.use('/attendance', attendanceRoutes);

// MongoDB — connect once, reuse across serverless invocations
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  await mongoose.connect('mongodb+srv://ronak:1293@cluster0.mhetmzm.mongodb.net/attendance');
  isConnected = true;
  console.log("MongoDB connected");
};

connectDB().catch(err => console.log("MongoDB error:", err));

app.get('/', (req, res) => {
  res.json({ res: "ok" });
});

// Only listen locally — Vercel handles this in production
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// This is what Vercel actually uses
export default app;