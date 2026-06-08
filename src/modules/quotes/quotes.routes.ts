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

const updateSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

const quoteInclude = {
  professional: {
    select: {
      id: true,
      fullName: true,
    },
  },
  serviceRequest: {
    select: {
      id: true,
      title: true,
    },
  },
} as const;

export const quotesRouter = Router();

quotesRouter.use(authenticate);

quotesRouter.get(
  '/service-requests/:id/quotes',
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const serviceRequestId = String(request.params.id);
    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });

    if (!serviceRequest) {
      throw new HttpError(404, 'Solicitud no encontrada.', 'SERVICE_REQUEST_NOT_FOUND');
    }

    if (request.auth!.role === 'CLIENTE' && serviceRequest.clientId !== request.auth!.userId) {
      throw new HttpError(403, 'No puedes consultar cotizaciones de otra solicitud.', 'FORBIDDEN');
    }

    const quotes = await prisma.quote.findMany({
      where: { serviceRequestId },
      include: quoteInclude,
      orderBy: { createdAt: 'desc' },
    });

    response.json(quotes.map(serializeQuote));
  }),
);

quotesRouter.get(
  '/quotes/me',
  requireRoles(['PROFESIONAL', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const where =
      request.auth!.role === 'ADMIN' ? {} : { professionalId: request.auth!.userId };

    const quotes = await prisma.quote.findMany({
      where,
      include: quoteInclude,
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
      include: quoteInclude,
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

quotesRouter.patch(
  '/quotes/:id',
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = updateSchema.parse(request.body);
    const quoteId = String(request.params.id);
    const current = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        serviceRequest: {
          select: {
            id: true,
            clientId: true,
            status: true,
          },
        },
      },
    });

    if (!current) {
      throw new HttpError(404, 'Cotización no encontrada.', 'QUOTE_NOT_FOUND');
    }

    if (
      request.auth!.role === 'CLIENTE' &&
      current.serviceRequest.clientId !== request.auth!.userId
    ) {
      throw new HttpError(403, 'No puedes modificar cotizaciones de otra solicitud.', 'FORBIDDEN');
    }

    if (current.status !== 'PENDING') {
      throw new HttpError(409, 'La cotización ya fue resuelta.', 'QUOTE_ALREADY_RESOLVED');
    }

    const status = payload.status === 'accepted' ? 'ACCEPTED' : 'REJECTED';
    const quote = await prisma.quote.update({
      where: { id: current.id },
      data: { status },
      include: quoteInclude,
    });

    if (status === 'ACCEPTED') {
      await prisma.quote.updateMany({
        where: {
          serviceRequestId: current.serviceRequestId,
          id: { not: current.id },
        },
        data: { status: 'REJECTED' },
      });

      await prisma.serviceRequest.update({
        where: { id: current.serviceRequest.id },
        data: { status: 'ASSIGNED' },
      });
    }

    response.json(serializeQuote(quote));
  }),
);
