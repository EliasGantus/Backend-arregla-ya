import type { Booking, PaymentStatus, ServiceRequest, User, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { paymentGateway } from '../../lib/payment-gateway.js';
import { prisma } from '../../lib/prisma.js';
import { serializePayment } from '../../lib/serializers.js';
import { env } from '../../config/env.js';
import { authenticate, requireRoles } from '../../middleware/authenticate.js';

type PayableBooking = Booking & {
  client: Pick<User, 'id' | 'email' | 'fullName'>;
  professional: Pick<User, 'id' | 'fullName'>;
  serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
};

const payableStatuses = ['CONFIRMED', 'COMPLETED'] as const;

const paymentInclude = {
  booking: {
    include: {
      serviceRequest: {
        select: {
          id: true,
          title: true,
        },
      },
      professional: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },
} as const;

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

const createPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).default('ARS'),
  description: z.string().min(4).optional(),
});

const webhookSchema = z.object({
  externalId: z.string().optional(),
  externalReference: z.string().optional(),
  external_reference: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'canceled', 'refunded']).optional(),
  data: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

const gatewayStatusMap: Record<
  'pending' | 'approved' | 'rejected' | 'cancelled' | 'canceled' | 'refunded',
  PaymentStatus
> = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  refunded: 'REFUNDED',
};

const canAccessPayment = (
  role: UserRole,
  userId: string,
  payment: { clientId: string; booking: { professionalId: string } },
) => role === 'ADMIN' || payment.clientId === userId || payment.booking.professionalId === userId;

const generateReceiptNumber = (paymentId: string) =>
  `AY-${new Date().getFullYear()}-${paymentId.slice(0, 8).toUpperCase()}`;

const assertWebhookSecret = (secret: unknown) => {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    return;
  }

  if (secret !== env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new HttpError(401, 'Webhook no autorizado.', 'WEBHOOK_UNAUTHORIZED');
  }
};

const findPaymentFromGatewayReference = async (
  externalId: string | undefined,
  externalReference: string | undefined,
) => {
  if (externalReference) {
    const payment = await prisma.payment.findUnique({
      where: { id: externalReference },
      include: paymentInclude,
    });

    if (payment) {
      return payment;
    }
  }

  if (!externalId) {
    return null;
  }

  return prisma.payment.findFirst({
    where: { externalId },
    include: paymentInclude,
  });
};

export const paymentsRouter = Router();

paymentsRouter.post(
  '/payments/webhooks/mercadopago',
  asyncHandler(async (request, response) => {
    assertWebhookSecret(request.headers['x-webhook-secret']);

    const payload = webhookSchema.parse(request.body);
    const dataId = payload.data?.id ? String(payload.data.id) : undefined;
    const gatewayStatus = dataId
      ? await paymentGateway.getPaymentStatus(dataId)
      : {
          externalId: payload.externalId,
          externalReference: payload.externalReference ?? payload.external_reference,
          status: payload.status ?? 'pending',
        };

    const payment = await findPaymentFromGatewayReference(
      gatewayStatus.externalId,
      gatewayStatus.externalReference,
    );

    if (!payment) {
      throw new HttpError(404, 'Pago no encontrado.', 'PAYMENT_NOT_FOUND');
    }

    const status = gatewayStatusMap[gatewayStatus.status];
    const approved = status === 'APPROVED';
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status,
        paidAt: approved ? (payment.paidAt ?? new Date()) : payment.paidAt,
        receiptNumber: approved
          ? (payment.receiptNumber ?? generateReceiptNumber(payment.id))
          : payment.receiptNumber,
      },
      include: paymentInclude,
    });

    response.json(serializePayment(updated));
  }),
);

paymentsRouter.get(
  '/payments',
  authenticate,
  asyncHandler(async (request, response) => {
    const where =
      request.auth!.role === 'CLIENTE'
        ? { clientId: request.auth!.userId }
        : request.auth!.role === 'PROFESIONAL'
          ? { booking: { professionalId: request.auth!.userId } }
          : {};

    const payments = await prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    });

    response.json(payments.map(serializePayment));
  }),
);

