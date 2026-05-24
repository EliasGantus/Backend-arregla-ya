import type { Booking, Notification, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

type BookingWithRecipients = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'email' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

const prismaMocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn<(args: unknown) => Promise<BookingWithRecipients | null>>(),
  notificationFindMany: vi.fn<(args: unknown) => Promise<Notification[]>>(),
  notificationFindUnique: vi.fn<(args: unknown) => Promise<Notification | null>>(),
  notificationUpdate: vi.fn<(args: unknown) => Promise<Notification>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

const notificationServiceMocks = vi.hoisted(() => ({
  notifyBookingReminder: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    booking: {
      findUnique: prismaMocks.bookingFindUnique,
    },
    notification: {
      findMany: prismaMocks.notificationFindMany,
      findUnique: prismaMocks.notificationFindUnique,
      update: prismaMocks.notificationUpdate,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

vi.mock('../lib/notification-service.js', () => ({
  notificationService: notificationServiceMocks,
}));

type NotificationFindArgs = {
  where?: {
    recipientId?: unknown;
    readAt?: unknown;
  };
};

type NotificationUpdateArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    readAt?: unknown;
  };
};

type NotificationResponse = {
  id?: unknown;
  type?: unknown;
  channel?: unknown;
  readAt?: unknown;
};

type ReminderResponse = {
  sent?: unknown;
  bookingId?: unknown;
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'client-1',
  email: 'cliente@arreglaya.com',
  passwordHash: 'hashed-password',
  fullName: 'Lucia Benitez',
  role: 'CLIENTE',
  city: 'Buenos Aires',
  zone: 'Caballito',
  ratingAverage: 0,
  ratingCount: 0,
  refreshTokenHash: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notification-1',
  type: 'BOOKING_CREATED',
  channel: 'PUSH',
  status: 'SENT',
  title: 'Nueva reserva pendiente',
  body: 'Tenes una nueva reserva pendiente.',
  metadata: null,
  readAt: null,
  sentAt: new Date('2026-04-02T00:00:00.000Z'),
  failureReason: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  recipientId: 'client-1',
  bookingId: 'booking-1',
  ...overrides,
});

const makeBooking = (overrides: Partial<Booking> = {}): BookingWithRecipients => ({
  id: 'booking-1',
  serviceRequestId: 'request-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  scheduledAt: new Date('2026-06-05T14:00:00.000Z'),
  status: 'CONFIRMED',
  notes: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  client: {
    id: 'client-1',
    email: 'cliente@arreglaya.com',
    fullName: 'Lucia Benitez',
  },
  professional: {
    id: 'pro-1',
    email: 'pro@arreglaya.com',
    fullName: 'Carlos Mendoza',
  },
  serviceRequest: {
    id: 'request-1',
    title: 'Reparacion de caneria',
  },
  ...overrides,
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('notifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista notificaciones no leidas del usuario autenticado', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.notificationFindMany.mockResolvedValue([makeNotification()]);

    const response = await request(app)
      .get('/notifications?unread=true')
      .set('Authorization', bearerTokenFor(client));
    const findArgs = prismaMocks.notificationFindMany.mock.calls[0]?.[0] as
      | NotificationFindArgs
      | undefined;
    const body = response.body as NotificationResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'notification-1',
      type: 'booking_created',
      channel: 'push',
    });
    expect(findArgs?.where?.recipientId).toBe('client-1');
    expect(findArgs?.where?.readAt).toBeNull();
  });

  it('marca una notificacion propia como leida', async () => {
    const app = createApp();
    const client = makeUser();
    const notification = makeNotification();
    const readNotification = makeNotification({
      readAt: new Date('2026-04-03T00:00:00.000Z'),
    });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.notificationFindUnique.mockResolvedValue(notification);
    prismaMocks.notificationUpdate.mockResolvedValue(readNotification);

    const response = await request(app)
      .patch('/notifications/notification-1/read')
      .set('Authorization', bearerTokenFor(client));
    const updateArgs = prismaMocks.notificationUpdate.mock.calls[0]?.[0] as
      | NotificationUpdateArgs
      | undefined;
    const body = response.body as NotificationResponse;

    expect(response.status).toBe(200);
    expect(body.readAt).toBe('2026-04-03T00:00:00.000Z');
    expect(updateArgs?.where?.id).toBe('notification-1');
    expect(updateArgs?.data?.readAt).toBeInstanceOf(Date);
  });

  it('impide marcar como leida una notificacion de otro usuario', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.notificationFindUnique.mockResolvedValue(
      makeNotification({ recipientId: 'other-user' }),
    );

    const response = await request(app)
      .patch('/notifications/notification-1/read')
      .set('Authorization', bearerTokenFor(client));

    expect(response.status).toBe(403);
    expect(prismaMocks.notificationUpdate).not.toHaveBeenCalled();
  });

  it('envia recordatorio para una reserva accesible', async () => {
    const app = createApp();
    const client = makeUser();
    const booking = makeBooking();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(booking);

    const response = await request(app)
      .post('/bookings/booking-1/reminders')
      .set('Authorization', bearerTokenFor(client));
    const body = response.body as ReminderResponse;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      sent: true,
      bookingId: 'booking-1',
    });
    expect(notificationServiceMocks.notifyBookingReminder).toHaveBeenCalledWith(booking);
  });
});
