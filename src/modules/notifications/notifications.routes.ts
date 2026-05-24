import type { Booking, ServiceRequest, User, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { notificationService } from '../../lib/notification-service.js';
import { prisma } from '../../lib/prisma.js';
import { serializeNotification } from '../../lib/serializers.js';
import { authenticate } from '../../middleware/authenticate.js';

type BookingWithNotificationRecipients = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'email' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

const listSchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
});

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
} as const;

const canAccessBooking = (
  role: UserRole,
  userId: string,
  booking: { clientId: string; professionalId: string },
) => role === 'ADMIN' || booking.clientId === userId || booking.professionalId === userId;

export const notificationsRouter = Router();

notificationsRouter.get(
  '/notifications',
  authenticate,
  asyncHandler(async (request, response) => {
    const filters = listSchema.parse(request.query);
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: request.auth!.role === 'ADMIN' ? undefined : request.auth!.userId,
        readAt: filters.unread === 'true' ? null : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json(notifications.map(serializeNotification));
  }),
);

notificationsRouter.patch(
  '/notifications/:id/read',
  authenticate,
  asyncHandler(async (request, response) => {
    const notification = await prisma.notification.findUnique({
      where: { id: String(request.params.id) },
    });

    if (!notification) {
      throw new HttpError(404, 'Notificacion no encontrada.', 'NOTIFICATION_NOT_FOUND');
    }

    if (request.auth!.role !== 'ADMIN' && notification.recipientId !== request.auth!.userId) {
      throw new HttpError(403, 'No tienes permisos para modificar esta notificacion.', 'FORBIDDEN');
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        readAt: notification.readAt ?? new Date(),
      },
    });

    response.json(serializeNotification(updated));
  }),
);

notificationsRouter.post(
  '/bookings/:id/reminders',
  authenticate,
  asyncHandler(async (request, response) => {
    const booking = (await prisma.booking.findUnique({
      where: { id: String(request.params.id) },
      include: bookingInclude,
    })) as BookingWithNotificationRecipients | null;

    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
    }

    if (!canAccessBooking(request.auth!.role, request.auth!.userId, booking)) {
      throw new HttpError(403, 'No tienes permisos para enviar este recordatorio.', 'FORBIDDEN');
    }

    await notificationService.notifyBookingReminder(booking);

    response.status(202).json({
      sent: true,
      bookingId: booking.id,
    });
  }),
);
