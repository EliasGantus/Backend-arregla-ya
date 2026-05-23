import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeQuote } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const createSchema = z.object({
  serviceRequestId: z.string().min(1),
  amount: z.string().min(1),
  message: z.string().min(10),
});

export const quotesRouter = Router();

quotesRouter.use(authenticate);

quotesRouter.get(
  '/quotes/me',
  requireRoles(['PROFESIONAL', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const where =
      request.auth!.role === 'ADMIN' ? {} : { professionalId: request.auth!.userId };

    const quotes = await prisma.quote.findMany({
      where,
      include: {
        professional: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json(quotes.map(serializeQuote));
  }),
);

quotesRouter.post(
  '/service-requests/:id/quotes',
  requireRoles(['PROFESIONAL', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createSchema.parse({
      ...request.body,
      serviceRequestId: request.params.id,
    });

    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id: payload.serviceRequestId },
    });

    if (!serviceRequest) {
      throw new HttpError(404, 'Solicitud no encontrada.', 'SERVICE_REQUEST_NOT_FOUND');
    }

    const existingQuote = await prisma.quote.findUnique({
      where: {
        serviceRequestId_professionalId: {
          serviceRequestId: payload.serviceRequestId,
          professionalId: request.auth!.userId,
        },
      },
    });

    if (existingQuote) {
      throw new HttpError(409, 'Ya existe una cotización para esta solicitud.', 'QUOTE_EXISTS');
    }

    const quote = await prisma.quote.create({
      data: {
        serviceRequestId: payload.serviceRequestId,
        professionalId: request.auth!.userId,
        amount: payload.amount,
        message: payload.message,
        status: 'PENDING',
      },
      include: {
        professional: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (serviceRequest.status === 'OPEN') {
      await prisma.serviceRequest.update({
        where: { id: serviceRequest.id },
        data: { status: 'QUOTED' },
      });
    }

    response.status(201).json(serializeQuote(quote));
  }),
);
