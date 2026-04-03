import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import { authUtils } from '../lib/auth.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';

export const authenticate = async (request: Request, _response: Response, next: NextFunction) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    next(new HttpError(401, 'Token de acceso requerido.', 'AUTH_REQUIRED'));
    return;
  }

  const token = authorization.replace('Bearer ', '').trim();

  try {
    const payload = authUtils.verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new HttpError(401, 'La sesión ya no es válida.', 'SESSION_INVALID');
    }

    request.auth = {
      userId: user.id,
      role: user.role,
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }

    next(new HttpError(401, 'Token inválido o expirado.', 'TOKEN_INVALID'));
  }
};

export const requireRoles =
  (roles: UserRole[]) => (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(new HttpError(403, 'No tienes permisos para acceder a este recurso.', 'FORBIDDEN'));
      return;
    }

    next();
  };
