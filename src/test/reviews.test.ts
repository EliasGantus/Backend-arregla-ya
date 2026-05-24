import type { Booking, Review, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

type ReviewWithRelations = Review & {
  client: Pick<User, 'id' | 'fullName'>;
  professional: Pick<User, 'id' | 'fullName'>;
  booking: Pick<Booking, 'id' | 'serviceRequestId'>;
};

const prismaMocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn<(args: unknown) => Promise<Booking | null>>(),
  reviewAggregate: vi.fn<(args: unknown) => Promise<ReviewAggregate>>(),
  reviewCreate: vi.fn<(args: unknown) => Promise<ReviewWithRelations>>(),
  reviewFindMany: vi.fn<(args: unknown) => Promise<ReviewWithRelations[]>>(),
  reviewFindUnique: vi.fn<(args: unknown) => Promise<Review | null>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
  userUpdate: vi.fn<(args: unknown) => Promise<User>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    booking: {
      findUnique: prismaMocks.bookingFindUnique,
    },
    review: {
      aggregate: prismaMocks.reviewAggregate,
      create: prismaMocks.reviewCreate,
      findMany: prismaMocks.reviewFindMany,
      findUnique: prismaMocks.reviewFindUnique,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
      update: prismaMocks.userUpdate,
    },
  },
}));

type ReviewAggregate = {
  _avg: {
    rating: number | null;
  };
  _count: {
    rating: number;
  };
};

type ReviewResponse = {
  id?: unknown;
  bookingId?: unknown;
  rating?: unknown;
  comment?: unknown;
  professionalId?: unknown;
};

type ReviewCreateArgs = {
  data?: {
    bookingId?: unknown;
    clientId?: unknown;
    professionalId?: unknown;
    rating?: unknown;
    comment?: unknown;
  };
};

type UserUpdateArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    ratingAverage?: unknown;
    ratingCount?: unknown;
  };
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'client-1',
  email: 'cliente@arreglaya.com',
  passwordHash: 'hashed-password',
  fullName: 'Lucia Benitez',
  role: 'CLIENTE',
  city: 'Buenos Aires',
  zone: 'Palermo',
  ratingAverage: 0,
  ratingCount: 0,
  refreshTokenHash: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  serviceRequestId: 'request-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  scheduledAt: new Date('2026-06-05T14:00:00.000Z'),
  status: 'COMPLETED',
  notes: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeReview = (overrides: Partial<Review> = {}): ReviewWithRelations => ({
  id: 'review-1',
  bookingId: 'booking-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  rating: 5,
  comment: 'Excelente trabajo.',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  client: {
    id: 'client-1',
    fullName: 'Lucia Benitez',
  },
  professional: {
    id: 'pro-1',
    fullName: 'Carlos Mendoza',
  },
  booking: {
    id: 'booking-1',
    serviceRequestId: 'request-1',
  },
  ...overrides,
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('reviews routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una reseña para una reserva completada y actualiza el promedio del profesional', async () => {
    const app = createApp();
    const client = makeUser();
    const professional = makeUser({
      id: 'pro-1',
      email: 'pro@arreglaya.com',
      role: 'PROFESIONAL',
      ratingAverage: 4,
      ratingCount: 1,
    });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking());
    prismaMocks.reviewFindUnique.mockResolvedValue(null);
    prismaMocks.reviewCreate.mockResolvedValue(makeReview());
    prismaMocks.reviewAggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 2 },
    });
    prismaMocks.userUpdate.mockResolvedValue({
      ...professional,
      ratingAverage: 4.5,
      ratingCount: 2,
    });

    const response = await request(app)
      .post('/reviews')
      .set('Authorization', bearerTokenFor(client))
      .send({
        bookingId: 'booking-1',
        rating: 5,
        comment: 'Excelente trabajo.',
      });
    const body = response.body as ReviewResponse;
    const createArgs = prismaMocks.reviewCreate.mock.calls[0]?.[0] as
      | ReviewCreateArgs
      | undefined;
    const updateArgs = prismaMocks.userUpdate.mock.calls[0]?.[0] as UserUpdateArgs | undefined;

    expect(response.status).toBe(201);
    expect(body.rating).toBe(5);
    expect(body.professionalId).toBe('pro-1');
    expect(createArgs?.data?.bookingId).toBe('booking-1');
    expect(createArgs?.data?.clientId).toBe('client-1');
    expect(updateArgs?.where?.id).toBe('pro-1');
    expect(updateArgs?.data?.ratingAverage).toBe(4.5);
    expect(updateArgs?.data?.ratingCount).toBe(2);
  });

  it('rechaza reseñar una reserva que no está completada', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ status: 'CONFIRMED' }));

    const response = await request(app)
      .post('/reviews')
      .set('Authorization', bearerTokenFor(client))
      .send({
        bookingId: 'booking-1',
        rating: 4,
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('BOOKING_NOT_COMPLETED');
    expect(prismaMocks.reviewCreate).not.toHaveBeenCalled();
  });

  it('rechaza reseñar una reserva de otro cliente', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking({ clientId: 'other-client' }));

    const response = await request(app)
      .post('/reviews')
      .set('Authorization', bearerTokenFor(client))
      .send({
        bookingId: 'booking-1',
        rating: 4,
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(prismaMocks.reviewCreate).not.toHaveBeenCalled();
  });

  it('rechaza reseñas duplicadas para la misma reserva', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makeBooking());
    prismaMocks.reviewFindUnique.mockResolvedValue(makeReview());

    const response = await request(app)
      .post('/reviews')
      .set('Authorization', bearerTokenFor(client))
      .send({
        bookingId: 'booking-1',
        rating: 5,
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('REVIEW_EXISTS');
    expect(prismaMocks.reviewCreate).not.toHaveBeenCalled();
  });

  it('lista reseñas públicas de un profesional', async () => {
    const app = createApp();

    prismaMocks.reviewFindMany.mockResolvedValue([makeReview()]);

    const response = await request(app).get('/professionals/pro-1/reviews');
    const body = response.body as ReviewResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.bookingId).toBe('booking-1');
    expect(body[0]?.rating).toBe(5);
  });
});
