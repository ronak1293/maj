import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';



export async function exportAttendanceToExcel(subjectName, subjectCode, date, records) {
  if (!records || records.length === 0) {
    throw new Error('No attendance records to export');
  }
  
  
  

 
  const sheetData = [
    ['Subject', subjectName],
    ['Code', subjectCode],
    ['Date', date],
    ['Time', new Date().toLocaleTimeString()],
    [],
    ['Student ID', 'Name', 'Status'],
    ...records.map(r => [r.studentId, r.name, r.status]),
    [],
    ['Total Students', records.length],
    ['Present', records.filter(r => r.status === 'Present').length],
    ['Absent', records.filter(r => r.status === 'Absent').length],
  ];

 
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData); 
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  
  const file = new File(Paths.cache, `Attendance_${subjectCode}_${date.replace(/\//g, '-')}.xlsx`);
  file.create({ overwrite: true });

  await file.write(base64, { encoding: 'base64' });

  
  await Sharing.shareAsync(file.uri);
}