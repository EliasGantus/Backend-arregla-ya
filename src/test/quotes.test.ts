import type { Quote, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  quoteFindMany: vi.fn<(args: unknown) => Promise<QuoteWithRelations[]>>(),
  serviceRequestFindUnique: vi.fn<(args: unknown) => Promise<ServiceRequest | null>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    quote: {
      findMany: prismaMocks.quoteFindMany,
    },
    serviceRequest: {
      findUnique: prismaMocks.serviceRequestFindUnique,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

type QuoteWithRelations = Quote & {
  professional: Pick<User, 'id' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

type QuoteResponse = {
  id?: unknown;
  serviceRequestId?: unknown;
  serviceRequestTitle?: unknown;
  professionalId?: unknown;
  professionalName?: unknown;
  amount?: unknown;
  status?: unknown;
};

type QuoteFindManyArgs = {
  where?: {
    serviceRequestId?: unknown;
  };
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

const makeServiceRequest = (
  overrides: Partial<ServiceRequest> = {},
): ServiceRequest => ({
  id: 'request-1',
  title: 'Reparacion de caneria',
  description: 'Necesito arreglar una caneria de cocina.',
  status: 'QUOTED',
  city: 'Buenos Aires',
  zone: 'Palermo',
  budget: '$85.000',
  photos: [],
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  clientId: 'client-1',
  categoryId: 'category-1',
  ...overrides,
});

const makeQuote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 'quote-1',
  amount: '85000',
  status: 'PENDING',
  message: 'Puedo resolverlo durante la tarde.',
  createdAt: new Date('2026-04-02T12:00:00.000Z'),
  updatedAt: new Date('2026-04-02T12:00:00.000Z'),
  serviceRequestId: 'request-1',
  professionalId: 'pro-1',
  ...overrides,
});

const withRelations = (quote: Quote): QuoteWithRelations => ({
  ...quote,
  professional: {
    id: quote.professionalId,
    fullName: 'Carlos Mendoza',
  },
  serviceRequest: {
    id: quote.serviceRequestId,
    title: 'Reparacion de caneria',
  },
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('quotes routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista cotizaciones de una solicitud propia para que el cliente pueda reservar', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.serviceRequestFindUnique.mockResolvedValue(makeServiceRequest());
    prismaMocks.quoteFindMany.mockResolvedValue([withRelations(makeQuote())]);

    const response = await request(app)
      .get('/service-requests/request-1/quotes')
      .set('Authorization', bearerTokenFor(client));
    const body = response.body as QuoteResponse[];
    const findManyArgs = prismaMocks.quoteFindMany.mock.calls[0]?.[0] as
      | QuoteFindManyArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.serviceRequestId).toBe('request-1');
    expect(body[0]?.professionalId).toBe('pro-1');
    expect(body[0]?.professionalName).toBe('Carlos Mendoza');
    expect(body[0]?.status).toBe('pending');
    expect(findManyArgs?.where?.serviceRequestId).toBe('request-1');
  });
});
