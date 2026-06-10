import type {
  Booking,
  BookingStatus,
  Category,
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Payment,
  PaymentProvider,
  PaymentStatus,
  Quote,
  QuoteStatus,
  Review,
  ServiceRequest,
  ServiceRequestStatus,
  User,
  UserRole,
} from '@prisma/client';

const roleMap: Record<UserRole, 'cliente' | 'profesional' | 'admin'> = {
  CLIENTE: 'cliente',
  PROFESIONAL: 'profesional',
  ADMIN: 'admin',
};

const serviceRequestStatusMap: Record<
  ServiceRequestStatus,
  'draft' | 'open' | 'quoted' | 'assigned' | 'completed' | 'cancelled'
> = {
  DRAFT: 'draft',
  OPEN: 'open',
  QUOTED: 'quoted',
  ASSIGNED: 'assigned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const quoteStatusMap: Record<QuoteStatus, 'pending' | 'accepted' | 'rejected' | 'withdrawn'> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
};

const bookingStatusMap: Record<
  BookingStatus,
  'pending' | 'confirmed' | 'completed' | 'cancelled'
> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export type FlowAction =
  | 'create_quote'
  | 'accept_quote'
  | 'book'
  | 'confirm_booking'
  | 'pay'
  | 'complete_work'
  | 'review';

type FlowStep = {
  action: FlowAction | null;
  label: string;
  description: string;
};

type FlowCopy = {
  statusLabel: string;
  statusDescription: string;
  availableActions: FlowAction[];
  next: FlowStep;
};

const completedStep: FlowStep = {
  action: null,
  label: 'Sin acciones pendientes',
  description: 'Este paso ya fue completado.',
};

const actionNextSteps: Partial<Record<FlowAction, FlowStep>> = {
  complete_work: {
    action: 'complete_work',
    label: 'Marcar trabajo como terminado',
    description: 'Finaliza el trabajo para habilitar la calificacion del cliente.',
  },
};

const serviceRequestFlowCopy: Record<ServiceRequestStatus, FlowCopy> = {
  DRAFT: {
    statusLabel: 'Borrador',
    statusDescription: 'Completa los datos de la solicitud antes de publicarla.',
    availableActions: [],
    next: {
      action: null,
      label: 'Completar solicitud',
      description: 'Agrega la informacion necesaria para que los profesionales puedan cotizar.',
    },
  },
  OPEN: {
    statusLabel: 'Solicitud abierta',
    statusDescription: 'Los profesionales pueden revisar el pedido y enviar cotizaciones.',
    availableActions: ['create_quote'],
    next: {
      action: 'create_quote',
      label: 'Enviar cotizacion',
      description: 'Prepara una propuesta para que el cliente pueda evaluarla.',
    },
  },
  QUOTED: {
    statusLabel: 'Cotizaciones recibidas',
    statusDescription: 'Revisa las propuestas disponibles y elegi la mejor opcion.',
    availableActions: ['accept_quote'],
    next: {
      action: 'accept_quote',
      label: 'Comparar cotizaciones',
      description: 'Compara precios, mensajes y profesionales antes de aceptar una propuesta.',
    },
  },
  ASSIGNED: {
    statusLabel: 'Profesional asignado',
    statusDescription: 'La solicitud ya tiene un profesional seleccionado para coordinar el servicio.',
    availableActions: [],
    next: {
      action: null,
      label: 'Seguir reserva',
      description: 'Revisa el estado desde tus reservas.',
    },
  },
  COMPLETED: {
    statusLabel: 'Trabajo completado',
    statusDescription: 'El servicio fue marcado como completado.',
    availableActions: [],
    next: completedStep,
  },
  CANCELLED: {
    statusLabel: 'Solicitud cancelada',
    statusDescription: 'La solicitud fue cancelada y no requiere nuevas acciones.',
    availableActions: [],
    next: completedStep,
  },
};

