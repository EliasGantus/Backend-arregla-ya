import type { Booking, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  bookingFindMany: vi.fn<(args: unknown) => Promise<BookingWithRelations[]>>(),
  bookingFindUnique: vi.fn<(args: unknown) => Promise<BookingWithRelations | Booking | null>>(),
  bookingFindFirst: vi.fn<(args: unknown) => Promise<Booking | null>>(),
  bookingCreate: vi.fn<(args: unknown) => Promise<BookingWithRelations>>(),
  bookingUpdate: vi.fn<(args: unknown) => Promise<BookingWithRelations>>(),
  serviceRequestFindUnique: vi.fn<(args: unknown) => Promise<ServiceRequest | null>>(),
  serviceRequestUpdate: vi.fn<(args: unknown) => Promise<ServiceRequest>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

const notificationMocks = vi.hoisted(() => ({
  notifyBookingConfirmed: vi.fn(),
  notifyBookingCreated: vi.fn(),
  notifyBookingStatusChanged: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    booking: {
      findMany: prismaMocks.bookingFindMany,
      findUnique: prismaMocks.bookingFindUnique,
      findFirst: prismaMocks.bookingFindFirst,
      create: prismaMocks.bookingCreate,
      update: prismaMocks.bookingUpdate,
    },
    serviceRequest: {
      findUnique: prismaMocks.serviceRequestFindUnique,
      update: prismaMocks.serviceRequestUpdate,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

vi.mock('../lib/notification-service.js', () => ({
  notificationService: notificationMocks,
}));

type BookingWithRelations = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'email' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

type BookingResponse = {
  id?: unknown;
  status?: unknown;
  scheduledAt?: unknown;
  serviceRequestId?: unknown;
  professionalId?: unknown;
};

type BookingWriteArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    serviceRequestId?: unknown;
    clientId?: unknown;
    professionalId?: unknown;
    scheduledAt?: unknown;
    status?: unknown;
  };
};

type BookingFindArgs = {
  where?: {
    clientId?: unknown;
    professionalId?: unknown;
    status?: unknown;
  };
};

type FindUniqueUserArgs = {
  where?: {
    id?: unknown;
  };
};

const scheduledAt = new Date('2026-06-05T14:00:00.000Z');

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

const makeServiceRequest = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 'request-1',
  title: 'Reparación de cañería',
  description: 'Necesito arreglar una cañería de cocina.',
  status: 'OPEN',
  city: 'Buenos Aires',
  zone: 'Palermo',
  budget: '$85.000',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  clientId: 'client-1',
  categoryId: 'category-1',
  ...overrides,
  photos: overrides.photos ?? [],
});

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  serviceRequestId: 'request-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  scheduledAt,
  status: 'PENDING',
  notes: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const withRelations = (booking: Booking): BookingWithRelations => ({
  ...booking,
  client: {
    id: booking.clientId,
    email: 'cliente@arreglaya.com',
    fullName: 'Lucia Benitez',
  },
  professional: {
    id: booking.professionalId,
    email: 'pro@arreglaya.com',
    fullName: 'Carlos Mendoza',
  },
  serviceRequest: {
    id: booking.serviceRequestId,
    title: 'Reparación de cañería',
  },
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

const mockUsersById = (...users: User[]) => {
  const usersById = new Map(users.map((user) => [user.id, user]));
  prismaMocks.userFindUnique.mockImplementation((args) => {
    const userId = (args as FindUniqueUserArgs).where?.id;
    return Promise.resolve(typeof userId === 'string' ? usersById.get(userId) ?? null : null);
  });
};

describe('bookings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una reserva para una solicitud propia si el profesional está disponible', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest();
    const booking = withRelations(makeBooking());

    mockUsersById(client, professional);
    prismaMocks.serviceRequestFindUnique.mockResolvedValue(serviceRequest);
    prismaMocks.bookingFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prismaMocks.bookingCreate.mockResolvedValue(booking);
    prismaMocks.serviceRequestUpdate.mockResolvedValue({
      ...serviceRequest,
      status: 'ASSIGNED',
    });

    const response = await request(app)
      .post('/bookings')
      .set('Authorization', bearerTokenFor(client))
      .send({
        serviceRequestId: 'request-1',
        professionalId: 'pro-1',
        scheduledAt: scheduledAt.toISOString(),
      });
    const body = response.body as BookingResponse;
    const createArgs = prismaMocks.bookingCreate.mock.calls[0]?.[0] as BookingWriteArgs | undefined;

    expect(response.status).toBe(201);
    expect(body.status).toBe('pending');
    expect(body.serviceRequestId).toBe('request-1');
    expect(createArgs?.data?.clientId).toBe('client-1');
    expect(createArgs?.data?.professionalId).toBe('pro-1');
    expect(createArgs?.data?.status).toBe('PENDING');
    expect(notificationMocks.notifyBookingCreated).toHaveBeenCalledWith(booking);
  });

  it('rechaza una reserva cuando el profesional ya tiene un turno activo en el horario', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest();

    mockUsersById(client, professional);
    prismaMocks.serviceRequestFindUnique.mockResolvedValue(serviceRequest);
    prismaMocks.bookingFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeBooking({ id: 'booking-conflict' }));

    const response = await request(app)
      .post('/bookings')
      .set('Authorization', bearerTokenFor(client))
      .send({
        serviceRequestId: 'request-1',
        professionalId: 'pro-1',
        scheduledAt: scheduledAt.toISOString(),
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('BOOKING_CONFLICT');
    expect(prismaMocks.bookingCreate).not.toHaveBeenCalled();
  });

  it('permite que el profesional confirme una reserva asignada', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const currentBooking = makeBooking();
    const updatedBooking = withRelations(makeBooking({ status: 'CONFIRMED' }));

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.bookingUpdate.mockResolvedValue(updatedBooking);

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'confirmed',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.bookingUpdate.mock.calls[0]?.[0] as BookingWriteArgs | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('confirmed');
    expect(updateArgs?.data?.status).toBe('CONFIRMED');
    expect(notificationMocks.notifyBookingConfirmed).toHaveBeenCalledWith(updatedBooking);
  });

  it('impide que el cliente confirme una reserva', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking());

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'confirmed',
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(prismaMocks.bookingUpdate).not.toHaveBeenCalled();
  });

  it('lista las reservas del profesional autenticado', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindMany.mockResolvedValue([withRelations(makeBooking())]);

    const response = await request(app)
      .get('/bookings')
      .set('Authorization', bearerTokenFor(professional));
    const body = response.body as BookingResponse[];
    const findArgs = prismaMocks.bookingFindMany.mock.calls[0]?.[0] as BookingFindArgs | undefined;

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(findArgs?.where?.professionalId).toBe('pro-1');
  });
});
