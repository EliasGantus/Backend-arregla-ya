import type { Booking, BookingStatus, Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { notificationService } from '../../lib/notification-service.js';
import { prisma } from '../../lib/prisma.js';
import { serializeBooking } from '../../lib/serializers.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

const activeBookingStatuses: BookingStatus[] = ['PENDING', 'CONFIRMED'];

const bookingInclude = {
  client: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
  professional: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
  serviceRequest: {
    select: {
      id: true,
      title: true,
    },
  },
  payment: {
    select: {
      id: true,
    },
  },
  review: {
    select: {
      id: true,
    },
  },
} as const;

type BookingWithDetails = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const createSchema = z.object({
  serviceRequestId: z.string().min(1),
  professionalId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  notes: z.string().min(3).optional(),
});

const updateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  notes: z.string().min(3).optional(),
});

const canManageBooking = (
  role: UserRole,
  userId: string,
  booking: {
    clientId: string;
    professionalId: string;
  },
) => role === 'ADMIN' || booking.clientId === userId || booking.professionalId === userId;

const ensureProfessionalExists = async (professionalId: string) => {
  const professional = await prisma.user.findUnique({
    where: { id: professionalId },
  });

  if (!professional || professional.role !== 'PROFESIONAL') {
    throw new HttpError(404, 'Profesional no encontrado.', 'PROFESSIONAL_NOT_FOUND');
  }
};

const ensureProfessionalAvailable = async (
  professionalId: string,
  scheduledAt: Date,
  excludeBookingId?: string,
) => {
  const windowStart = new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);

  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      professionalId,
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: { in: activeBookingStatuses },
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
    },
  });

  if (conflictingBooking) {
    throw new HttpError(409, 'El profesional no está disponible en ese horario.', 'BOOKING_CONFLICT');
  }
};

const resolveAllowedStatus = (
  role: UserRole,
  userId: string,
  booking: Booking,
  status: z.infer<typeof updateSchema>['status'],
): BookingStatus | undefined => {
  if (!status) {
    return undefined;
  }

  if (status === 'cancelled') {
    if (booking.status !== 'PENDING') {
      throw new HttpError(409, 'Solo se pueden cancelar reservas pendientes.', 'INVALID_BOOKING_TRANSITION');
    }
    if (role !== 'ADMIN' && booking.clientId !== userId) {
      throw new HttpError(403, 'Solo el cliente puede cancelar esta reserva.', 'FORBIDDEN');
    }
    return 'CANCELLED';
  }

  if (status === 'confirmed') {
    if (booking.status !== 'PENDING') {
      throw new HttpError(409, 'Solo se pueden confirmar reservas pendientes.', 'INVALID_BOOKING_TRANSITION');
    }
    if (role !== 'ADMIN' && booking.professionalId !== userId) {
      throw new HttpError(403, 'Solo el profesional asignado puede confirmar esta reserva.', 'FORBIDDEN');
    }
    return 'CONFIRMED';
  }

  if (status === 'completed') {
    if (booking.status !== 'CONFIRMED') {
      throw new HttpError(
        409,
        'La reserva debe estar confirmada antes de marcarla como finalizada.',
        'INVALID_BOOKING_TRANSITION',
      );
    }
    if (role !== 'ADMIN' && booking.professionalId !== userId) {
      throw new HttpError(403, 'Solo el profesional asignado puede finalizar este trabajo.', 'FORBIDDEN');
    }
    return 'COMPLETED';
  }

  if (status === 'pending') {
    throw new HttpError(409, 'No se puede volver una reserva al estado pendiente.', 'INVALID_BOOKING_TRANSITION');
  }

  const exhaustiveStatus: never = status;
  return exhaustiveStatus;
};

export const bookingsRouter = Router();

bookingsRouter.use(authenticate);

bookingsRouter.get(
  '/bookings',
  asyncHandler(async (request, response) => {
    const where =
      request.auth!.role === 'CLIENTE'
        ? { clientId: request.auth!.userId }
        : request.auth!.role === 'PROFESIONAL'
          ? { professionalId: request.auth!.userId }
          : {};

    const bookings = await prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { scheduledAt: 'desc' },
    });

    response.json(bookings.map(serializeBooking));
  }),
);

