import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use('/uploads', express.static('public/uploads'));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'arreglaya-backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.use(apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
