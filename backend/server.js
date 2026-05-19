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
  console.log(" HIT:", req.method, req.url);
  next();
});
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/courses', courseRoutes);
app.use('/students', studentRoutes);
app.use('/teachers', teacherRoutes);
app.use('/attendance', attendanceRoutes);
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log(err));
const PORT = process.env.PORT || 3000;
app.get('/',(req,res)=>{
  res.json({
    "res":"ok"
  })
})
app.listen(PORT, () => {
  console.log("🚀 Server running on port 5000");
});