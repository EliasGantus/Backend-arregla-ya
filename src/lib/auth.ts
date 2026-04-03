import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';

import { env } from '../config/env.js';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

const signToken = (payload: object, secret: Secret, expiresIn: string) =>
  jwt.sign(payload, secret, {
    expiresIn: expiresIn as SignOptions['expiresIn'],
  });

export const authUtils = {
  hashPassword(value: string) {
    return bcrypt.hash(value, 10);
  },
  comparePassword(value: string, hash: string) {
    return bcrypt.compare(value, hash);
  },
  hashToken(value: string) {
    return bcrypt.hash(value, 10);
  },
  compareToken(value: string, hash: string) {
    return bcrypt.compare(value, hash);
  },
  signAccessToken(payload: AccessTokenPayload) {
    return signToken(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN);
  },
  signRefreshToken(userId: string) {
    return signToken({ sub: userId, type: 'refresh' }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN);
  },
  verifyAccessToken(token: string) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  },
  verifyRefreshToken(token: string) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  },
};
