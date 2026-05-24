import { env } from '../config/env.js';
import { HttpError } from './http-error.js';

export type CreatePaymentPreferenceInput = {
  amountCents: number;
  currency: string;
  description: string;
  payerEmail?: string;
  externalReference: string;
};

export type PaymentPreference = {
  externalId: string;
  checkoutUrl: string;
};

export type GatewayPaymentStatus = {
  externalId: string;
  externalReference?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
};

type MercadoPagoPreferenceResponse = {
  id?: unknown;
  init_point?: unknown;
  sandbox_init_point?: unknown;
};

type MercadoPagoPaymentResponse = {
  id?: unknown;
  status?: unknown;
  external_reference?: unknown;
};

const ensureMercadoPagoToken = () => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new HttpError(503, 'La pasarela de pago no esta configurada.', 'PAYMENT_GATEWAY_NOT_CONFIGURED');
    }

    return undefined;
  }

  return env.MERCADOPAGO_ACCESS_TOKEN;
};

const mapMercadoPagoStatus = (status: unknown): GatewayPaymentStatus['status'] => {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
};

export const paymentGateway = {
  async createPreference(input: CreatePaymentPreferenceInput): Promise<PaymentPreference> {
    const token = ensureMercadoPagoToken();

    if (!token) {
      return {
        externalId: `dev-${input.externalReference}`,
        checkoutUrl: `${env.PAYMENT_PENDING_URL}?payment=${encodeURIComponent(input.externalReference)}`,
      };
    }

    const response = await fetch(`${env.MERCADOPAGO_API_BASE_URL}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: input.description,
            quantity: 1,
            currency_id: input.currency,
            unit_price: input.amountCents / 100,
          },
        ],
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        external_reference: input.externalReference,
        back_urls: {
          success: env.PAYMENT_SUCCESS_URL,
          pending: env.PAYMENT_PENDING_URL,
          failure: env.PAYMENT_FAILURE_URL,
        },
        auto_return: 'approved',
      }),
    });

    if (!response.ok) {
      throw new HttpError(502, 'No se pudo crear el pago en la pasarela.', 'PAYMENT_GATEWAY_ERROR');
    }

    const data = (await response.json()) as MercadoPagoPreferenceResponse;
    const externalId = typeof data.id === 'string' ? data.id : undefined;
    const checkoutUrl =
      typeof data.init_point === 'string'
        ? data.init_point
        : typeof data.sandbox_init_point === 'string'
          ? data.sandbox_init_point
          : undefined;

    if (!externalId || !checkoutUrl) {
      throw new HttpError(502, 'La pasarela devolvio una respuesta invalida.', 'PAYMENT_GATEWAY_ERROR');
    }

    return { externalId, checkoutUrl };
  },

  async getPaymentStatus(externalId: string): Promise<GatewayPaymentStatus> {
    const token = ensureMercadoPagoToken();

    if (!token) {
      return {
        externalId,
        status: 'pending',
      };
    }

    const response = await fetch(`${env.MERCADOPAGO_API_BASE_URL}/v1/payments/${externalId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new HttpError(502, 'No se pudo consultar el pago en la pasarela.', 'PAYMENT_GATEWAY_ERROR');
    }

    const data = (await response.json()) as MercadoPagoPaymentResponse;
    const paymentId =
      typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : externalId;

    return {
      externalId: paymentId,
      externalReference:
        typeof data.external_reference === 'string' ? data.external_reference : undefined,
      status: mapMercadoPagoStatus(data.status),
    };
  },
};
