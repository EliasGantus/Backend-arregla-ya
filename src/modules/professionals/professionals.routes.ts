import type { Category, User } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { serializeBooking, serializeCategory, serializeServiceRequest } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const activeBookingStatuses = ['PENDING', 'CONFIRMED'] as const;

const professionalInclude = {
  specialties: {
    include: {
      category: true,
    },
  },
} as const;

const bookingInclude = {
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
  serviceRequest: {
    select: {
      id: true,
      title: true,
    },
  },
} as const;

const searchSchema = z.object({
  categoryId: z.string().min(1).optional(),
  categorySlug: z.string().min(1).optional(),
  zone: z.string().min(2).optional(),
  availableAt: z.coerce.date().optional(),
});

const emergencySchema = z.object({
  title: z.string().min(4),
  description: z.string().min(12),
  categoryId: z.string().min(1),
  city: z.string().min(2),
  zone: z.string().min(2),
  scheduledAt: z.coerce.date().default(() => new Date()),
  budget: z.string().optional(),
  notes: z.string().min(3).optional(),
});

type ProfessionalWithSpecialties = User & {
  specialties: Array<{
    category: Category;
  }>;
};

const serializeProfessional = (professional: ProfessionalWithSpecialties, available: boolean) => ({
  id: professional.id,
  fullName: professional.fullName,
  email: professional.email,
  city: professional.city ?? undefined,
  zone: professional.zone ?? undefined,
  ratingAverage: professional.ratingAverage,
  ratingCount: professional.ratingCount,
  available,
  specialties: professional.specialties.map(({ category }) => serializeCategory(category)),
});

const resolveCategoryFilter = async (categoryId?: string, categorySlug?: string) => {
  if (categoryId) {
    return categoryId;
  }

  if (!categorySlug) {
    return undefined;
  }

  const category = await prisma.category.findUnique({
    where: { slug: categorySlug.toLowerCase() },
  });

  if (!category) {
    throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
  }

  return category.id;
};

const isProfessionalAvailable = async (professionalId: string, scheduledAt?: Date) => {
  if (!scheduledAt) {
    return true;
  }

  const windowStart = new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);

  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      professionalId,
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: { in: [...activeBookingStatuses] },
    },
  });

  return !conflictingBooking;
};

const findMatchingProfessionals = async (filters: {
  categoryId?: string;
  zone?: string;
  availableAt?: Date;
}) => {
  const professionals = await prisma.user.findMany({
    where: {
      role: 'PROFESIONAL',
      zone: filters.zone ? { equals: filters.zone, mode: 'insensitive' } : undefined,
      specialties: filters.categoryId
        ? {
            some: {
              categoryId: filters.categoryId,
            },
          }
        : undefined,
    },
    include: professionalInclude,
    orderBy: { fullName: 'asc' },
  });

  const professionalsWithAvailability = await Promise.all(
    professionals.map(async (professional) => ({
      professional,
      available: await isProfessionalAvailable(professional.id, filters.availableAt),
    })),
  );

  return professionalsWithAvailability.filter(({ available }) => !filters.availableAt || available);
};

export const professionalsRouter = Router();

professionalsRouter.get(
  '/professionals/search',
  asyncHandler(async (request, response) => {
    const query = searchSchema.parse(request.query);
    const categoryId = await resolveCategoryFilter(query.categoryId, query.categorySlug);
    const professionals = await findMatchingProfessionals({
      categoryId,
      zone: query.zone,
      availableAt: query.availableAt,
    });

    response.json(
      professionals.map(({ professional, available }) =>
        serializeProfessional(professional, available),
      ),
    );
  }),
);

professionalsRouter.post(
  '/emergencies',
  authenticate,
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = emergencySchema.parse(request.body);
    const category = await prisma.category.findUnique({
      where: { id: payload.categoryId },
    });

    if (!category) {
      throw new HttpError(404, 'Categoría no encontrada.', 'CATEGORY_NOT_FOUND');
    }

    const [match] = await findMatchingProfessionals({
      categoryId: category.id,
      zone: payload.zone,
      availableAt: payload.scheduledAt,
    });

    if (!match) {
      throw new HttpError(409, 'No hay profesionales disponibles para la emergencia.', 'NO_PROFESSIONAL_AVAILABLE');
    }

    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        title: payload.title,
        description: payload.description,
        city: payload.city,
        zone: payload.zone,
        budget: payload.budget,
        clientId: request.auth!.userId,
        categoryId: category.id,
        status: 'ASSIGNED',
      },
      include: { category: true },
    });

    const booking = await prisma.booking.create({
      data: {
        serviceRequestId: serviceRequest.id,
        clientId: serviceRequest.clientId,
        professionalId: match.professional.id,
        scheduledAt: payload.scheduledAt,
        notes: payload.notes,
        status: 'PENDING',
      },
      include: bookingInclude,
    });

    response.status(201).json({
      serviceRequest: serializeServiceRequest(serviceRequest),
      booking: serializeBooking(booking),
    });
  }),
);