bookingsRouter.get(
  '/bookings/:id',
  asyncHandler(async (request, response) => {
    const booking = await prisma.booking.findUnique({
      where: { id: String(request.params.id) },
      include: bookingInclude,
    });

    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
    }

    if (!canManageBooking(request.auth!.role, request.auth!.userId, booking)) {
      throw new HttpError(403, 'No tienes permisos para acceder a esta reserva.', 'FORBIDDEN');
    }

    response.json(serializeBooking(booking));
  }),
);

bookingsRouter.post(
  '/bookings',
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createSchema.parse(request.body);
    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id: payload.serviceRequestId },
    });

    if (!serviceRequest) {
      throw new HttpError(404, 'Solicitud no encontrada.', 'SERVICE_REQUEST_NOT_FOUND');
    }

    if (serviceRequest.status === 'CANCELLED') {
      throw new HttpError(409, 'No se puede reservar una solicitud cancelada.', 'SERVICE_REQUEST_CANCELLED');
    }

    if (request.auth!.role === 'CLIENTE' && serviceRequest.clientId !== request.auth!.userId) {
      throw new HttpError(403, 'No puedes reservar una solicitud de otro cliente.', 'FORBIDDEN');
    }

    const activeBookingForRequest = await prisma.booking.findFirst({
      where: {
        serviceRequestId: serviceRequest.id,
        status: { in: activeBookingStatuses },
      },
    });

    if (activeBookingForRequest) {
      throw new HttpError(409, 'La solicitud ya tiene una reserva activa.', 'REQUEST_ALREADY_BOOKED');
    }

    await ensureProfessionalExists(payload.professionalId);
    await ensureProfessionalAvailable(payload.professionalId, payload.scheduledAt);

    const booking = await prisma.booking.create({
      data: {
        serviceRequestId: serviceRequest.id,
        clientId: serviceRequest.clientId,
        professionalId: payload.professionalId,
        scheduledAt: payload.scheduledAt,
        notes: payload.notes,
        status: 'PENDING',
      },
      include: bookingInclude,
    });

    await prisma.serviceRequest.update({
      where: { id: serviceRequest.id },
      data: { status: 'ASSIGNED' },
    });
    await notificationService.notifyBookingCreated(booking);

    response.status(201).json(serializeBooking(booking));
  }),
);

bookingsRouter.patch(
  '/bookings/:id',
  asyncHandler(async (request, response) => {
    const bookingId = String(request.params.id);
    const payload = updateSchema.parse(request.body);
    const current = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!current) {
      throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
    }

    if (!canManageBooking(request.auth!.role, request.auth!.userId, current)) {
      throw new HttpError(403, 'No tienes permisos para modificar esta reserva.', 'FORBIDDEN');
    }

    if (payload.scheduledAt) {
      await ensureProfessionalAvailable(current.professionalId, payload.scheduledAt, current.id);
    }

    const status = resolveAllowedStatus(request.auth!.role, request.auth!.userId, current, payload.status);
    const bookingUpdateData = {
      scheduledAt: payload.scheduledAt,
      status,
      notes: payload.notes,
    } satisfies Prisma.BookingUpdateManyMutationInput;

    const booking = await prisma.$transaction(async (tx): Promise<BookingWithDetails> => {
      const updateResult = await tx.booking.updateMany({
        where: {
          id: current.id,
          status: current.status,
        },
        data: bookingUpdateData,
      });

      if (updateResult.count !== 1) {
        throw new HttpError(
          409,
          'La reserva cambio de estado. Actualiza la pantalla e intenta nuevamente.',
          'INVALID_BOOKING_TRANSITION',
        );
      }

      const updatedBooking = await tx.booking.findUnique({
        where: { id: current.id },
        include: bookingInclude,
      });

      if (!updatedBooking) {
        throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
      }

      if (status === 'CANCELLED') {
        await tx.serviceRequest.update({
          where: { id: current.serviceRequestId },
          data: { status: 'OPEN' },
        });
      }

      if (status === 'COMPLETED') {
        await tx.serviceRequest.update({
          where: { id: current.serviceRequestId },
          data: { status: 'COMPLETED' },
        });
      }

      return updatedBooking;
    });

    if (status && status !== current.status) {
      if (status === 'CONFIRMED') {
        await notificationService.notifyBookingConfirmed(booking);
      } else {
        await notificationService.notifyBookingStatusChanged(booking);
      }
    }

    response.json(serializeBooking(booking));
  }),
);
