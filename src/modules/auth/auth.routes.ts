import { Router } from 'express';
import type { UserRole } from '@prisma/client';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { authUtils } from '../../lib/auth.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeUser } from '../../lib/serializers.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(3),
  role: z.enum(['cliente', 'profesional']).default('cliente'),
  city: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const roleMap = {
  cliente: 'CLIENTE',
  profesional: 'PROFESIONAL',
} as const;

const issueSession = async (userId: string, email: string, role: UserRole) => {
  const accessToken = authUtils.signAccessToken({
    sub: userId,
    email,
    role,
  });
  const refreshToken = authUtils.signRefreshToken(userId);
  const refreshTokenHash = await authUtils.hashToken(refreshToken);

  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash },
  });

  return { accessToken, refreshToken };
};

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (request, response) => {
    const payload = registerSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (existingUser) {
      throw new HttpError(409, 'Ya existe un usuario con ese email.', 'EMAIL_IN_USE');
    }

    const passwordHash = await authUtils.hashPassword(payload.password);
    const user = await prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        passwordHash,
        fullName: payload.fullName,
        role: roleMap[payload.role],
        city: payload.city,
        zone: payload.zone,
      },
    });

    const tokens = await issueSession(user.id, user.email, user.role);

    response.status(201).json({
      ...tokens,
      user: serializeUser(user),
    });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (request, response) => {
    const payload = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (!user) {
      throw new HttpError(401, 'Credenciales inválidas.', 'INVALID_CREDENTIALS');
    }

    const isValidPassword = await authUtils.comparePassword(payload.password, user.passwordHash);

    if (!isValidPassword) {
      throw new HttpError(401, 'Credenciales inválidas.', 'INVALID_CREDENTIALS');
    }

    const tokens = await issueSession(user.id, user.email, user.role);

    response.json({
      ...tokens,
      user: serializeUser(user),
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (request, response) => {
    const payload = refreshSchema.parse(request.body);

    try {
      const decoded = authUtils.verifyRefreshToken(payload.refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user?.refreshTokenHash) {
        throw new HttpError(401, 'Refresh token inválido.', 'REFRESH_INVALID');
      }

      const matches = await authUtils.compareToken(payload.refreshToken, user.refreshTokenHash);

      if (!matches) {
        throw new HttpError(401, 'Refresh token inválido.', 'REFRESH_INVALID');
      }

      const tokens = await issueSession(user.id, user.email, user.role);
      response.json(tokens);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(401, 'Refresh token inválido o expirado.', 'REFRESH_INVALID');
    }
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (request, response) => {
    const payload = refreshSchema.parse(request.body);

    try {
      const decoded = authUtils.verifyRefreshToken(payload.refreshToken);
      await prisma.user.update({
        where: { id: decoded.sub },
        data: { refreshTokenHash: null },
      });
    } catch {
      response.status(204).send();
      return;
    }

    response.status(204).send();
  }),
);
