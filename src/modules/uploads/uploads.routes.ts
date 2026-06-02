import path from 'path';
import { Router } from 'express';
import multer from 'multer';

import { HttpError } from '../../lib/http-error.js';
import { authenticate } from '../../middleware/authenticate.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'public/uploads/'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Solo se permiten imágenes.', 'INVALID_FILE_TYPE') as unknown as null, false);
    }
  },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  '/uploads',
  authenticate,
  upload.single('file'),
  (request, response) => {
    if (!request.file) {
      response.status(400).json({ message: 'No se recibió ningún archivo.' });
      return;
    }
    response.status(201).json({ url: `/uploads/${request.file.filename}` });
  },
);
