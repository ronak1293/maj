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

export default function TeacherDashboard({ teacherPhone }) {
  const router = useRouter();
  const { setUser } = useAuth();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // FETCH COURSES
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

  // LOGOUT
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

  const renderCourse = ({ item }) => (
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

      <View
        style={{
          marginTop: 14,
          alignSelf: 'flex-start',
          backgroundColor: '#2563EB',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 12,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontWeight: '600',
            fontSize: 14,
          }}
        >
          Mark Attendance →
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#F5F9FF',
      }}
    >
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

        <Text
          style={{
            color: '#6B7280',
            marginTop: 6,
            fontSize: 15,
          }}
        >
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
          <Text
            style={{
              color: '#2563EB',
              fontWeight: '700',
            }}
          >
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
          <Text
            style={{
              color: '#EF4444',
              fontWeight: '700',
            }}
          >
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {loading ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
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
            <View
              style={{
                marginTop: 80,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#9CA3AF',
                  fontSize: 16,
                }}
              >
                No courses assigned
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}