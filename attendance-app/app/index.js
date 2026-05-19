import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';

export default function LoginScreen() {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (input === 'admin123') {
      router.replace({ pathname: '/dashboard', params: { role: 'admin' } });
      return;
    } else if (input.length === 10) {
      router.replace({ pathname: '/dashboard', params: { role: 'teacher', phone: input } });
      return;
    } else if (input.length === 11) {
      setLoading(true);
      try {
        const response = await axios.get(
          `${process.env.EXPO_PUBLIC_API_URL}/students/${input}`
        );
        if (response.data.student) {
          router.replace({ pathname: '/dashboard', params: { role: 'student', studentId: input } });
          return;
        }
      } catch (err) {
        if (err.response?.status === 404) {
          Alert.alert("Error", "Student ID not found");
        } else {
          Alert.alert("Error", "Something went wrong");
          console.log(err);
        }
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert('Login Failed', 'Enter valid Admin ID, phone number, or Student ID');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FC" />

      {/* Background decoration blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {/* Logo + App name */}
        <View style={styles.logoSection}>
          <View style={styles.logoBox}>
            {/* Simple face + scan lines SVG-style icon built from Views */}
            <View style={styles.faceCircle}>
              <View style={styles.faceInner}>
                <View style={styles.eyeRow}>
                  <View style={styles.eye} />
                  <View style={styles.eye} />
                </View>
                <View style={styles.scanLine} />
                <View style={[styles.scanLine, { opacity: 0.5, marginTop: 3 }]} />
              </View>
            </View>
          </View>
          <Text style={styles.appName}>FaceAttend</Text>
          <Text style={styles.appTagline}>Smart classroom attendance</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>Sign in to continue</Text>

          {/* Input */}
          <View style={[styles.inputWrapper, focused && styles.inputWrapperFocused]}>
            <Text style={styles.inputIcon}>🔑</Text>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Admin ID · Phone · Student ID"
              placeholderTextColor="#B0B8CC"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="none"
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          {/* Hint chips */}
          <View style={styles.hintRow}>
            <View style={styles.hintChip}>
              <Text style={styles.hintText}>Admin: admin123</Text>
            </View>
            <View style={styles.hintChip}>
              <Text style={styles.hintText}>Teacher: 10-digit</Text>
            </View>
            <View style={styles.hintChip}>
              <Text style={styles.hintText}>Student: 11-digit</Text>
            </View>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.loginBtnText}>Verifying...</Text>
            ) : (
              <Text style={styles.loginBtnText}>Sign In →</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Face Attendance System · v1.0</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const ACCENT = '#4F6EF7';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    justifyContent: 'center',
  },

  // Background decoration
  blobTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#DDE3FF',
    opacity: 0.55,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#D6F5E8',
    opacity: 0.45,
  },

  inner: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  // ── Logo ──────────────────────────────────────
  logoSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  faceCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  eye: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  scanLine: {
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
    opacity: 0.9,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: -0.8,
  },
  appTagline: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // ── Card ──────────────────────────────────────
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 28,
    shadowColor: '#4F6EF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
    marginBottom: 24,
  },

  // ── Input ─────────────────────────────────────
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8EAF2',
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    gap: 10,
  },
  inputWrapperFocused: {
    borderColor: ACCENT,
    backgroundColor: '#EEF1FE',
  },
  inputIcon: { fontSize: 16 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A2E',
    paddingVertical: 12,
  },

  // ── Hint chips ────────────────────────────────
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 24,
  },
  hintChip: {
    backgroundColor: '#F0F2FA',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  hintText: {
    fontSize: 10,
    color: '#7A82A6',
    fontWeight: '500',
  },

  // ── Button ────────────────────────────────────
  loginBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  loginBtnDisabled: {
    opacity: 0.65,
  },
  loginBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },

  footer: {
    marginTop: 28,
    fontSize: 11,
    color: '#BCC2D4',
    letterSpacing: 0.3,
  },
});