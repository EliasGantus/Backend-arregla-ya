import { Prisma, type User, type UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { authUtils } from '../../lib/auth.js';
import { getAuthenticatedUser } from '../../lib/current-user.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeUser } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const roleSchema = z.enum(['cliente', 'profesional']);

const roleMap: Record<z.infer<typeof roleSchema>, UserRole> = {
  cliente: 'CLIENTE',
  profesional: 'PROFESIONAL',
};

const listUsersSchema = z.object({
  role: roleSchema.optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(3),
  role: roleSchema.default('cliente'),
  city: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
});

const adminUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: roleSchema.optional(),
  fullName: z.string().min(3).optional(),
  city: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
});

const profileUpdateSchema = adminUpdateSchema.pick({
  fullName: true,
  city: true,
  zone: true,
});

const isRecordNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

type UserUpdateData = {
  email?: string;
  passwordHash?: string;
  fullName?: string;
  role?: UserRole;
  city?: string;
  zone?: string;
};

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get(
  '/me',
  asyncHandler(async (request, response) => {
    const user = await getAuthenticatedUser(request.auth!.userId);
    response.json(serializeUser(user));
  }),
);

usersRouter.patch(
  '/me',
  asyncHandler(async (request, response) => {
    const payload = profileUpdateSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: request.auth!.userId },
      data: payload,
    });

    response.json(serializeUser(user));
  }),
);

usersRouter.get(
  '/users',
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    const query = listUsersSchema.parse(request.query);
    const users = await prisma.user.findMany({
      where: query.role ? { role: roleMap[query.role] } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    response.json(users.map(serializeUser));
  }),
);

usersRouter.post(
  '/users',
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createUserSchema.parse(request.body);
    const email = payload.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new HttpError(409, 'Ya existe un usuario con ese email.', 'EMAIL_IN_USE');
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await authUtils.hashPassword(payload.password),
        fullName: payload.fullName,
        role: roleMap[payload.role],
        city: payload.city,
        zone: payload.zone,
      },
    });

    response.status(201).json(serializeUser(user));
  }),
);

usersRouter.get(
  '/users/:id',
  asyncHandler(async (request, response) => {
    const userId = String(request.params.id);

    if (request.auth!.role !== 'ADMIN' && request.auth!.userId !== userId) {
      throw new HttpError(403, 'No tienes permisos para acceder a este usuario.', 'FORBIDDEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpError(404, 'Usuario no encontrado.', 'USER_NOT_FOUND');
    }

    response.json(serializeUser(user));
  }),
);

usersRouter.patch(
  '/users/:id',
  asyncHandler(async (request, response) => {
    const userId = String(request.params.id);
    const isAdmin = request.auth!.role === 'ADMIN';

    if (!isAdmin && request.auth!.userId !== userId) {
      throw new HttpError(403, 'No tienes permisos para modificar este usuario.', 'FORBIDDEN');
    }

    const updateData: UserUpdateData = {};

    if (isAdmin) {
      const payload = adminUpdateSchema.parse(request.body);

      if (payload.email) {
        const email = payload.email.toLowerCase();
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new HttpError(409, 'Ya existe un usuario con ese email.', 'EMAIL_IN_USE');
        }

        updateData.email = email;
      }

      if (payload.password) {
        updateData.passwordHash = await authUtils.hashPassword(payload.password);
      }

      updateData.role = payload.role ? roleMap[payload.role] : undefined;
      updateData.fullName = payload.fullName;
      updateData.city = payload.city;
      updateData.zone = payload.zone;
    } else {
      const payload = profileUpdateSchema.parse(request.body);
      updateData.fullName = payload.fullName;
      updateData.city = payload.city;
      updateData.zone = payload.zone;
    }

    let user: User;

    try {
      user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new HttpError(404, 'Usuario no encontrado.', 'USER_NOT_FOUND');
      }

      throw error;
    }

    response.json(serializeUser(user));
  }),
);

usersRouter.delete(
  '/users/:id',
  requireRoles(['ADMIN']),
  asyncHandler(async (request, response) => {
    try {
      await prisma.user.delete({
        where: { id: String(request.params.id) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new HttpError(
          409,
          'No se puede eliminar un usuario con datos relacionados.',
          'USER_HAS_RELATED_DATA',
        );
      }

      if (isRecordNotFound(error)) {
        throw new HttpError(404, 'Usuario no encontrado.', 'USER_NOT_FOUND');
      }

      throw error;
    }

    response.status(204).send();
  }),
);
