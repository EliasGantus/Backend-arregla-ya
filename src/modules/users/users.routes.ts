import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { getAuthenticatedUser } from '../../lib/current-user.js';
import { serializeUser } from '../../lib/serializers.js';
import { authenticate } from '../../middleware/authenticate.js';
import { prisma } from '../../lib/prisma.js';

const updateSchema = z.object({
  fullName: z.string().min(3).optional(),
  city: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
});

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
    const payload = updateSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: request.auth!.userId },
      data: payload,
    });

    response.json(serializeUser(user));
  }),
);
