// services/faceService.js
import axios from 'axios';

export const getEmbedding = async (imagePath) => {
  const PYTHON_URL = process.env.PYTHON_SERVER_URL || "http://localhost:8000";
  const res = await axios.post(`${PYTHON_URL}/embed`, {
    imagePath,
  });
  

  if (res.data.error) {
    throw new Error(res.data.error);
  }

  return res.data.embedding;
};