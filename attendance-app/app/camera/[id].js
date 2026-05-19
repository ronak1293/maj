import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import axios from 'axios';
import { Platform } from 'react-native';

import { exportAttendanceToExcel } from '../../utils/excel';

const RECORD_DURATION = 4000; // ms

export default function CameraScreen() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();
  const [course, setCourse] = useState(null);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const res = await axios.get(
          `${process.env.EXPO_PUBLIC_API_URL}/courses/${id}`
        );
        setCourse(res.data);
        navigation.setOptions({ title: `${res.data.name} — Attendance` });
      } catch (err) {
        console.log("Course fetch error:", err.message);
      }
    };
    fetchCourse();
  }, [id, navigation]);

  const cameraRef = useRef(null);
  const stopTimerRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [phase, setPhase] = useState('preview'); // 'preview' | 'recording' | 'processing' | 'result'
  const [countdown, setCountdown] = useState(RECORD_DURATION / 1000);
  const [records, setRecords] = useState([]);
  const [downloading, setDownloading] = useState(false);

  // pulse animation for recording dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // countdown tick while recording
  useEffect(() => {
    if (phase !== 'recording') {
      setCountdown(RECORD_DURATION / 1000);
      return;
    }
    setCountdown(RECORD_DURATION / 1000);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // cleanup timer on unmount
  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
  }, []);

  const accent = course?.accentColor ?? '#4F6EF7';
  const today = new Date().toLocaleDateString('en-IN');

  useEffect(() => {
    if (course) {
      navigation.setOptions({ title: `${course.name} — Attendance` });
    }
  }, [course, navigation]);

  const handleCapture = async () => {
  if (!cameraRef.current || phase !== 'preview') return;

  try {
    const camera = cameraRef.current;

    setPhase('recording');

    await new Promise(resolve => setTimeout(resolve, 300));

    const videoPromise = camera.recordAsync({ maxDuration: RECORD_DURATION / 1000 });

    stopTimerRef.current = setTimeout(() => {
      try { camera.stopRecording(); } catch (_) {}
    }, RECORD_DURATION);

    const video = await videoPromise;

    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (!video?.uri) {
      throw new Error('No video captured. Please try again.');
    }

    setPhase('processing');

    // ── Step 1: send video directly to Python ──
    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'android'
        ? video.uri
        : video.uri.replace('file://', ''),
      name: 'attendance.mp4',
      type: 'video/mp4',
    });

    console.log('Sending video to Python...');

    const pyRes = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${process.env.EXPO_PUBLIC_PYTHON_URL}/attendance`);
      xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.response);
          if (xhr.status === 200) {
            resolve(response);
          } else {
            // no faces detected or any other python error → treat as empty
            console.log('Python non-200:', response);
            resolve({ frames: [] });
          }
        } catch {
          resolve({ frames: [] });
        }
      };
      xhr.onerror = () => reject(new Error('Network error reaching Python'));
      xhr.send(formData);
    });

    console.log('Python frames count:', pyRes.frames?.length ?? 'NO FRAMES KEY');

    // ── Step 2: send frames to Vercel to match + save attendance ──
    const res = await axios.post(
      `${process.env.EXPO_PUBLIC_API_URL}/attendance/mark/${id}`,
      { frames: pyRes.frames ?? [] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    // axios wraps response in .data
    const presentIds = (res.data.present ?? []).map((s) => s.studentId);

    const res2 = await axios.get(
      `${process.env.EXPO_PUBLIC_API_URL}/courses/course/${id}/students`
    );

    const students = res2.data;
    const attendance = students.map((s) => ({
      studentId: s.studentId,
      name: s.name,
      status: presentIds.includes(s.studentId) ? 'Present' : 'Absent',
    }));

    setRecords(attendance);
    setPhase('result');

  } catch (e) {
    console.log('ERROR:', e.message);
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    Alert.alert('Error', e.message || 'Failed to process attendance.');
    setPhase('preview');
  }
};

  const handleDownload = async () => {
    if (!course) return;
    setDownloading(true);
    try {
      await exportAttendanceToExcel(course.name, course.name, today, records);
    } catch (e) {
      Alert.alert('Download Failed', e.message ?? 'Unknown error');
    } finally {
      setDownloading(false);
    }
  };

  const handleRetake = () => {
    setRecords([]);
    setPhase('preview');
  };

  // wait until both permissions loaded
  if (!cameraPermission || !micPermission) {
    return <View style={styles.container} />;
  }

  // camera denied
  if (!cameraPermission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <View style={styles.permIconBox}><Text style={styles.permIcon}>📷</Text></View>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>Allow camera access to capture attendance.</Text>
          <TouchableOpacity style={[styles.permBtn, { backgroundColor: accent }]} onPress={requestCameraPermission}>
            <Text style={styles.permBtnText}>Grant Camera Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // mic denied
  if (!micPermission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <View style={styles.permIconBox}><Text style={styles.permIcon}>🎙️</Text></View>
          <Text style={styles.permTitle}>Microphone Access Needed</Text>
          <Text style={styles.permissionText}>
            Android requires microphone permission for video recording, even if no audio is used.
          </Text>
          <TouchableOpacity style={[styles.permBtn, { backgroundColor: accent }]} onPress={requestMicPermission}>
            <Text style={styles.permBtnText}>Grant Microphone Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'processing') {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: '#F7F8FC' }]}>
        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.processingText}>Analysing faces...</Text>
          <Text style={styles.processingSubText}>Matching students against enrolled photos</Text>
        </View>
      </View>
    );
  }

  if (phase === 'result') {
    const present = records.filter((r) => r.status === 'Present').length;
    const absent = records.length - present;
    const attendancePct = records.length > 0 ? Math.round((present / records.length) * 100) : 0;
    const presentStudents = records.filter(r => r.status === 'Present');
    const absentStudents = records.filter(r => r.status === 'Absent');

    return (
      <SafeAreaView style={styles.lightContainer}>
        <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Attendance Report</Text>
            <Text style={styles.resultDate}>{today}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.pctWrapper}>
              <View style={[styles.pctCircle, { borderColor: accent }]}>
                <Text style={[styles.pctNumber, { color: accent }]}>{attendancePct}%</Text>
                <Text style={styles.pctLabel}>Present</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>{present}</Text>
                <Text style={[styles.statPillLabel, { color: '#1A7A4A' }]}>Present</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>{absent}</Text>
                <Text style={[styles.statPillLabel, { color: '#C0392B' }]}>Absent</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>{records.length}</Text>
                <Text style={[styles.statPillLabel, { color: '#555' }]}>Total</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.downloadBtn, { backgroundColor: accent, opacity: downloading ? 0.7 : 1 }]}
              onPress={handleDownload}
              disabled={downloading}
              activeOpacity={0.85}
            >
              {downloading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Text style={styles.downloadIcon}>⬇</Text><Text style={styles.downloadBtnText}>Export Excel</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.7}>
              <Text style={styles.retakeIcon}>📷</Text>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
          </View>

          {presentStudents.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#1A7A4A' }]} />
                <Text style={styles.sectionTitle}>Present ({present})</Text>
              </View>
              {presentStudents.map((r, idx) => (
                <View key={r.studentId} style={[styles.studentRow, idx === presentStudents.length - 1 && styles.studentRowLast]}>
                  <View style={styles.avatarPresent}><Text style={styles.avatarText}>{r.name?.charAt(0)?.toUpperCase() ?? '?'}</Text></View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{r.name}</Text>
                    <Text style={styles.studentId}>{r.studentId}</Text>
                  </View>
                  <View style={styles.statusBadgePresent}><Text style={styles.statusTextPresent}>✓ Present</Text></View>
                </View>
              ))}
            </View>
          )}

          {absentStudents.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#C0392B' }]} />
                <Text style={styles.sectionTitle}>Absent ({absent})</Text>
              </View>
              {absentStudents.map((r, idx) => (
                <View key={r.studentId} style={[styles.studentRow, idx === absentStudents.length - 1 && styles.studentRowLast]}>
                  <View style={styles.avatarAbsent}><Text style={styles.avatarText}>{r.name?.charAt(0)?.toUpperCase() ?? '?'}</Text></View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{r.name}</Text>
                    <Text style={styles.studentId}>{r.studentId}</Text>
                  </View>
                  <View style={styles.statusBadgeAbsent}><Text style={styles.statusTextAbsent}>✗ Absent</Text></View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Camera preview + recording overlay (camera stays mounted) ──
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        ref={cameraRef}
        mode="video"
      />

      {/* Recording overlay — shown on top of camera while recording */}
      {phase === 'recording' && (
        <View style={styles.recordingOverlay}>
          {/* Top pill */}
          <View style={styles.recPill}>
            <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recPillText}>Recording... {countdown}s</Text>
          </View>
        </View>
      )}

      {/* Guide text — only in preview */}
      {phase === 'preview' && (
        <View style={styles.overlay}>
          <Text style={styles.guideText}>Aim at the classroom</Text>
        </View>
      )}

      {/* Capture button area */}
      <View style={styles.captureArea}>
        {phase === 'preview' ? (
          <>
            <TouchableOpacity onPress={handleCapture} style={styles.captureOuter} activeOpacity={0.8}>
              <View style={[styles.captureInner, { backgroundColor: accent }]} />
            </TouchableOpacity>
            <Text style={styles.captureHint}>Tap to record 4 seconds</Text>
          </>
        ) : (
          // While recording show a disabled stop indicator
          <View style={styles.captureOuter}>
            <View style={[styles.captureInnerRecording]} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  lightContainer: { flex: 1, backgroundColor: '#F7F8FC' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // ── permissions ──
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  permIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EEF0FD', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  permIcon: { fontSize: 36 },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  permissionText: { color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  // ── processing ──
  processingCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 40, alignItems: 'center',
    marginHorizontal: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  processingText: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginTop: 20 },
  processingSubText: { fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center' },

  // ── result ──
  resultScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  resultHeader: { marginBottom: 18 },
  resultTitle: { fontSize: 26, fontWeight: '800', color: '#1A1A2E', letterSpacing: -0.5 },
  resultDate: { fontSize: 13, color: '#888', marginTop: 2 },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 24,
    marginBottom: 16, shadowColor: '#6074FF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 4, alignItems: 'center',
  },
  pctWrapper: { marginBottom: 24 },
  pctCircle: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  pctNumber: { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  pctLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  statRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: '#F7F8FC', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
  },
  statPill: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: '#E0E4F0' },
  statPillNum: { fontSize: 22, fontWeight: '800', color: '#1A1A2E' },
  statPillLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  downloadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, gap: 8,
    shadowColor: '#4F6EF7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  downloadIcon: { fontSize: 16, color: '#fff' },
  downloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retakeBtn: {
    flex: 0.55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0E4F0', gap: 6,
  },
  retakeIcon: { fontSize: 15 },
  retakeBtnText: { color: '#444', fontWeight: '600', fontSize: 14 },

  section: {
    backgroundColor: '#fff', borderRadius: 20, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F2F8', gap: 8,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 0.6 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F7F8FC', gap: 14,
  },
  studentRowLast: { borderBottomWidth: 0 },
  avatarPresent: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D6F5E8', alignItems: 'center', justifyContent: 'center' },
  avatarAbsent: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE8E8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#444' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  studentId: { fontSize: 12, color: '#999', marginTop: 1 },
  statusBadgePresent: { backgroundColor: '#D6F5E8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusTextPresent: { fontSize: 11, color: '#1A7A4A', fontWeight: '700' },
  statusBadgeAbsent: { backgroundColor: '#FDE8E8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusTextAbsent: { fontSize: 11, color: '#C0392B', fontWeight: '700' },

  // ── camera preview ──
  overlay: { position: 'absolute', top: '40%', width: '100%', alignItems: 'center' },
  guideText: { color: '#fff', backgroundColor: '#00000066', padding: 10, borderRadius: 10 },
  captureArea: { position: 'absolute', bottom: 60, width: '100%', alignItems: 'center' },
  captureOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30 },
  captureInnerRecording: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#FF3B30' },
  captureHint: { color: '#fff', marginTop: 10, fontSize: 13 },

  // ── recording overlay ──
  recordingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: 60,
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 30,
    gap: 10,
  },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  recPillText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});