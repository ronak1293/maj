import multer from 'multer';

// REMOVE THIS:
// const storage = multer.diskStorage({
//   destination: 'uploads/',
//   filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
// });

// REPLACE WITH THIS:
const storage = multer.memoryStorage();
export const upload = multer({ storage });