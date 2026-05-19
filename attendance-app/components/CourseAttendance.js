// app/courseAttendance.jsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { useLocalSearchParams } from "expo-router";
import axios from "axios";
import { Calendar } from "react-native-calendars";

export default function CourseAttendance() {

  const {
    studentId,
    courseId,
    courseName,
  } = useLocalSearchParams();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {

      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/students/${studentId}/attendance/${courseId}`
      );

      setStats(res.data);

    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const getMarkedDates = () => {

  const marked = {};

  stats?.records?.forEach((r) => {

    const d = new Date(r.date);

    const date =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");

    marked[date] = {
      selected: true,
      selectedColor:
        r.status === "present"
          ? "#4CAF50"
          : "#E53935",
    };
  });

  return marked;
};

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#5B8DEF" />
      </View>
    );
  }

  const percentage = Number(stats?.percentage || 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingBottom: 40,
      }}
    >

      {/* COURSE HEADER */}
      <View style={styles.header}>

        <Text style={styles.courseName}>
          {courseName}
        </Text>

        <View
          style={[
            styles.percentCard,
            {
              backgroundColor:
                percentage >= 75
                  ? "#DFF5E1"
                  : "#FFE0E0",
            },
          ]}
        >
          <Text
            style={[
              styles.percentText,
              {
                color:
                  percentage >= 75
                    ? "#2E7D32"
                    : "#C62828",
              },
            ]}
          >
            {percentage}%
          </Text>
        </View>

      </View>

      {/* STATS */}
      <View style={styles.statsRow}>

        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {stats.present}
          </Text>
          <Text style={styles.statLabel}>
            Present
          </Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {stats.absent}
          </Text>
          <Text style={styles.statLabel}>
            Absent
          </Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {stats.totalClasses}
          </Text>
          <Text style={styles.statLabel}>
            Total
          </Text>
        </View>

      </View>

      {/* CALENDAR */}
      <Calendar
        markedDates={getMarkedDates()}
        theme={{
          todayTextColor: "#5B8DEF",
          arrowColor: "#5B8DEF",
        }}
        style={styles.calendar}
      />

      {/* LEGEND */}
      <View style={styles.legendRow}>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: "#4CAF50" },
            ]}
          />
          <Text style={styles.legendText}>
            Present
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: "#E53935" },
            ]}
          />
          <Text style={styles.legendText}>
            Absent
          </Text>
        </View>

      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
    padding: 20,
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    marginTop: 25,
    marginBottom: 30,
    alignItems: "center",
  },

  courseName: {
    fontSize: 30,
    fontWeight: "700",
    color: "#222",
  },

  percentCard: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 24,
  },

  percentText: {
    fontSize: 34,
    fontWeight: "700",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  statBox: {
    backgroundColor: "#fff",
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: "center",

    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: "#222",
  },

  statLabel: {
    marginTop: 6,
    color: "#777",
  },

  calendar: {
    borderRadius: 22,
    overflow: "hidden",
    paddingBottom: 10,
  },

  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
  },

  dot: {
    width: 12,
    height: 12,
    borderRadius: 10,
    marginRight: 7,
  },

  legendText: {
    color: "#666",
    fontSize: 15,
  },
});