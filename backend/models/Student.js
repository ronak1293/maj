// Student.js
import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
  },

  name: {
    type: String,
    required: true,
  },
}, { timestamps: true });

export default mongoose.model('Student', studentSchema);