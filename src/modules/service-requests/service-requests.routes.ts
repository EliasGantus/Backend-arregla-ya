import { Router } from 'express';
import type { ServiceRequestStatus } from '@prisma/client';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeServiceRequest } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const createSchema = z.object({
  title: z.string().min(4),
  description: z.string().min(12),
  categoryId: z.string().min(1),
  city: z.string().min(2),
  zone: z.string().min(2),
  budget: z.string().optional(),
  photos: z.array(z.string()).max(4).optional(),
});

const updateSchema = z.object({
  title: z.string().min(4).optional(),
  description: z.string().min(12).optional(),
  status: z.enum(['draft', 'open', 'quoted', 'assigned', 'cancelled']).optional(),
  city: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
  budget: z.string().optional(),
});

const statusMap = {
  draft: 'DRAFT',
  open: 'OPEN',
  quoted: 'QUOTED',
  assigned: 'ASSIGNED',
  cancelled: 'CANCELLED',
} as const;

export const serviceRequestsRouter = Router();

serviceRequestsRouter.use(authenticate);

serviceRequestsRouter.get(
  '/service-requests',
  asyncHandler(async (request, response) => {
    const where =
      request.auth!.role === 'CLIENTE'
        ? { clientId: request.auth!.userId }
        : request.auth!.role === 'PROFESIONAL'
          ? { status: { in: ['OPEN', 'QUOTED'] satisfies ServiceRequestStatus[] } }
          : {};

    const serviceRequests = await prisma.serviceRequest.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json(serviceRequests.map(serializeServiceRequest));
  }),
);

serviceRequestsRouter.get(
  '/service-requests/:id',
  asyncHandler(async (request, response) => {
    const serviceRequestId = String(request.params.id);
    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      include: { category: true },
    });

    if (!serviceRequest) {
      throw new HttpError(404, 'Solicitud no encontrada.', 'SERVICE_REQUEST_NOT_FOUND');
    }

    response.json(serializeServiceRequest(serviceRequest));
  }),
);

serviceRequestsRouter.post(
  '/service-requests',
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createSchema.parse(request.body);

    const category = await prisma.category.findUnique({
      where: { id: payload.categoryId },
    });

    if (!category) {
      throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
    }

    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        title: payload.title,
        description: payload.description,
        city: payload.city,
        zone: payload.zone,
        budget: payload.budget,
        photos: payload.photos ?? [],
        clientId: request.auth!.userId,
        categoryId: payload.categoryId,
        status: 'OPEN',
      },
      include: { category: true },
    });

    response.status(201).json(serializeServiceRequest(serviceRequest));
  }),
);

serviceRequestsRouter.patch(
  '/service-requests/:id',
  asyncHandler(async (request, response) => {
    const payload = updateSchema.parse(request.body);
    const serviceRequestId = String(request.params.id);
    const current = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      include: { category: true },
    });

    if (!current) {
      throw new HttpError(404, 'Solicitud no encontrada.', 'SERVICE_REQUEST_NOT_FOUND');
    }

    if (request.auth!.role === 'CLIENTE' && current.clientId !== request.auth!.userId) {
      throw new HttpError(403, 'No puedes modificar esta solicitud.', 'FORBIDDEN');
    }

    const updated = await prisma.serviceRequest.update({
      where: { id: current.id },
      data: {
        title: payload.title,
        description: payload.description,
        city: payload.city,
        zone: payload.zone,
        budget: payload.budget,
        status: payload.status ? statusMap[payload.status] : undefined,
      },
      include: { category: true },
    });

    response.json(serializeServiceRequest(updated));
  }),
);
