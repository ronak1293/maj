// Enrollment.js
import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    ref: 'Student',
    required: true,
  },

  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },

  embedding: {
    type: [Number],
    required: true,
  },

  imageUrl: String,
}, { timestamps: true });

export default mongoose.model('Enrollment', enrollmentSchema);