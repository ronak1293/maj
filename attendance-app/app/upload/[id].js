import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, SafeAreaView, ActivityIndicator, TextInput
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import axios from 'axios';

export default function UploadScreen() {
  const { id } = useLocalSearchParams();
  const navigation = useNavigation();

  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: `Upload Student Photos` });
  }, []);

  // 🔥 STEP 1: SELECT IMAGES
  const handleSelectImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Photo library access is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled) return;

    const images = result.assets.map((asset) => ({
      asset,
      studentId: '',
      name: '',
    }));

    setSelectedImages(images);
  }, []);

  // 🔥 STEP 2: UPLOAD TO BACKEND
  const handleUpload = useCallback(async () => {
    if (selectedImages.length === 0) {
      Alert.alert('Error', 'No images selected');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();

      selectedImages.forEach((item) => {
        if (!item.studentId || !item.name) return;

        formData.append('images', {
          uri: item.asset.uri,
          name: 'photo.jpg',
          type: item.asset.mimeType || 'image/jpeg',
        });

        formData.append('studentIds', item.studentId);
        formData.append('names', item.name);
      });

      await axios.post(
        `${process.env.EXPO_PUBLIC_API_URL}/students/upload/${id}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );

      Alert.alert('Success', 'Students uploaded successfully');
      setSelectedImages([]);

    } catch (err) {
      console.log(err);
      Alert.alert('Error', 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [selectedImages, id]);

  // 🔥 RENDER EACH IMAGE INPUT
  const renderItem = ({ item, index }) => (
    <View style={styles.card}>
      <Text style={styles.label}>Image {index + 1}</Text>

      <TextInput
        placeholder="Enter Student ID"
        placeholderTextColor="#666"
        style={styles.input}
        value={item.studentId}
        onChangeText={(text) => {
          const updated = [...selectedImages];
          updated[index].studentId = text;
          setSelectedImages(updated);
        }}
      />

      <TextInput
        placeholder="Enter Student Name"
        placeholderTextColor="#666"
        style={styles.input}
        value={item.name}
        onChangeText={(text) => {
          const updated = [...selectedImages];
          updated[index].name = text;
          setSelectedImages(updated);
        }}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>

      {/* SELECT BUTTON */}
      <TouchableOpacity
        style={styles.selectBtn}
        onPress={handleSelectImages}
      >
        <Text style={styles.selectText}>Select Student Photos</Text>
      </TouchableOpacity>

      {/* IMAGE INPUT LIST */}
      <FlatList
        data={selectedImages}
        renderItem={renderItem}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={{ padding: 16 }}
      />

      {/* UPLOAD BUTTON */}
      {selectedImages.length > 0 && (
        <TouchableOpacity
          style={styles.uploadBtn}
          onPress={handleUpload}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.uploadText}>Upload to Server</Text>
          )}
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  selectBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },

  selectText: {
    color: '#fff',
    fontWeight: '700',
  },

  uploadBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },

  uploadText: {
    color: '#fff',
    fontWeight: '700',
  },

  card: {
    backgroundColor: '#111118',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },

  label: {
    color: '#aaa',
    marginBottom: 6,
  },

  input: {
    backgroundColor: '#1A1A22',
    padding: 10,
    borderRadius: 8,
    color: '#fff',
    marginBottom: 8,
  },
});