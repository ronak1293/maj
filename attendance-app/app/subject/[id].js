import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { SUBJECTS } from '../../constants/data';

export default function SubjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const subject = SUBJECTS.find((s) => s.id === id);
  const [studentCount, setStudentCount] = useState(0);

  useEffect(() => {
    if (subject) navigation.setOptions({ title: subject.name });
    loadStudents();
  }, [id]);

  const loadStudents = async () => {
     const res2 = await axios.get(
  `${process.env.EXPO_PUBLIC_API_URL}/courses/course/${id}/students`
);

const students = res2.data;


    setStudentCount(students.length);
  };

  if (!subject) return <View style={styles.container} />;

  const accent = subject.accentColor;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.subjectHeader, { borderColor: accent }]}>
          <View style={[styles.codeBadge, { backgroundColor: accent + '22' }]}>
            <Text style={[styles.codeText, { color: accent }]}>{subject.code}</Text>
          </View>
          <Text style={styles.subjectName}>{subject.name}</Text>
          <Text style={styles.studentCount}>{studentCount} students enrolled</Text>
        </View>

        <Text style={styles.sectionLabel}>ACTIONS</Text>

        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: accent }]}
          onPress={() => router.push({ pathname: '/camera/[id]', params: { id: subject.id } })}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, { backgroundColor: accent + '22' }]}>
            <Text style={{ fontSize: 26 }}>📸</Text>
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Mark Attendance</Text>
            <Text style={styles.actionSubtitle}>Open camera → take photo → auto-mark attendance</Text>
          </View>
          <Text style={[styles.actionArrow, { color: accent }]}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { borderLeftColor: '#888' }]}
          onPress={() => router.push({ pathname: '/upload/[id]', params: { id: subject.id } })}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#88888822' }]}>
            <Text style={{ fontSize: 26 }}>🗂️</Text>
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Upload Student Photos</Text>
            <Text style={styles.actionSubtitle}>Upload images named as studentid.jpg to register faces</Text>
          </View>
          <Text style={[styles.actionArrow, { color: '#888' }]}>›</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ How it works</Text>
          <Text style={styles.infoText}>
            1. Upload student photos named like <Text style={{ color: accent }}>2021CS001.jpg</Text> via Upload section.{'\n'}
            2. Tap <Text style={{ color: accent }}>Mark Attendance</Text>, take a classroom photo.{'\n'}
            3. Attendance is randomly generated until backend is connected.{'\n'}
            4. Download the Excel file from the result screen.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { padding: 24, paddingBottom: 48 },
  subjectHeader: {
    backgroundColor: '#111118', borderRadius: 16, padding: 24,
    borderWidth: 1, marginBottom: 32,
  },
  codeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  codeText: { fontWeight: '800', fontSize: 14, letterSpacing: 2 },
  subjectName: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  studentCount: { fontSize: 13, color: '#555' },
  sectionLabel: { fontSize: 11, color: '#444', letterSpacing: 3, marginBottom: 16 },
  actionCard: {
    backgroundColor: '#111118', borderRadius: 14, padding: 18,
    marginBottom: 14, borderLeftWidth: 3,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#1A1A2A',
  },
  actionIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  actionText: { flex: 1 },
  actionTitle: { color: '#FFF', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  actionSubtitle: { color: '#555', fontSize: 12, lineHeight: 18 },
  actionArrow: { fontSize: 28, marginLeft: 8 },
  infoBox: {
    backgroundColor: '#0D1220', borderRadius: 14, padding: 18,
    marginTop: 12, borderWidth: 1, borderColor: '#1A2A3A',
  },
  infoTitle: { color: '#AAA', fontWeight: '700', fontSize: 14, marginBottom: 10 },
  infoText: { color: '#555', fontSize: 13, lineHeight: 22 },
});