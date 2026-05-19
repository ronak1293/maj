import { useLocalSearchParams } from 'expo-router';
import AdminDashboard from '../components/Admindashboard';
import TeacherDashboard from '../components/Teacherdashboard';
import axios from 'axios';
import StudentDashboard from '../components/Studentdashboard';

export default function Dashboard() {
  const { role, phone,studentId } = useLocalSearchParams();

  //  FIX: normalize phone
  const phoneValue = Array.isArray(phone) ? phone[0] : phone;

  if (role === 'admin') {
    return <AdminDashboard />;
  }
  else if(role==='teacher') return <TeacherDashboard teacherPhone={phoneValue} />;
  else{
     return <StudentDashboard studentId={studentId} />;
  }
}