const bookingFlowCopy: Record<BookingStatus, FlowCopy> = {
  PENDING: {
    statusLabel: 'Reserva pendiente',
    statusDescription: 'La reserva espera confirmacion del profesional.',
    availableActions: ['confirm_booking'],
    next: {
      action: 'confirm_booking',
      label: 'Confirmar reserva',
      description: 'Confirma el horario para dejar la visita agendada.',
    },
  },
  CONFIRMED: {
    statusLabel: 'Reserva confirmada',
    statusDescription: 'La reserva esta confirmada y lista para avanzar con el pago o cierre del trabajo.',
    availableActions: ['pay', 'complete_work'],
    next: {
      action: 'pay',
      label: 'Pagar servicio',
      description: 'Completa el pago para registrar el servicio.',
    },
  },
  COMPLETED: {
    statusLabel: 'Trabajo completado',
    statusDescription: 'El trabajo finalizo y el cliente puede dejar su calificacion.',
    availableActions: ['review'],
    next: {
      action: 'review',
      label: 'Calificar servicio',
      description: 'Comparte tu experiencia para ayudar a otros clientes.',
    },
  },
  CANCELLED: {
    statusLabel: 'Reserva cancelada',
    statusDescription: 'La reserva fue cancelada y no requiere nuevas acciones.',
    availableActions: [],
    next: completedStep,
  },
};

const resolveNextStep = (flow: FlowCopy, availableActions: FlowAction[]) => {
  if (flow.next.action && !availableActions.includes(flow.next.action)) {
    const nextAction = availableActions[0];

    if (nextAction && actionNextSteps[nextAction]) {
      return actionNextSteps[nextAction];
    }

    return completedStep;
  }

  return flow.next;
};

const paymentStatusMap: Record<
  PaymentStatus,
  'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded'
> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

const paymentProviderMap: Record<PaymentProvider, 'mercado_pago'> = {
  MERCADO_PAGO: 'mercado_pago',
};

const notificationTypeMap: Record<
  NotificationType,
  'booking_created' | 'booking_confirmed' | 'booking_reminder' | 'booking_status_changed'
> = {
  BOOKING_CREATED: 'booking_created',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_REMINDER: 'booking_reminder',
  BOOKING_STATUS_CHANGED: 'booking_status_changed',
};

const notificationChannelMap: Record<NotificationChannel, 'push' | 'email'> = {
  PUSH: 'push',
  EMAIL: 'email',
};

const notificationStatusMap: Record<NotificationStatus, 'pending' | 'sent' | 'failed'> = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
};

export const serializeUser = (
  user: Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'city' | 'zone'> &
    Partial<Pick<User, 'ratingAverage' | 'ratingCount'>>,
) => {
  const serialized = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: roleMap[user.role],
    city: user.city ?? undefined,
    zone: user.zone ?? undefined,
  };

  if (typeof user.ratingAverage === 'number' && typeof user.ratingCount === 'number') {
    return {
      ...serialized,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
    };
  }

  return serialized;
};

export const serializeCategory = (category: Pick<Category, 'id' | 'name' | 'slug'>) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
});

export const serializeServiceRequest = (
  serviceRequest: ServiceRequest & { category: Pick<Category, 'id' | 'name' | 'slug'> },
) => {
  const flow = serviceRequestFlowCopy[serviceRequest.status];
  const availableActions = flow.availableActions;

  return {
    id: serviceRequest.id,
    title: serviceRequest.title,
    description: serviceRequest.description,
    status: serviceRequestStatusMap[serviceRequest.status],
    statusLabel: flow.statusLabel,
    statusDescription: flow.statusDescription,
    availableActions: [...availableActions],
    nextStep: { ...resolveNextStep(flow, availableActions) },
    category: serializeCategory(serviceRequest.category),
    city: serviceRequest.city,
    zone: serviceRequest.zone,
    budget: serviceRequest.budget ?? undefined,
    photos: serviceRequest.photos,
    createdAt: serviceRequest.createdAt.toISOString(),
  };
};

