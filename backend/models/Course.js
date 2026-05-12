import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teacherName: { type: String, required: true },
  teacherPhone: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Course', courseSchema);