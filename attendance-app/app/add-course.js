import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import axios from 'axios';

export default function AddCourse() {
  const router = useRouter();

  const [courseName, setCourseName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddCourse = async () => {
    if (!courseName || !teacherName || !teacherPhone) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    try {
      setLoading(true);

      //  CALL BACKEND
      await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/courses`, {
        name: courseName,
        teacherName,
        teacherPhone,
      });

      Alert.alert('Success', 'Course Added');

      router.back(); // go to dashboard

    } catch (err) {
      console.log(err);
      Alert.alert('Error', 'Failed to add course');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Course</Text>

      <TextInput
        style={styles.input}
        placeholder="Course Name"
        placeholderTextColor="#666"
        value={courseName}
        onChangeText={setCourseName}
      />

      <TextInput
        style={styles.input}
        placeholder="Teacher Name"
        placeholderTextColor="#666"
        value={teacherName}
        onChangeText={setTeacherName}
      />

      <TextInput
        style={styles.input}
        placeholder="Teacher Phone"
        placeholderTextColor="#666"
        value={teacherPhone}
        onChangeText={setTeacherPhone}
        keyboardType="numeric"
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleAddCourse}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            Save Course
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    marginBottom: 20,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#1A1A22',
    padding: 14,
    borderRadius: 10,
    color: '#fff',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
});