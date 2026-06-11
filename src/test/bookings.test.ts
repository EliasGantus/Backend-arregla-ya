import type { Booking, Payment, Quote, Review, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  bookingFindMany: vi.fn<(args: unknown) => Promise<BookingWithRelations[]>>(),
  bookingFindUnique: vi.fn<(args: unknown) => Promise<BookingWithRelations | Booking | null>>(),
  bookingFindFirst: vi.fn<(args: unknown) => Promise<Booking | null>>(),
  bookingCreate: vi.fn<(args: unknown) => Promise<BookingWithRelations>>(),
  quoteFindFirst: vi.fn<(args: unknown) => Promise<Quote | null>>(),
  serviceRequestFindUnique: vi.fn<(args: unknown) => Promise<ServiceRequest | null>>(),
  serviceRequestUpdate: vi.fn<(args: unknown) => Promise<ServiceRequest>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
  txBookingUpdateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  txBookingFindUnique: vi.fn<(args: unknown) => Promise<BookingWithRelations | null>>(),
  txServiceRequestUpdate: vi.fn<(args: unknown) => Promise<ServiceRequest>>(),
  transaction: vi.fn<(callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>>(),
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
    },
    quote: {
      findFirst: prismaMocks.quoteFindFirst,
    },
    serviceRequest: {
      findUnique: prismaMocks.serviceRequestFindUnique,
      update: prismaMocks.serviceRequestUpdate,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
    $transaction: prismaMocks.transaction,
  },
}));

vi.mock('../lib/notification-service.js', () => ({
  notificationService: notificationMocks,
}));

type BookingWithRelations = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'email' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
  payment: Pick<Payment, 'id'> | null;
  review: Pick<Review, 'id'> | null;
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

type ServiceRequestWriteArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    status?: unknown;
  };
};

