import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import XLSX from 'xlsx';

export default function TeacherDashboard({ teacherPhone }) {
  const router = useRouter();
  const { setUser } = useAuth();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Track which course is currently downloading (by course._id), null = none
  const [downloadingCourseId, setDownloadingCourseId] = useState(null);

  // ── FETCH COURSES ──────────────────────────────────────────────────────────
  const fetchCourses = async () => {
    try {
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/teachers/courses/${teacherPhone}`
      );
      setCourses(res.data);
    } catch (err) {
      console.log('Error fetching courses:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teacherPhone) {
      fetchCourses();
    }
  }, [teacherPhone]);

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          setUser(null);
          router.replace('/');
        },
      },
    ]);
  };

  // ── DOWNLOAD BELOW-75% ATTENDANCE EXCEL ───────────────────────────────────
  const handleDownloadBelow75 = async (course) => {
    setDownloadingCourseId(course._id);
    try {
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/attendance/below75/${course._id}`
      );

      const students = res.data; // [{ studentId, name, attendancePercentage, presentDays, totalDays }]

      if (!students || students.length === 0) {
        Alert.alert('All Clear!', `No student in "${course.name}" has attendance below 75%.`);
        return;
      }

      // Build worksheet data
      const wsData = [
        [`Course: ${course.name}`],
        [`Report generated: ${new Date().toLocaleDateString('en-IN')}`],
        [],
        ['#', 'Student ID', 'Name', 'Present Days', 'Total Days', 'Attendance %'],
        ...students.map((s, i) => [
          i + 1,
          s.studentId,
          s.name,
          s.presentDays,
          s.totalDays,
          `${s.attendancePercentage.toFixed(1)}%`,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths
      ws['!cols'] = [
        { wch: 4 },
        { wch: 14 },
        { wch: 28 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Below 75%');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const safeCourseName = course.name.replace(/[^a-z0-9]/gi, '_');
      const fileUri = `${FileSystem.documentDirectory}${safeCourseName}_below75.xlsx`;

      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `${course.name} — Below 75% Attendance`,
        UTI: 'com.microsoft.excel.xlsx',
      });
    } catch (err) {
      console.log('Download error:', err.message);
      Alert.alert('Error', 'Failed to download attendance report.');
    } finally {
      setDownloadingCourseId(null);
    }
  };

  // ── RENDER COURSE CARD ─────────────────────────────────────────────────────
  const renderCourse = ({ item }) => {
    const isDownloading = downloadingCourseId === item._id;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/camera/${item._id}`)}
        style={{
          backgroundColor: '#FFFFFF',
          padding: 18,
          marginBottom: 16,
          borderRadius: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 5,
          borderWidth: 1,
          borderColor: '#EEF2FF',
        }}
      >
        <Text
          style={{
            color: '#111827',
            fontSize: 20,
            fontWeight: '700',
          }}
        >
          {item.name}
        </Text>

        {/* Action buttons row */}
        <View
          style={{
            flexDirection: 'row',
            marginTop: 14,
            gap: 10,
          }}
        >
          {/* Mark Attendance */}
          <TouchableOpacity
            onPress={() => router.push(`/camera/${item._id}`)}
            activeOpacity={0.85}
            style={{
              flex: 1,
              backgroundColor: '#2563EB',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              Mark Attendance →
            </Text>
          </TouchableOpacity>

          {/* Below 75% Download */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDownloadBelow75(item);
            }}
            activeOpacity={0.85}
            disabled={isDownloading}
            style={{
              flex: 1,
              backgroundColor: isDownloading ? '#FEE2E2' : '#FFF1F1',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#FECACA',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Text style={{ fontSize: 13 }}>⬇</Text>
                <Text
                  style={{
                    color: '#EF4444',
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  Below 75%
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F9FF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" />

      {/* HEADER */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 20,
        }}
      >
        <Text
          style={{
            fontSize: 30,
            fontWeight: '800',
            color: '#111827',
          }}
        >
          Teacher Dashboard
        </Text>
        <Text style={{ color: '#6B7280', marginTop: 6, fontSize: 15 }}>
          Select a course to mark attendance
        </Text>
      </View>

      {/* TOP BAR */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginBottom: 18,
        }}
      >
        <View
          style={{
            backgroundColor: '#DBEAFE',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#2563EB', fontWeight: '700' }}>
            {courses.length} Courses
          </Text>
        </View>

        {/* LOGOUT */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#E5E7EB',
          }}
        >
          <Text style={{ color: '#EF4444', fontWeight: '700' }}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item._id}
          renderItem={renderCourse}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 30,
          }}
          ListEmptyComponent={
            <View style={{ marginTop: 80, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 16 }}>
                No courses assigned
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}