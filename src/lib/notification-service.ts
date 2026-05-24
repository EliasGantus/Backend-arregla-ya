import type {
  Booking,
  Notification,
  NotificationChannel,
  NotificationType,
  ServiceRequest,
  User,
} from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from './prisma.js';

type BookingNotificationContext = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'email' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

type NotificationInput = {
  recipientId: string;
  recipientEmail?: string;
  type: NotificationType;
  title: string;
  body: string;
  bookingId?: string;
  channels?: NotificationChannel[];
  metadata?: Record<string, string>;
};

const defaultChannels: NotificationChannel[] = ['PUSH', 'EMAIL'];

const providerConfigByChannel = (channel: NotificationChannel) =>
  channel === 'EMAIL'
    ? {
        url: env.NOTIFICATION_EMAIL_PROVIDER_URL,
        token: env.NOTIFICATION_EMAIL_PROVIDER_TOKEN,
      }
    : {
        url: env.NOTIFICATION_PUSH_PROVIDER_URL,
        token: env.NOTIFICATION_PUSH_PROVIDER_TOKEN,
      };

const dispatchNotification = async (
  notification: Notification,
  recipientEmail: string | undefined,
) => {
  const provider = providerConfigByChannel(notification.channel);

  if (!provider.url) {
    return;
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.token ? { Authorization: `Bearer ${provider.token}` } : {}),
    },
    body: JSON.stringify({
      from: notification.channel === 'EMAIL' ? env.NOTIFICATION_EMAIL_FROM : undefined,
      to: notification.channel === 'EMAIL' ? recipientEmail : notification.recipientId,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Provider responded with ${response.status}`);
  }
};

const createAndDispatch = async (input: NotificationInput) =>
  Promise.all(
    (input.channels ?? defaultChannels).map(async (channel) => {
      const notification = await prisma.notification.create({
        data: {
          recipientId: input.recipientId,
          bookingId: input.bookingId,
          type: input.type,
          channel,
          title: input.title,
          body: input.body,
          metadata: input.metadata,
          status: 'PENDING',
        },
      });

      try {
        await dispatchNotification(notification, input.recipientEmail);

        return prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });
      } catch (error) {
        return prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'FAILED',
            failureReason: error instanceof Error ? error.message : 'Unknown notification error',
          },
        });
      }
    }),
  );

export const notificationService = {
  send(input: NotificationInput) {
    return createAndDispatch(input);
  },

  notifyBookingCreated(booking: BookingNotificationContext) {
    return createAndDispatch({
      recipientId: booking.professionalId,
      recipientEmail: booking.professional.email,
      type: 'BOOKING_CREATED',
      title: 'Nueva reserva pendiente',
      body: `${booking.client.fullName} solicito una reserva para ${booking.serviceRequest.title}.`,
      bookingId: booking.id,
      metadata: {
        bookingId: booking.id,
        serviceRequestId: booking.serviceRequestId,
      },
    });
  },

  notifyBookingConfirmed(booking: BookingNotificationContext) {
    return createAndDispatch({
      recipientId: booking.clientId,
      recipientEmail: booking.client.email,
      type: 'BOOKING_CONFIRMED',
      title: 'Turno confirmado',
      body: `${booking.professional.fullName} confirmo tu turno para ${booking.serviceRequest.title}.`,
      bookingId: booking.id,
      metadata: {
        bookingId: booking.id,
        serviceRequestId: booking.serviceRequestId,
      },
    });
  },

  notifyBookingStatusChanged(booking: BookingNotificationContext) {
    return Promise.all([
      createAndDispatch({
        recipientId: booking.clientId,
        recipientEmail: booking.client.email,
        type: 'BOOKING_STATUS_CHANGED',
        title: 'Estado de reserva actualizado',
        body: `Tu reserva para ${booking.serviceRequest.title} cambio a ${booking.status.toLowerCase()}.`,
        bookingId: booking.id,
        metadata: {
          bookingId: booking.id,
          status: booking.status,
        },
      }),
      createAndDispatch({
        recipientId: booking.professionalId,
        recipientEmail: booking.professional.email,
        type: 'BOOKING_STATUS_CHANGED',
        title: 'Estado de reserva actualizado',
        body: `La reserva de ${booking.client.fullName} cambio a ${booking.status.toLowerCase()}.`,
        bookingId: booking.id,
        metadata: {
          bookingId: booking.id,
          status: booking.status,
        },
      }),
    ]);
  },

  notifyBookingReminder(booking: BookingNotificationContext) {
    const scheduledAt = booking.scheduledAt.toISOString();

    return Promise.all([
      createAndDispatch({
        recipientId: booking.clientId,
        recipientEmail: booking.client.email,
        type: 'BOOKING_REMINDER',
        title: 'Recordatorio de turno',
        body: `Recordatorio: tenes un turno para ${booking.serviceRequest.title} el ${scheduledAt}.`,
        bookingId: booking.id,
        metadata: {
          bookingId: booking.id,
          scheduledAt,
        },
      }),
      createAndDispatch({
        recipientId: booking.professionalId,
        recipientEmail: booking.professional.email,
        type: 'BOOKING_REMINDER',
        title: 'Recordatorio de turno',
        body: `Recordatorio: tenes un turno con ${booking.client.fullName} el ${scheduledAt}.`,
        bookingId: booking.id,
        metadata: {
          bookingId: booking.id,
          scheduledAt,
        },
      }),
    ]);
  },
};
