import type { Booking, Category, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

type ProfessionalWithSpecialties = User & {
  specialties: Array<{
    category: Category;
  }>;
};

type BookingWithRelations = Booking & {
  client: Pick<User, 'id' | 'fullName'>;
  professional: Pick<User, 'id' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

const prismaMocks = vi.hoisted(() => ({
  bookingFindFirst: vi.fn<(args: unknown) => Promise<Booking | null>>(),
  bookingCreate: vi.fn<(args: unknown) => Promise<BookingWithRelations>>(),
  categoryFindUnique: vi.fn<(args: unknown) => Promise<Category | null>>(),
  serviceRequestCreate: vi.fn<(args: unknown) => Promise<ServiceRequestWithCategory>>(),
  userFindMany: vi.fn<(args: unknown) => Promise<ProfessionalWithSpecialties[]>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    booking: {
      findFirst: prismaMocks.bookingFindFirst,
      create: prismaMocks.bookingCreate,
    },
    category: {
      findUnique: prismaMocks.categoryFindUnique,
    },
    serviceRequest: {
      create: prismaMocks.serviceRequestCreate,
    },
    user: {
      findMany: prismaMocks.userFindMany,
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

type ServiceRequestWithCategory = ServiceRequest & {
  category: Category;
};

type ProfessionalResponse = {
  id?: unknown;
  available?: unknown;
  specialties?: Array<{
    slug?: unknown;
  }>;
};

type EmergencyResponse = {
  serviceRequest?: {
    status?: unknown;
  };
  booking?: {
    professionalId?: unknown;
    status?: unknown;
  };
};

type UserFindManyArgs = {
  where?: {
    role?: unknown;
    zone?: unknown;
    specialties?: unknown;
  };
};

type BookingCreateArgs = {
  data?: {
    serviceRequestId?: unknown;
    clientId?: unknown;
    professionalId?: unknown;
    status?: unknown;
  };
};

const scheduledAt = new Date('2026-06-05T14:00:00.000Z');

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'category-1',
  name: 'Plomería',
  slug: 'plomeria',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'client-1',
  email: 'cliente@arreglaya.com',
  passwordHash: 'hashed-password',
  fullName: 'Lucia Benitez',
  role: 'CLIENTE',
  city: 'Buenos Aires',
  zone: 'Palermo',
  refreshTokenHash: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makeProfessional = (overrides: Partial<User> = {}): ProfessionalWithSpecialties => ({
  ...makeUser({
    id: 'pro-1',
    email: 'pro@arreglaya.com',
    fullName: 'Carlos Mendoza',
    role: 'PROFESIONAL',
    ...overrides,
  }),
  specialties: [
    {
      category: makeCategory(),
    },
  ],
});

const makeServiceRequest = (
  overrides: Partial<ServiceRequest> = {},
): ServiceRequestWithCategory => ({
  id: 'request-1',
  title: 'Cañería rota',
  description: 'Necesito asistencia urgente por una pérdida de agua.',
  status: 'ASSIGNED',
  city: 'Buenos Aires',
  zone: 'Palermo',
  budget: '$85.000',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  clientId: 'client-1',
  categoryId: 'category-1',
  category: makeCategory(),
  ...overrides,
});

const makeBooking = (overrides: Partial<Booking> = {}): BookingWithRelations => ({
  id: 'booking-1',
  serviceRequestId: 'request-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  scheduledAt,
  status: 'PENDING',
  notes: null,
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
  serviceRequest: {
    id: 'request-1',
    title: 'Cañería rota',
  },
  ...overrides,
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('professionals and emergencies routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca profesionales por categoría, zona y disponibilidad', async () => {
    const app = createApp();
    const professional = makeProfessional();

    prismaMocks.categoryFindUnique.mockResolvedValue(makeCategory());
    prismaMocks.userFindMany.mockResolvedValue([professional]);
    prismaMocks.bookingFindFirst.mockResolvedValue(null);

    const response = await request(app).get(
      `/professionals/search?categorySlug=plomeria&zone=Palermo&availableAt=${scheduledAt.toISOString()}`,
    );
    const body = response.body as ProfessionalResponse[];
    const findManyArgs = prismaMocks.userFindMany.mock.calls[0]?.[0] as
      | UserFindManyArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe('pro-1');
    expect(body[0]?.available).toBe(true);
    expect(body[0]?.specialties?.[0]?.slug).toBe('plomeria');
    expect(findManyArgs?.where?.role).toBe('PROFESIONAL');
    expect(findManyArgs?.where?.zone).toEqual({ equals: 'Palermo', mode: 'insensitive' });
  });

  it('filtra profesionales no disponibles si se pide un horario', async () => {
    const app = createApp();

    prismaMocks.userFindMany.mockResolvedValue([makeProfessional()]);
    prismaMocks.bookingFindFirst.mockResolvedValue(makeBooking());

    const response = await request(app).get(
      `/professionals/search?categoryId=category-1&availableAt=${scheduledAt.toISOString()}`,
    );
    const body = response.body as ProfessionalResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(0);
  });

  it('crea una solicitud urgente y reserva al primer profesional disponible', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.categoryFindUnique.mockResolvedValue(makeCategory());
    prismaMocks.userFindMany.mockResolvedValue([makeProfessional()]);
    prismaMocks.bookingFindFirst.mockResolvedValue(null);
    prismaMocks.serviceRequestCreate.mockResolvedValue(makeServiceRequest());
    prismaMocks.bookingCreate.mockResolvedValue(makeBooking());

    const response = await request(app)
      .post('/emergencies')
      .set('Authorization', bearerTokenFor(client))
      .send({
        title: 'Cañería rota',
        description: 'Necesito asistencia urgente por una pérdida de agua.',
        categoryId: 'category-1',
        city: 'Buenos Aires',
        zone: 'Palermo',
        scheduledAt: scheduledAt.toISOString(),
      });
    const body = response.body as EmergencyResponse;
    const bookingCreateArgs = prismaMocks.bookingCreate.mock.calls[0]?.[0] as
      | BookingCreateArgs
      | undefined;

    expect(response.status).toBe(201);
    expect(body.serviceRequest?.status).toBe('assigned');
    expect(body.booking?.professionalId).toBe('pro-1');
    expect(body.booking?.status).toBe('pending');
    expect(bookingCreateArgs?.data?.clientId).toBe('client-1');
    expect(bookingCreateArgs?.data?.professionalId).toBe('pro-1');
    expect(bookingCreateArgs?.data?.status).toBe('PENDING');
  });

  it('rechaza emergencias cuando no hay profesionales disponibles', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.categoryFindUnique.mockResolvedValue(makeCategory());
    prismaMocks.userFindMany.mockResolvedValue([makeProfessional()]);
    prismaMocks.bookingFindFirst.mockResolvedValue(makeBooking());

    const response = await request(app)
      .post('/emergencies')
      .set('Authorization', bearerTokenFor(client))
      .send({
        title: 'Cañería rota',
        description: 'Necesito asistencia urgente por una pérdida de agua.',
        categoryId: 'category-1',
        city: 'Buenos Aires',
        zone: 'Palermo',
        scheduledAt: scheduledAt.toISOString(),
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('NO_PROFESSIONAL_AVAILABLE');
    expect(prismaMocks.serviceRequestCreate).not.toHaveBeenCalled();
  });
});
