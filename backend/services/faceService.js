// services/faceService.js
import axios from 'axios';

export const getEmbedding = async (imagePath) => {
  const res = await axios.post('http://localhost:8000/embed', {
    imagePath,
  });
  

  if (res.data.error) {
    throw new Error(res.data.error);
  }

  return res.data.embedding;
};