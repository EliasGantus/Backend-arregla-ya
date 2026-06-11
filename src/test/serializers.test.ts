import {
  serializeBooking,
  serializeQuote,
  serializeServiceRequest,
  serializeUser,
} from '../lib/serializers.js';

describe('serializers', () => {
  it('convierte roles y campos del usuario al contrato del frontend', () => {
    expect(
      serializeUser({
        id: '1',
        email: 'cliente@arreglaya.com',
        fullName: 'Lucia Benitez',
        role: 'CLIENTE',
        city: 'Buenos Aires',
        zone: 'Caballito',
      }),
    ).toEqual({
      id: '1',
      email: 'cliente@arreglaya.com',
      fullName: 'Lucia Benitez',
      role: 'cliente',
      city: 'Buenos Aires',
      zone: 'Caballito',
    });
  });

  it('serializa solicitudes y cotizaciones con estados compatibles', () => {
    const request = serializeServiceRequest({
      id: 'sr1',
      title: 'Plomería',
      description: 'Revisión de cañería',
      status: 'QUOTED',
      city: 'Buenos Aires',
      zone: 'Palermo',
      budget: '$85.000',
      photos: [],
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      clientId: 'client-1',
      categoryId: 'cat-1',
      category: {
        id: 'cat-1',
        name: 'Plomería',
        slug: 'plomeria',
      },
    });

    const quote = serializeQuote({
      id: 'q1',
      serviceRequestId: 'sr1',
      professionalId: 'pro-1',
      amount: '$85.000',
      status: 'PENDING',
      message: 'Disponible hoy',
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      professional: {
        id: 'pro-1',
        fullName: 'Carlos Mendoza',
      },
      serviceRequest: {
        id: 'sr1',
        title: 'Plomería',
      },
    });

    expect(request.status).toBe('quoted');
    expect(quote.status).toBe('pending');
    expect(quote.professionalName).toBe('Carlos Mendoza');
  });

  it('agrega metadatos de flujo para solicitudes cotizadas', () => {
    const request = serializeServiceRequest({
      id: 'sr1',
      title: 'Plomeria',
      description: 'Revision de caneria',
      status: 'QUOTED',
      city: 'Buenos Aires',
      zone: 'Palermo',
      budget: '$85.000',
      photos: [],
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      clientId: 'client-1',
      categoryId: 'cat-1',
      category: {
        id: 'cat-1',
        name: 'Plomeria',
        slug: 'plomeria',
      },
    });

    expect(request.statusLabel).toBe('Cotizaciones recibidas');
    expect(request.statusDescription).toContain('Revisa las propuestas');
    expect(request.availableActions).toContain('accept_quote');
    expect(request.nextStep).toMatchObject({
      action: 'accept_quote',
      label: 'Comparar cotizaciones',
    });
  });

  it('guia solicitudes asignadas hacia reservas sin exponer nueva reserva', () => {
    const request = serializeServiceRequest({
      id: 'sr1',
      title: 'Plomeria',
      description: 'Revision de caneria',
      status: 'ASSIGNED',
      city: 'Buenos Aires',
      zone: 'Palermo',
      budget: '$85.000',
      photos: [],
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      clientId: 'client-1',
      categoryId: 'cat-1',
      category: {
        id: 'cat-1',
        name: 'Plomeria',
        slug: 'plomeria',
      },
    });

    expect(request.availableActions).toEqual([]);
    expect(request.availableActions).not.toContain('book');
    expect(request.nextStep).toMatchObject({
      action: null,
      label: 'Seguir reserva',
    });
  });

  it('agrega acciones de pago y cierre a reservas confirmadas sin pago ni resena', () => {
    const booking = serializeBooking({
      id: 'booking-1',
      serviceRequestId: 'sr1',
      clientId: 'client-1',
      professionalId: 'pro-1',
      scheduledAt: new Date('2026-04-05T15:00:00.000Z'),
      status: 'CONFIRMED',
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
        id: 'sr1',
        title: 'Plomeria',
      },
      payment: null,
      review: null,
    });

    expect(booking.availableActions).toEqual(['pay', 'complete_work']);
    expect(booking.nextStep).toMatchObject({
      action: 'pay',
      label: 'Pagar servicio',
    });
    expect(booking.hasPayment).toBe(false);
    expect(booking.hasReview).toBe(false);
  });

  it('agrega accion de resena a reservas completadas pagadas sin resena', () => {
    const booking = serializeBooking({
      id: 'booking-1',
      serviceRequestId: 'sr1',
      clientId: 'client-1',
      professionalId: 'pro-1',
      scheduledAt: new Date('2026-04-05T15:00:00.000Z'),
      status: 'COMPLETED',
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
        id: 'sr1',
        title: 'Plomeria',
      },
      payment: { id: 'payment-1' },
      review: null,
    });

    expect(booking.availableActions).toEqual(['review']);
    expect(booking.nextStep).toMatchObject({
      action: 'review',
      label: 'Calificar servicio',
    });
    expect(booking.hasPayment).toBe(true);
    expect(booking.hasReview).toBe(false);
  });

  it('usa la siguiente accion disponible cuando la reserva confirmada ya tiene pago', () => {
    const booking = serializeBooking({
      id: 'booking-1',
      serviceRequestId: 'sr1',
      clientId: 'client-1',
      professionalId: 'pro-1',
      scheduledAt: new Date('2026-04-05T15:00:00.000Z'),
      status: 'CONFIRMED',
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
        id: 'sr1',
        title: 'Plomeria',
      },
      payment: { id: 'payment-1' },
      review: null,
    });

    expect(booking.availableActions).toEqual(['complete_work']);
    expect(booking.nextStep).toMatchObject({
      action: 'complete_work',
      label: 'Marcar trabajo como terminado',
    });
    expect(booking.hasPayment).toBe(true);
    expect(booking.hasReview).toBe(false);
  });

  it('usa fallback cuando la reserva completada ya tiene resena', () => {
    const booking = serializeBooking({
      id: 'booking-1',
      serviceRequestId: 'sr1',
      clientId: 'client-1',
      professionalId: 'pro-1',
      scheduledAt: new Date('2026-04-05T15:00:00.000Z'),
      status: 'COMPLETED',
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
        id: 'sr1',
        title: 'Plomeria',
      },
      payment: { id: 'payment-1' },
      review: { id: 'review-1' },
    });

    expect(booking.availableActions).toEqual([]);
    expect(booking.nextStep).toEqual({
      action: null,
      label: 'Sin acciones pendientes',
      description: 'Este paso ya fue completado.',
    });
    expect(booking.hasPayment).toBe(true);
    expect(booking.hasReview).toBe(true);
  });

  it('devuelve copias de acciones y siguiente paso en metadatos de flujo', () => {
    const requestInput = {
      id: 'sr1',
      title: 'Plomeria',
      description: 'Revision de caneria',
      status: 'QUOTED' as const,
      city: 'Buenos Aires',
      zone: 'Palermo',
      budget: '$85.000',
      photos: [],
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      clientId: 'client-1',
      categoryId: 'cat-1',
      category: {
        id: 'cat-1',
        name: 'Plomeria',
        slug: 'plomeria',
      },
    };
    const firstRequest = serializeServiceRequest(requestInput);

    firstRequest.availableActions.push('pay');
    firstRequest.nextStep.label = 'Mutado';

    const secondRequest = serializeServiceRequest(requestInput);

    expect(secondRequest.availableActions).toEqual(['accept_quote']);
    expect(secondRequest.nextStep).toMatchObject({
      action: 'accept_quote',
      label: 'Comparar cotizaciones',
    });
  });
});
