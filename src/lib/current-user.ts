import type { User } from '@prisma/client';

import { HttpError } from './http-error.js';
import { prisma } from './prisma.js';

export const getAuthenticatedUser = async (userId: string): Promise<User> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(401, 'La sesión ya no es válida.', 'SESSION_INVALID');
  }

  return user;
};
