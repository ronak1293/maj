// components/StudentDashboard.jsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

import axios from "axios";
import { router } from "expo-router";

export default function StudentDashboard({ studentId }) {

  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudent();
  }, []);

  const fetchStudent = async () => {
    try {

      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/students/${studentId}`
      );

      setStudent(res.data.student);

      const enrolledCourses =
        res.data.enrollments.map((e) => e.course);

      setCourses(enrolledCourses);

    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const openCourse = (course) => {

    router.push({
      pathname: "/courseAttendance",
      params: {
        studentId,
        courseId: course._id,
        courseName: course.name,
      },
    });
  };

  const logout = () => {
    router.replace("/");
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#5B8DEF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* TOP BAR */}
      <View style={styles.topBar}>

        <View>
          <Text style={styles.title}>
            Welcome
          </Text>

          <Text style={styles.name}>
            {student?.name}
          </Text>

          <Text style={styles.id}>
            Student ID: {student?.studentId}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={logout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>
            Logout
          </Text>
        </TouchableOpacity>

      </View>

      {/* SECTION */}
      <Text style={styles.sectionTitle}>
        Enrolled Courses
      </Text>

      <FlatList
        data={courses}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 40,
        }}
        renderItem={({ item, index }) => (

          <TouchableOpacity
            style={styles.courseCard}
            onPress={() => openCourse(item)}
            activeOpacity={0.85}
          >

            <View style={styles.courseLeft}>

              <View style={styles.indexCircle}>
                <Text style={styles.indexText}>
                  {index + 1}
                </Text>
              </View>

              <View>

                <Text style={styles.courseName}>
                  {item.name}
                </Text>

                <Text style={styles.teacher}>
                  {item.teacherName}
                </Text>

              </View>

            </View>

            <Text style={styles.arrow}>
              →
            </Text>

          </TouchableOpacity>

        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
    paddingHorizontal: 20,
    paddingTop: 25,
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FB",
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 35,
  },

  title: {
    fontSize: 18,
    color: "#777",
  },

  name: {
    fontSize: 34,
    fontWeight: "700",
    color: "#222",
    marginTop: 5,
  },

  id: {
    fontSize: 15,
    color: "#777",
    marginTop: 6,
  },

  logoutBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  logoutText: {
    color: "#E53935",
    fontWeight: "600",
    fontSize: 15,
  },

  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#222",
    marginBottom: 20,
  },

  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,

    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },

  courseLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  indexCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EEF3FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },

  indexText: {
    color: "#5B8DEF",
    fontWeight: "700",
    fontSize: 18,
  },

  courseName: {
    fontSize: 21,
    fontWeight: "700",
    color: "#222",
  },

  teacher: {
    marginTop: 6,
    color: "#777",
    fontSize: 15,
  },

  arrow: {
    fontSize: 26,
    color: "#999",
  },
});