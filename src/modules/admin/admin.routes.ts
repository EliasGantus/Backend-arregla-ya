import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { serializeServiceRequest, serializeUser } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRoles(['ADMIN']));

adminRouter.get(
  '/admin/users',
  asyncHandler(async (_request, response) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    response.json(
      users.map((user) => ({
        ...serializeUser(user),
        createdAt: user.createdAt.toISOString(),
      })),
    );
  }),
);

adminRouter.get(
  '/admin/service-requests',
  asyncHandler(async (_request, response) => {
    const serviceRequests = await prisma.serviceRequest.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    response.json(serviceRequests.map(serializeServiceRequest));
  }),
);
