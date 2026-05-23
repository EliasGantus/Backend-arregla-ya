import type {
  Booking,
  BookingStatus,
  Category,
  Quote,
  QuoteStatus,
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
  'draft' | 'open' | 'quoted' | 'assigned' | 'cancelled'
> = {
  DRAFT: 'draft',
  OPEN: 'open',
  QUOTED: 'quoted',
  ASSIGNED: 'assigned',
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

export const serializeUser = (user: Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'city' | 'zone'>) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: roleMap[user.role],
  city: user.city ?? undefined,
  zone: user.zone ?? undefined,
});

export const serializeCategory = (category: Pick<Category, 'id' | 'name' | 'slug'>) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
});

export const serializeServiceRequest = (
  serviceRequest: ServiceRequest & { category: Pick<Category, 'id' | 'name' | 'slug'> },
) => ({
  id: serviceRequest.id,
  title: serviceRequest.title,
  description: serviceRequest.description,
  status: serviceRequestStatusMap[serviceRequest.status],
  category: serializeCategory(serviceRequest.category),
  city: serviceRequest.city,
  zone: serviceRequest.zone,
  budget: serviceRequest.budget ?? undefined,
  createdAt: serviceRequest.createdAt.toISOString(),
});

export const serializeQuote = (
  quote: Quote & { professional: Pick<User, 'id' | 'fullName'> },
) => ({
  id: quote.id,
  serviceRequestId: quote.serviceRequestId,
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
  },
) => ({
  id: booking.id,
  serviceRequestId: booking.serviceRequestId,
  serviceRequestTitle: booking.serviceRequest.title,
  clientId: booking.clientId,
  clientName: booking.client.fullName,
  professionalId: booking.professionalId,
  professionalName: booking.professional.fullName,
  scheduledAt: booking.scheduledAt.toISOString(),
  status: bookingStatusMap[booking.status],
  notes: booking.notes ?? undefined,
  createdAt: booking.createdAt.toISOString(),
});