type BookingFindArgs = {
  where?: {
    clientId?: unknown;
    professionalId?: unknown;
    status?: unknown;
  };
  include?: {
    payment?: unknown;
    review?: unknown;
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

const makeQuote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 'quote-1',
  amount: '$85.000',
  status: 'ACCEPTED',
  message: 'Puedo resolverlo durante la tarde.',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  serviceRequestId: 'request-1',
  professionalId: 'pro-1',
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
  payment: null,
  review: null,
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
    vi.resetAllMocks();
    prismaMocks.transaction.mockImplementation((callback) =>
      callback({
        booking: {
          updateMany: prismaMocks.txBookingUpdateMany,
          findUnique: prismaMocks.txBookingFindUnique,
        },
        serviceRequest: {
          update: prismaMocks.txServiceRequestUpdate,
        },
      }),
    );
    prismaMocks.txBookingUpdateMany.mockResolvedValue({ count: 1 });
    prismaMocks.quoteFindFirst.mockResolvedValue(makeQuote());
  });

  it('crea una reserva para una solicitud propia si el profesional está disponible', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest({ status: 'QUOTED' });
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

  it('rechaza reservar con un profesional sin cotizacion aceptada', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest({ status: 'QUOTED' });

    mockUsersById(client, professional);
    prismaMocks.serviceRequestFindUnique.mockResolvedValue(serviceRequest);
    prismaMocks.bookingFindFirst.mockResolvedValue(null);
    prismaMocks.quoteFindFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/bookings')
      .set('Authorization', bearerTokenFor(client))
      .send({
        serviceRequestId: 'request-1',
        professionalId: 'pro-1',
        scheduledAt: scheduledAt.toISOString(),
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'QUOTE_NOT_ACCEPTED',
      message: 'Acepta una cotizacion antes de reservar este profesional.',
    });
    expect(prismaMocks.bookingCreate).not.toHaveBeenCalled();
  });

  it('rechaza reservar una solicitud que ya esta completada', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest({ status: 'COMPLETED' });

    mockUsersById(client, professional);
    prismaMocks.serviceRequestFindUnique.mockResolvedValue(serviceRequest);
    prismaMocks.bookingFindFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/bookings')
      .set('Authorization', bearerTokenFor(client))
      .send({
        serviceRequestId: 'request-1',
        professionalId: 'pro-1',
        scheduledAt: scheduledAt.toISOString(),
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'SERVICE_REQUEST_NOT_BOOKABLE',
      message: 'Esta solicitud ya no permite crear reservas.',
    });
    expect(prismaMocks.bookingCreate).not.toHaveBeenCalled();
  });

  it('rechaza una reserva cuando el profesional ya tiene un turno activo en el horario', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest({ status: 'QUOTED' });

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
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'confirmed',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('confirmed');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'PENDING' });
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
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza cancelar una reserva que no estÃ¡ pendiente', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'cancelled',
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_BOOKING_TRANSITION',
      message: 'Solo se pueden cancelar reservas pendientes.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza que el profesional cancele una reserva pendiente', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'PENDING' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'cancelled',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Solo el cliente puede cancelar esta reserva.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza confirmar una reserva que no estÃ¡ pendiente', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'confirmed',
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_BOOKING_TRANSITION',
      message: 'Solo se pueden confirmar reservas pendientes.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza volver una reserva confirmada a pendiente', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'pending',
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_BOOKING_TRANSITION',
      message: 'No se puede volver una reserva al estado pendiente.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('permite que el administrador cancele una reserva pendiente', async () => {
    const app = createApp();
    const admin = makeUser({
      id: 'admin-1',
      email: 'admin@arreglaya.com',
      role: 'ADMIN',
    });
    const serviceRequest = makeServiceRequest({ status: 'ASSIGNED' });
    const currentBooking = makeBooking({ status: 'PENDING' });
    const updatedBooking = withRelations(makeBooking({ status: 'CANCELLED' }));

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);
    prismaMocks.txServiceRequestUpdate.mockResolvedValue({
      ...serviceRequest,
      status: 'OPEN',
    });

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        status: 'cancelled',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;
    const serviceRequestUpdateArgs = prismaMocks.txServiceRequestUpdate.mock.calls[0]?.[0] as
      | ServiceRequestWriteArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('cancelled');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'PENDING' });
    expect(updateArgs?.data?.status).toBe('CANCELLED');
    expect(serviceRequestUpdateArgs).toMatchObject({
      where: { id: 'request-1' },
      data: { status: 'OPEN' },
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(notificationMocks.notifyBookingStatusChanged).toHaveBeenCalledWith(updatedBooking);
  });

  it('permite que el cliente cancele una reserva pendiente propia', async () => {
    const app = createApp();
    const client = makeUser();
    const serviceRequest = makeServiceRequest({ status: 'ASSIGNED' });
    const currentBooking = makeBooking({ status: 'PENDING' });
    const updatedBooking = withRelations(makeBooking({ status: 'CANCELLED' }));

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);
    prismaMocks.txServiceRequestUpdate.mockResolvedValue({
      ...serviceRequest,
      status: 'OPEN',
    });

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'cancelled',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;
    const serviceRequestUpdateArgs = prismaMocks.txServiceRequestUpdate.mock.calls[0]?.[0] as
      | ServiceRequestWriteArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('cancelled');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'PENDING' });
    expect(updateArgs?.data?.status).toBe('CANCELLED');
    expect(serviceRequestUpdateArgs).toMatchObject({
      where: { id: 'request-1' },
      data: { status: 'OPEN' },
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(notificationMocks.notifyBookingStatusChanged).toHaveBeenCalledWith(updatedBooking);
  });

  it('rechaza actualizar cuando la reserva cambio de estado durante la transaccion', async () => {
    const app = createApp();
    const client = makeUser();
    const currentBooking = makeBooking({ status: 'PENDING' });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingUpdateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'cancelled',
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_BOOKING_TRANSITION',
      message: 'La reserva cambio de estado. Actualiza la pantalla e intenta nuevamente.',
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(prismaMocks.txBookingFindUnique).not.toHaveBeenCalled();
    expect(prismaMocks.serviceRequestUpdate).not.toHaveBeenCalled();
    expect(prismaMocks.txServiceRequestUpdate).not.toHaveBeenCalled();
    expect(notificationMocks.notifyBookingStatusChanged).not.toHaveBeenCalled();
    expect(notificationMocks.notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it('permite que el administrador confirme una reserva pendiente', async () => {
    const app = createApp();
    const admin = makeUser({
      id: 'admin-1',
      email: 'admin@arreglaya.com',
      role: 'ADMIN',
    });
    const currentBooking = makeBooking({ status: 'PENDING' });
    const updatedBooking = withRelations(makeBooking({ status: 'CONFIRMED' }));

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        status: 'confirmed',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('confirmed');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'PENDING' });
    expect(updateArgs?.data?.status).toBe('CONFIRMED');
    expect(notificationMocks.notifyBookingConfirmed).toHaveBeenCalledWith(updatedBooking);
  });

  it('permite que el profesional finalice una reserva confirmada', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });
    const serviceRequest = makeServiceRequest({ status: 'ASSIGNED' });
    const currentBooking = makeBooking({ status: 'CONFIRMED' });
    const updatedBooking = withRelations(makeBooking({ status: 'COMPLETED' }));

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);
    prismaMocks.txServiceRequestUpdate.mockResolvedValue({
      ...serviceRequest,
      status: 'COMPLETED',
    });

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'completed',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;
    const serviceRequestUpdateArgs = prismaMocks.txServiceRequestUpdate.mock.calls[0]?.[0] as
      | ServiceRequestWriteArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('completed');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'CONFIRMED' });
    expect(updateArgs?.data?.status).toBe('COMPLETED');
    expect(serviceRequestUpdateArgs).toMatchObject({
      where: { id: 'request-1' },
      data: { status: 'COMPLETED' },
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(notificationMocks.notifyBookingStatusChanged).toHaveBeenCalledWith(updatedBooking);
  });

  it('permite que el administrador finalice una reserva confirmada', async () => {
    const app = createApp();
    const admin = makeUser({
      id: 'admin-1',
      email: 'admin@arreglaya.com',
      role: 'ADMIN',
    });
    const serviceRequest = makeServiceRequest({ status: 'ASSIGNED' });
    const currentBooking = makeBooking({ status: 'CONFIRMED' });
    const updatedBooking = withRelations(makeBooking({ status: 'COMPLETED' }));

    prismaMocks.userFindUnique.mockResolvedValue(admin);
    prismaMocks.bookingFindUnique.mockResolvedValue(currentBooking);
    prismaMocks.txBookingFindUnique.mockResolvedValue(updatedBooking);
    prismaMocks.txServiceRequestUpdate.mockResolvedValue({
      ...serviceRequest,
      status: 'COMPLETED',
    });

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(admin))
      .send({
        status: 'completed',
      });
    const body = response.body as BookingResponse;
    const updateArgs = prismaMocks.txBookingUpdateMany.mock.calls[0]?.[0] as BookingWriteArgs | undefined;
    const serviceRequestUpdateArgs = prismaMocks.txServiceRequestUpdate.mock.calls[0]?.[0] as
      | ServiceRequestWriteArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('completed');
    expect(updateArgs?.where).toMatchObject({ id: 'booking-1', status: 'CONFIRMED' });
    expect(updateArgs?.data?.status).toBe('COMPLETED');
    expect(serviceRequestUpdateArgs).toMatchObject({
      where: { id: 'request-1' },
      data: { status: 'COMPLETED' },
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(notificationMocks.notifyBookingStatusChanged).toHaveBeenCalledWith(updatedBooking);
  });

  it('rechaza que otro profesional confirme una reserva asignada', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-2',
      email: 'otro-pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'PENDING' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'confirmed',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza finalizar una reserva pendiente', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'PENDING' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'completed',
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'INVALID_BOOKING_TRANSITION',
      message: 'La reserva debe estar confirmada antes de marcarla como finalizada.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza que otro profesional finalice una reserva confirmada', async () => {
    const app = createApp();
    const professional = makeUser({
      id: 'pro-2',
      email: 'otro-pro@arreglaya.com',
      role: 'PROFESIONAL',
    });

    prismaMocks.userFindUnique.mockResolvedValue(professional);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(professional))
      .send({
        status: 'completed',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza que el cliente finalice una reserva confirmada', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'completed',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Solo el profesional asignado puede finalizar este trabajo.',
    });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
  });

  it('rechaza que otro cliente cancele una reserva pendiente', async () => {
    const app = createApp();
    const client = makeUser({
      id: 'client-2',
      email: 'otro-cliente@arreglaya.com',
    });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'PENDING' }));

    const response = await request(app)
      .patch('/bookings/booking-1')
      .set('Authorization', bearerTokenFor(client))
      .send({
        status: 'cancelled',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMocks.txBookingUpdateMany).not.toHaveBeenCalled();
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
    expect(findArgs?.include).toMatchObject({
      payment: { select: { id: true } },
      review: { select: { id: true } },
    });
  });
});
