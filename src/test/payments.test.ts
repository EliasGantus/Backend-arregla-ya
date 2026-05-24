import type { Booking, Payment, ServiceRequest, User } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { authUtils } from '../lib/auth.js';

type PaymentWithRelations = Payment & {
  booking: Booking & {
    serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
    professional: Pick<User, 'id' | 'fullName'>;
  };
};

type PayableBooking = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

const prismaMocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn<(args: unknown) => Promise<PayableBooking | null>>(),
  paymentCreate: vi.fn<(args: unknown) => Promise<PaymentWithRelations>>(),
  paymentFindFirst: vi.fn<(args: unknown) => Promise<PaymentWithRelations | null>>(),
  paymentFindMany: vi.fn<(args: unknown) => Promise<PaymentWithRelations[]>>(),
  paymentFindUnique: vi.fn<(args: unknown) => Promise<PaymentWithRelations | Payment | null>>(),
  paymentUpdate: vi.fn<(args: unknown) => Promise<PaymentWithRelations | Payment>>(),
  userFindUnique: vi.fn<(args: unknown) => Promise<User | null>>(),
}));

const gatewayMocks = vi.hoisted(() => ({
  createPreference: vi.fn(),
  getPaymentStatus: vi.fn(),
}));

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/arreglaya',
    JWT_ACCESS_SECRET: 'access-secret-dev',
    JWT_REFRESH_SECRET: 'refresh-secret-dev',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGIN: 'http://localhost:5173',
    MERCADOPAGO_ACCESS_TOKEN: undefined,
    MERCADOPAGO_API_BASE_URL: 'https://api.mercadopago.com',
    PAYMENT_SUCCESS_URL: 'http://localhost:5173/pagos/exito',
    PAYMENT_PENDING_URL: 'http://localhost:5173/pagos/pendiente',
    PAYMENT_FAILURE_URL: 'http://localhost:5173/pagos/error',
    MERCADOPAGO_WEBHOOK_SECRET: undefined,
  },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    booking: {
      findUnique: prismaMocks.bookingFindUnique,
    },
    payment: {
      create: prismaMocks.paymentCreate,
      findFirst: prismaMocks.paymentFindFirst,
      findMany: prismaMocks.paymentFindMany,
      findUnique: prismaMocks.paymentFindUnique,
      update: prismaMocks.paymentUpdate,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

vi.mock('../lib/payment-gateway.js', () => ({
  paymentGateway: {
    createPreference: gatewayMocks.createPreference,
    getPaymentStatus: gatewayMocks.getPaymentStatus,
  },
}));

type PaymentResponse = {
  id?: unknown;
  bookingId?: unknown;
  status?: unknown;
  checkoutUrl?: unknown;
  receiptNumber?: unknown;
};

type PaymentCreateArgs = {
  data?: {
    bookingId?: unknown;
    clientId?: unknown;
    amountCents?: unknown;
    currency?: unknown;
    status?: unknown;
    provider?: unknown;
  };
};

type GatewayCreateArgs = {
  amountCents?: unknown;
  currency?: unknown;
  payerEmail?: unknown;
  externalReference?: unknown;
};

type PaymentUpdateArgs = {
  where?: {
    id?: unknown;
  };
  data?: {
    externalId?: unknown;
    checkoutUrl?: unknown;
    status?: unknown;
    receiptNumber?: unknown;
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

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  serviceRequestId: 'request-1',
  clientId: 'client-1',
  professionalId: 'pro-1',
  scheduledAt: new Date('2026-06-05T14:00:00.000Z'),
  status: 'CONFIRMED',
  notes: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  ...overrides,
});

const makePayableBooking = (overrides: Partial<Booking> = {}): PayableBooking => ({
  ...makeBooking(overrides),
  client: {
    id: 'client-1',
    email: 'cliente@arreglaya.com',
    fullName: 'Lucia Benitez',
  },
  professional: {
    id: 'pro-1',
    fullName: 'Carlos Mendoza',
  },
  serviceRequest: {
    id: 'request-1',
    title: 'Reparacion de caneria',
  },
});

const makePayment = (overrides: Partial<Payment> = {}): PaymentWithRelations => ({
  id: 'payment-1',
  bookingId: 'booking-1',
  clientId: 'client-1',
  amountCents: 8500000,
  currency: 'ARS',
  status: 'PENDING',
  provider: 'MERCADO_PAGO',
  externalId: null,
  checkoutUrl: null,
  receiptNumber: null,
  paidAt: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  booking: {
    ...makeBooking(),
    serviceRequest: {
      id: 'request-1',
      title: 'Reparacion de caneria',
    },
    professional: {
      id: 'pro-1',
      fullName: 'Carlos Mendoza',
    },
  },
  ...overrides,
});

const bearerTokenFor = (user: User) =>
  `Bearer ${authUtils.signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  })}`;

describe('payments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea un pago para una reserva confirmada y devuelve la URL de checkout', async () => {
    const app = createApp();
    const client = makeUser();
    const pendingPayment = makePayment();
    const paymentWithCheckout = makePayment({
      externalId: 'mp-pref-1',
      checkoutUrl: 'https://mercadopago.test/checkout',
    });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makePayableBooking());
    prismaMocks.paymentFindUnique.mockResolvedValue(null);
    prismaMocks.paymentCreate.mockResolvedValue(pendingPayment);
    prismaMocks.paymentUpdate.mockResolvedValue(paymentWithCheckout);
    gatewayMocks.createPreference.mockResolvedValue({
      externalId: 'mp-pref-1',
      checkoutUrl: 'https://mercadopago.test/checkout',
    });

    const response = await request(app)
      .post('/bookings/booking-1/payments')
      .set('Authorization', bearerTokenFor(client))
      .send({
        amountCents: 8500000,
        currency: 'ARS',
      });
    const body = response.body as PaymentResponse;
    const createArgs = prismaMocks.paymentCreate.mock.calls[0]?.[0] as
      | PaymentCreateArgs
      | undefined;
    const gatewayArgs = gatewayMocks.createPreference.mock.calls[0]?.[0] as
      | GatewayCreateArgs
      | undefined;
    const updateArgs = prismaMocks.paymentUpdate.mock.calls[0]?.[0] as
      | PaymentUpdateArgs
      | undefined;

    expect(response.status).toBe(201);
    expect(body.status).toBe('pending');
    expect(body.checkoutUrl).toBe('https://mercadopago.test/checkout');
    expect(createArgs?.data?.bookingId).toBe('booking-1');
    expect(createArgs?.data?.clientId).toBe('client-1');
    expect(createArgs?.data?.provider).toBe('MERCADO_PAGO');
    expect(gatewayArgs?.externalReference).toBe('payment-1');
    expect(gatewayArgs?.payerEmail).toBe('cliente@arreglaya.com');
    expect(updateArgs?.data?.externalId).toBe('mp-pref-1');
  });

  it('rechaza pagos de reservas que todavia no estan confirmadas', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makePayableBooking({ status: 'PENDING' }));

    const response = await request(app)
      .post('/bookings/booking-1/payments')
      .set('Authorization', bearerTokenFor(client))
      .send({
        amountCents: 8500000,
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(409);
    expect(body.code).toBe('BOOKING_NOT_PAYABLE');
    expect(prismaMocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('impide que un cliente pague una reserva ajena', async () => {
    const app = createApp();
    const client = makeUser();

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.bookingFindUnique.mockResolvedValue(makePayableBooking({ clientId: 'other-client' }));

    const response = await request(app)
      .post('/bookings/booking-1/payments')
      .set('Authorization', bearerTokenFor(client))
      .send({
        amountCents: 8500000,
      });
    const body = response.body as { code?: unknown };

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(prismaMocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('procesa un webhook aprobado y genera comprobante', async () => {
    const app = createApp();
    const paidAt = new Date('2026-04-03T15:00:00.000Z');
    const pendingPayment = makePayment({ externalId: 'mp-payment-1' });
    const approvedPayment = makePayment({
      externalId: 'mp-payment-1',
      status: 'APPROVED',
      paidAt,
      receiptNumber: 'AY-2026-PAYMENT-',
    });

    gatewayMocks.getPaymentStatus.mockResolvedValue({
      externalId: 'mp-payment-1',
      externalReference: 'payment-1',
      status: 'approved',
    });
    prismaMocks.paymentFindUnique.mockResolvedValue(pendingPayment);
    prismaMocks.paymentUpdate.mockResolvedValue(approvedPayment);

    const response = await request(app)
      .post('/payments/webhooks/mercadopago')
      .send({
        data: {
          id: 'mp-payment-1',
        },
      });
    const body = response.body as PaymentResponse;
    const updateArgs = prismaMocks.paymentUpdate.mock.calls[0]?.[0] as
      | PaymentUpdateArgs
      | undefined;

    expect(response.status).toBe(200);
    expect(body.status).toBe('approved');
    expect(body.receiptNumber).toBe('AY-2026-PAYMENT-');
    expect(updateArgs?.data?.status).toBe('APPROVED');
    expect(updateArgs?.data?.receiptNumber).toBe('AY-2026-PAYMENT-');
  });

  it('devuelve el comprobante para un pago aprobado', async () => {
    const app = createApp();
    const client = makeUser();
    const approvedPayment = makePayment({
      status: 'APPROVED',
      paidAt: new Date('2026-04-03T15:00:00.000Z'),
      receiptNumber: 'AY-2026-PAYMENT-1',
    });

    prismaMocks.userFindUnique.mockResolvedValue(client);
    prismaMocks.paymentFindUnique.mockResolvedValue(approvedPayment);

    const response = await request(app)
      .get('/payments/payment-1/receipt')
      .set('Authorization', bearerTokenFor(client));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      receiptNumber: 'AY-2026-PAYMENT-1',
      paymentId: 'payment-1',
      bookingId: 'booking-1',
      amountCents: 8500000,
      currency: 'ARS',
    });
  });
});