paymentsRouter.get(
  '/payments/:id',
  authenticate,
  asyncHandler(async (request, response) => {
    const payment = await prisma.payment.findUnique({
      where: { id: String(request.params.id) },
      include: paymentInclude,
    });

    if (!payment) {
      throw new HttpError(404, 'Pago no encontrado.', 'PAYMENT_NOT_FOUND');
    }

    if (!canAccessPayment(request.auth!.role, request.auth!.userId, payment)) {
      throw new HttpError(403, 'No tienes permisos para acceder a este pago.', 'FORBIDDEN');
    }

    response.json(serializePayment(payment));
  }),
);

paymentsRouter.get(
  '/payments/:id/receipt',
  authenticate,
  asyncHandler(async (request, response) => {
    const payment = await prisma.payment.findUnique({
      where: { id: String(request.params.id) },
      include: paymentInclude,
    });

    if (!payment) {
      throw new HttpError(404, 'Pago no encontrado.', 'PAYMENT_NOT_FOUND');
    }

    if (!canAccessPayment(request.auth!.role, request.auth!.userId, payment)) {
      throw new HttpError(403, 'No tienes permisos para acceder a este comprobante.', 'FORBIDDEN');
    }

    if (payment.status !== 'APPROVED' || !payment.receiptNumber || !payment.paidAt) {
      throw new HttpError(409, 'El comprobante todavia no esta disponible.', 'RECEIPT_NOT_AVAILABLE');
    }

    response.json({
      receiptNumber: payment.receiptNumber,
      paymentId: payment.id,
      bookingId: payment.bookingId,
      serviceRequestTitle: payment.booking.serviceRequest.title,
      professionalName: payment.booking.professional.fullName,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paidAt: payment.paidAt.toISOString(),
    });
  }),
);

paymentsRouter.post(
  '/bookings/:id/payments',
  authenticate,
  requireRoles(['CLIENTE', 'ADMIN']),
  asyncHandler(async (request, response) => {
    const payload = createPaymentSchema.parse(request.body);
    const booking = (await prisma.booking.findUnique({
      where: { id: String(request.params.id) },
      include: bookingInclude,
    })) as PayableBooking | null;

    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada.', 'BOOKING_NOT_FOUND');
    }

    if (request.auth!.role === 'CLIENTE' && booking.clientId !== request.auth!.userId) {
      throw new HttpError(403, 'No puedes pagar una reserva de otro cliente.', 'FORBIDDEN');
    }

    if (!payableStatuses.includes(booking.status as (typeof payableStatuses)[number])) {
      throw new HttpError(409, 'La reserva todavia no esta lista para pagar.', 'BOOKING_NOT_PAYABLE');
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId: booking.id },
    });

    if (existingPayment) {
      throw new HttpError(409, 'La reserva ya tiene un pago asociado.', 'PAYMENT_EXISTS');
    }

    const description = payload.description ?? `Servicio ArreglaYa: ${booking.serviceRequest.title}`;
    const pendingPayment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        clientId: booking.clientId,
        amountCents: payload.amountCents,
        currency: payload.currency.toUpperCase(),
        status: 'PENDING',
        provider: 'MERCADO_PAGO',
      },
      include: paymentInclude,
    });

    try {
      const preference = await paymentGateway.createPreference({
        amountCents: pendingPayment.amountCents,
        currency: pendingPayment.currency,
        description,
        payerEmail: booking.client.email,
        externalReference: pendingPayment.id,
      });

      const payment = await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          externalId: preference.externalId,
          checkoutUrl: preference.checkoutUrl,
        },
        include: paymentInclude,
      });

      response.status(201).json(serializePayment(payment));
    } catch (error) {
      await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: { status: 'REJECTED' },
      });

      throw error;
    }
  }),
);
