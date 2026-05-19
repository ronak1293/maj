import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import React from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.js';

export default function AdminDashboard() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch courses
  const fetchCourses = async () => {
    try {
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/courses`
      );
      setCourses(res.data);
    } catch (err) {
      console.log('Error fetching courses:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Refresh on focus
  useFocusEffect(
    React.useCallback(() => {
      fetchCourses();
    }, [])
  );

  // Logout
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
    <View
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
          marginBottom: 8,
        }}
      >
        {item.name}
      </Text>

      <Text
        style={{
          color: '#6B7280',
          fontSize: 15,
          marginBottom: 4,
        }}
      >
        Teacher: {item.teacherName}
      </Text>

      <Text
        style={{
          color: '#6B7280',
          fontSize: 15,
        }}
      >
        Phone: {item.teacherPhone}
      </Text>

      <TouchableOpacity
        onPress={() => router.push(`/upload/${item._id}`)}
        activeOpacity={0.85}
        style={{
          marginTop: 16,
          backgroundColor: '#2563EB',
          paddingVertical: 13,
          borderRadius: 12,
          alignItems: 'center',
          shadowColor: '#2563EB',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontWeight: '600',
            fontSize: 15,
          }}
        >
          Upload Student Photos
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#F5F9FF',
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" />

      {/* Header */}
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
          Admin Dashboard
        </Text>

        <Text
          style={{
            color: '#6B7280',
            marginTop: 6,
            fontSize: 15,
          }}
        >
          Manage courses and student uploads
        </Text>
      </View>

      {/* Top Buttons */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          marginBottom: 20,
        }}
      >
        {/* Add Course */}
        <TouchableOpacity
          onPress={() => router.push('/add-course')}
          activeOpacity={0.85}
          style={{
            flex: 1,
            backgroundColor: '#2563EB',
            paddingVertical: 14,
            borderRadius: 14,
            marginRight: 10,
            alignItems: 'center',
            shadowColor: '#2563EB',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            + Add Course
          </Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 20,
            justifyContent: 'center',
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

      {/* Loading */}
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
        />
      )}
    </SafeAreaView>
  );
}