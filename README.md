# Multi-Face Attendance System

An AI-powered smart attendance management system designed for real classroom environments using multi-face detection, face recognition, tracking, and video-based attendance processing.

The system allows teachers to mark attendance using a single classroom image or a short classroom video without requiring students to interact individually with any biometric device.

---

# Features

## Admin Dashboard
- Create and manage courses
- Register students with:
  - Name
  - Roll Number
  - Student Images
- Assign teachers to courses
- Manage attendance records

## Teacher Dashboard
- View assigned courses
- Capture attendance using:
  - Classroom image
  - 4–6 second classroom video
- Automatic attendance marking
- Download attendance reports in Excel format
- View attendance snapshots

## Student Dashboard
- View enrolled courses
- View attendance percentage
- View attendance history

---

# System Architecture

The project uses a dual-server architecture.

## 1. React Native Mobile Application
Frontend mobile application built using:
- React Native
- Expo

Handles:
- User authentication
- Dashboard interfaces
- Attendance capture
- Video upload
- Attendance reports

---

## 2. Express.js Backend Server
Main backend API server.

Handles:
- Authentication
- Course management
- Student management
- Attendance records
- Embedding matching
- MongoDB operations

---

## 3. Python Face Recognition Server
Dedicated deep learning inference server.

Handles:
- Face detection
- Face tracking
- Image enhancement
- Face alignment
- Embedding extraction
- Video frame processing

---

# AI Pipeline

## Face Detection
- SCRFD
- SAHI-based sliced inference
- NMS for duplicate removal

## Face Recognition
- AdaFace embeddings
- FAISS similarity search
- Cosine similarity matching

## Video Processing
- FaceSORT-inspired tracking
- Multi-frame embedding averaging
- Laplacian sharpness scoring

## Enhancement Pipeline
- Gamma Correction
- CLAHE
- Bilateral Filtering
- Selective CodeFormer restoration

---

# Tech Stack

## Frontend
- React Native
- Expo
- Axios
- React Navigation

## Backend
- Node.js
- Express.js
- MongoDB
- Mongoose

## AI Server
- Python
- FastAPI
- InsightFace
- OpenCV
- PyTorch
- FAISS

---

# Project Structure

```bash
project/
│
├── attendance-app/          # React Native frontend
│
├── backend/
│   ├── routes/
│   ├── models/
│   ├── controllers/
│   ├── services/
│   └── server.js
│
├── python-server/
│   ├── models/
│   ├── trackers/
│   ├── enhancement/
│   ├── embeddings/
│   └── main.py
│
└── README.md
```

---

# Installation

## Clone Repository

```bash
git clone https://github.com/ronak1293/maj.git
cd maj
```

---

# Frontend Setup

## Install Dependencies

```bash
cd attendance-app
npm install
```

## Configure API URL

Create `.env`

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000
```

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.5:3000
```

## Start Expo

```bash
npx expo start
```

---

# Backend Setup

## Install Dependencies

```bash
cd backend
npm install
```

## Create `.env`

```env
PORT=3000

MONGO_URI=your_mongodb_uri

JWT_SECRET=your_secret

PYTHON_SERVER_URL=http://localhost:8000
```

## Run Backend

```bash
npm start
```

or

```bash
nodemon server.js
```

---

# Python AI Server Setup

## Create Virtual Environment

```bash
python -m venv venv
```

## Activate Virtual Environment

### Windows

```bash
venv\Scripts\activate
```

### Linux/Mac

```bash
source venv/bin/activate
```

## Install Dependencies

```bash
pip install -r requirements.txt
```

## Run AI Server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

# Attendance Workflow

## Student Enrollment
1. Admin creates course
2. Student images uploaded
3. Face embeddings generated
4. Embeddings stored in database

---

## Attendance Marking
1. Teacher selects course
2. Teacher uploads:
   - classroom image
   - or short classroom video
3. Frames extracted
4. Faces detected
5. Faces tracked
6. Embeddings extracted
7. Embeddings matched using cosine similarity
8. Attendance automatically marked

---

# Deployment

## Frontend APK Build

Using Expo EAS Build:

```bash
eas build -p android --profile preview
```

---

## Backend Deployment
Recommended:
- Vercel
- Render
- Railway

---

## Python Server Deployment
Recommended:
- GPU VPS
- RunPod
- Paperspace
- AWS EC2

---

# MongoDB Atlas Setup

1. Create Atlas Cluster
2. Add database user
3. Add network access:

```txt
0.0.0.0/0
```

4. Copy connection string

---

# Environment Variables

## Frontend

```env
EXPO_PUBLIC_API_URL=
```

## Backend

```env
PORT=
MONGO_URI=
JWT_SECRET=
PYTHON_SERVER_URL=
```

---

# Performance Optimizations

- SAHI patch inference for small faces
- Multi-frame embedding averaging
- FaceSORT-inspired tracking
- Quality-aware restoration
- FAISS fast similarity search

---

# Future Improvements

- TensorRT optimization
- ONNX Runtime acceleration
- CCTV-based attendance
- Passive liveness detection
- Federated learning
- Edge-device deployment

---

# Author

Ronak Rewar

GitHub Repository:
https://github.com/ronak1293/maj
