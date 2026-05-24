import type { Review } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeReview } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const reviewInclude = {
  client: {
    select: {
      id: true,
      fullName: true,
    },
  },
  professional: {
    select: {
      id: true,
      fullName: true,
    },
  },
  booking: {
    select: {
      id: true,
      serviceRequestId: true,
    },
  },
} as const;

const createSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).optional(),
});

const updateProfessionalRating = async (professionalId: string) => {
  const aggregate = await prisma.review.aggregate({
    where: { professionalId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.user.update({
    where: { id: professionalId },
    data: {
      ratingAverage: aggregate._avg.rating ?? 0,
      ratingCount: aggregate._count.rating,
    },
  });
};

export const reviewsRouter = Router();

reviewsRouter.get(
  '/professionals/:id/reviews',
  asyncHandler(async (request, response) => {
    const reviews = await prisma.review.findMany({
      where: { professionalId: String(request.params.id) },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
    });

    response.json(reviews.map(serializeReview));
  }),
);

reviewsRouter.post(
  '/reviews',
  authenticate,
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createSchema.parse(request.body);
    const booking = await prisma.booking.findUnique({
      where: { id: payload.bookingId },
    });

    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
    }

    if (booking.status !== 'COMPLETED') {
      throw new HttpError(409, 'Solo se puede reseñar una reserva completada.', 'BOOKING_NOT_COMPLETED');
    }

    if (request.auth!.role === 'CLIENTE' && booking.clientId !== request.auth!.userId) {
      throw new HttpError(403, 'No puedes reseñar una reserva de otro cliente.', 'FORBIDDEN');
    }

    const existingReview = await prisma.review.findUnique({
      where: { bookingId: booking.id },
    });

    if (existingReview) {
      throw new HttpError(409, 'La reserva ya tiene una reseña.', 'REVIEW_EXISTS');
    }

    const review: Review & {
      client: { id: string; fullName: string };
      professional: { id: string; fullName: string };
      booking: { id: string; serviceRequestId: string };
    } = await prisma.review.create({
      data: {
        bookingId: booking.id,
        clientId: booking.clientId,
        professionalId: booking.professionalId,
        rating: payload.rating,
        comment: payload.comment,
      },
      include: reviewInclude,
    });

    await updateProfessionalRating(booking.professionalId);

    response.status(201).json(serializeReview(review));
  }),
);
