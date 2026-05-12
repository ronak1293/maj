import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: String,   // matches Student.studentId
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId, // matches Course _id
    ref: "Course",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["present", "absent"],
    required: true,
  },
}, {
  timestamps: true
});

// Prevent duplicate attendance (same student + course + date)
attendanceSchema.index(
  { studentId: 1, courseId: 1, date: 1 },
  { unique: true }
);

export default mongoose.model("Attendance", attendanceSchema);