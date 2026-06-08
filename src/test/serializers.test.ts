import { serializeQuote, serializeServiceRequest, serializeUser } from '../lib/serializers.js';

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
});