export const serializeQuote = (
  quote: Quote & {
    professional: Pick<User, 'id' | 'fullName'>;
    serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
  },
) => ({
  id: quote.id,
  serviceRequestId: quote.serviceRequestId,
  serviceRequestTitle: quote.serviceRequest.title,
  professionalId: quote.professionalId,
  professionalName: quote.professional.fullName,
  amount: quote.amount,
  status: quoteStatusMap[quote.status],
  message: quote.message,
  createdAt: quote.createdAt.toISOString(),
});

export const serializeBooking = (
  booking: Booking & {
    client: Pick<User, 'id' | 'fullName'>;
    professional: Pick<User, 'id' | 'fullName'>;
    serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
    payment: Pick<Payment, 'id'> | null;
    review: Pick<Review, 'id'> | null;
  },
) => {
  const flow = bookingFlowCopy[booking.status];
  const hasPayment = Boolean(booking.payment);
  const hasReview = Boolean(booking.review);
  const availableActions = flow.availableActions.filter((action) => {
    if (action === 'pay') {
      return !hasPayment;
    }

    if (action === 'review') {
      return !hasReview;
    }

    return true;
  });

  return {
    id: booking.id,
    serviceRequestId: booking.serviceRequestId,
    serviceRequestTitle: booking.serviceRequest.title,
    clientId: booking.clientId,
    clientName: booking.client.fullName,
    professionalId: booking.professionalId,
    professionalName: booking.professional.fullName,
    scheduledAt: booking.scheduledAt.toISOString(),
    status: bookingStatusMap[booking.status],
    statusLabel: flow.statusLabel,
    statusDescription: flow.statusDescription,
    availableActions: [...availableActions],
    nextStep: { ...resolveNextStep(flow, availableActions) },
    hasPayment,
    hasReview,
    notes: booking.notes ?? undefined,
    createdAt: booking.createdAt.toISOString(),
  };
};

export const serializePayment = (
  payment: Payment & {
    booking: Booking & {
      serviceRequest: Pick<ServiceRequest, 'id' | 'title'>;
      professional: Pick<User, 'id' | 'fullName'>;
    };
  },
) => ({
  id: payment.id,
  bookingId: payment.bookingId,
  serviceRequestId: payment.booking.serviceRequestId,
  serviceRequestTitle: payment.booking.serviceRequest.title,
  professionalId: payment.booking.professionalId,
  professionalName: payment.booking.professional.fullName,
  amountCents: payment.amountCents,
  currency: payment.currency,
  status: paymentStatusMap[payment.status],
  provider: paymentProviderMap[payment.provider],
  checkoutUrl: payment.checkoutUrl ?? undefined,
  receiptNumber: payment.receiptNumber ?? undefined,
  paidAt: payment.paidAt?.toISOString(),
  createdAt: payment.createdAt.toISOString(),
});

export const serializeNotification = (notification: Notification) => ({
  id: notification.id,
  type: notificationTypeMap[notification.type],
  channel: notificationChannelMap[notification.channel],
  status: notificationStatusMap[notification.status],
  title: notification.title,
  body: notification.body,
  recipientId: notification.recipientId,
  bookingId: notification.bookingId ?? undefined,
  metadata: notification.metadata ?? undefined,
  readAt: notification.readAt?.toISOString(),
  sentAt: notification.sentAt?.toISOString(),
  createdAt: notification.createdAt.toISOString(),
});

export const serializeReview = (
  review: Review & {
    client: Pick<User, 'id' | 'fullName'>;
    professional: Pick<User, 'id' | 'fullName'>;
    booking: Pick<Booking, 'id' | 'serviceRequestId'>;
  },
) => ({
  id: review.id,
  bookingId: review.bookingId,
  serviceRequestId: review.booking.serviceRequestId,
  clientId: review.clientId,
  clientName: review.client.fullName,
  professionalId: review.professionalId,
  professionalName: review.professional.fullName,
  rating: review.rating,
  comment: review.comment ?? undefined,
  createdAt: review.createdAt.toISOString(),
});
