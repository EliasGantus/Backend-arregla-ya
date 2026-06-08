import type { Quote, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

const prismaMocks = vi.hoisted(() => ({
  quoteFindMany: vi.fn<(args: unknown) => Promise<QuoteWithRelations[]>>(),
  quoteFindUnique: vi.fn<(args: unknown) => Promise<QuoteWithServiceRequest | null>>(),
  quoteUpdate: vi.fn<(args: unknown) => Promise<QuoteWithRelations>>(),
  quoteUpdateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  serviceRequestFindUnique: vi.fn<(args: unknown) => Promise<ServiceRequest | null>>(),
  serviceRequestUpdate: vi.fn<(args: unknown) => Promise<ServiceRequest>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    quote: {
      findMany: prismaMocks.quoteFindMany,
      findUnique: prismaMocks.quoteFindUnique,
      update: prismaMocks.quoteUpdate,
      updateMany: prismaMocks.quoteUpdateMany,
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

type QuoteWithRelations = Quote & {
  professional: Pick<User, 'id' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

type QuoteWithServiceRequest = Quote & {
  serviceRequest: Pick<ServiceRequest, 'id' | 'clientId' | 'status'>;
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

type QuoteUpdateArgs = {
  where?: {
    id?: unknown;
    serviceRequestId_professionalId?: {
      serviceRequestId?: unknown;
      professionalId?: unknown;
    };
  };
  data?: {
    status?: unknown;
  };
};

type QuoteUpdateManyArgs = {
  where?: {
    serviceRequestId?: unknown;
    id?: {
      not?: unknown;
    };
  };
  data?: {
    status?: unknown;
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

const withServiceRequest = (
  quote: Quote,
  serviceRequest: ServiceRequest = makeServiceRequest(),
): QuoteWithServiceRequest => ({
  ...quote,
  serviceRequest: {
    id: serviceRequest.id,
    clientId: serviceRequest.clientId,
    status: serviceRequest.status,
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

  it('permite que el cliente acepte una cotizacion de su solicitud', async () => {
    const app = createApp();
    const client = makeUser();
    const quote = makeQuote();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.quoteFindUnique.mockResolvedValue(withServiceRequest(quote));
    prismaMocks.quoteUpdate.mockResolvedValue(withRelations({ ...quote, status: 'ACCEPTED' }));
    prismaMocks.quoteUpdateMany.mockResolvedValue({ count: 1 });
    prismaMocks.serviceRequestUpdate.mockResolvedValue(makeServiceRequest({ status: 'ASSIGNED' }));

    const response = await request(app)
      .patch('/quotes/quote-1')
      .set('Authorization', bearerTokenFor(client))
      .send({ status: 'accepted' });
    const body = response.body as QuoteResponse;
    const quoteUpdateArgs = prismaMocks.quoteUpdate.mock.calls[0]?.[0] as
      | QuoteUpdateArgs
      | undefined;
    const quoteUpdateManyArgs = prismaMocks.quoteUpdateMany.mock.calls[0]?.[0] as
      | QuoteUpdateManyArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('accepted');
    expect(quoteUpdateArgs?.where?.id).toBe('quote-1');
    expect(quoteUpdateArgs?.data?.status).toBe('ACCEPTED');
    expect(quoteUpdateManyArgs?.where?.serviceRequestId).toBe('request-1');
    expect(quoteUpdateManyArgs?.where?.id?.not).toBe('quote-1');
    expect(quoteUpdateManyArgs?.data?.status).toBe('REJECTED');
    expect(prismaMocks.serviceRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'ASSIGNED' },
    });
  });

  it('permite que el cliente rechace una cotizacion de su solicitud', async () => {
    const app = createApp();
    const client = makeUser();
    const quote = makeQuote();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.quoteFindUnique.mockResolvedValue(withServiceRequest(quote));
    prismaMocks.quoteUpdate.mockResolvedValue(withRelations({ ...quote, status: 'REJECTED' }));

    const response = await request(app)
      .patch('/quotes/quote-1')
      .set('Authorization', bearerTokenFor(client))
      .send({ status: 'rejected' });
    const body = response.body as QuoteResponse;

    expect(response.status).toBe(200);
    expect(body.status).toBe('rejected');
    expect(prismaMocks.quoteUpdateMany).not.toHaveBeenCalled();
    expect(prismaMocks.serviceRequestUpdate).not.toHaveBeenCalled();
  });

  it('impide actualizar cotizaciones de solicitudes de otro cliente', async () => {
    const app = createApp();
    const client = makeUser();
    const quote = makeQuote();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.quoteFindUnique.mockResolvedValue(
      withServiceRequest(quote, makeServiceRequest({ clientId: 'other-client' })),
    );

    const response = await request(app)
      .patch('/quotes/quote-1')
      .set('Authorization', bearerTokenFor(client))
      .send({ status: 'accepted' });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(prismaMocks.quoteUpdate).not.toHaveBeenCalled();
  });
});
