import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5433/arreglaya'),
  JWT_ACCESS_SECRET: z.string().min(1).default('access-secret-dev'),
  JWT_REFRESH_SECRET: z.string().min(1).default('refresh-secret-dev'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_API_BASE_URL: z.string().url().default('https://api.mercadopago.com'),
  PAYMENT_SUCCESS_URL: z.string().url().default('http://localhost:5173/pagos/exito'),
  PAYMENT_PENDING_URL: z.string().url().default('http://localhost:5173/pagos/pendiente'),
  PAYMENT_FAILURE_URL: z.string().url().default('http://localhost:5173/pagos/error'),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
