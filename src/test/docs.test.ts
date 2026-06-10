import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

type OpenApiResponse = {
  openapi?: unknown;
  info?: {
    title?: unknown;
  };
  paths?: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, {
      required?: string[];
      properties?: Record<string, unknown>;
    }>;
  };
};

describe('docs routes', () => {
  it('expone el documento OpenAPI con los endpoints principales', async () => {
    const response = await request(createApp()).get('/docs/openapi.json');
    const body = response.body as OpenApiResponse;
    const documentedPaths = [
      '/auth/register',
      '/me',
      '/users/{id}',
      '/categories',
      '/service-requests',
      '/quotes/me',
      '/quotes/{id}',
      '/bookings',
      '/professionals/search',
      '/reviews',
      '/payments',
      '/notifications',
      '/admin/users',
    ];

    expect(response.status).toBe(200);
    expect(body.openapi).toBe('3.0.3');
    expect(body.info?.title).toBe('ArreglaYa Backend API');
    expect(body.components?.securitySchemes?.bearerAuth).toBeDefined();
    documentedPaths.forEach((path) => {
      expect(body.paths?.[path]).toBeDefined();
    });
  });

  it('sirve Swagger UI en /docs', async () => {
    const response = await request(createApp()).get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('/docs/openapi.json');
    expect(response.text).toContain('SwaggerUIBundle');
  });

  it('documenta metadatos de flujo en solicitudes y reservas', async () => {
    const response = await request(createApp()).get('/docs/openapi.json');
    const body = response.body as OpenApiResponse;
    const serviceRequest = body.components?.schemas?.ServiceRequest;
    const booking = body.components?.schemas?.Booking;

    expect(response.status).toBe(200);
    expect(body.components?.schemas?.FlowNextStep).toBeDefined();
    expect(serviceRequest?.properties?.status).toMatchObject({
      enum: expect.arrayContaining(['completed']),
    });
    expect(serviceRequest?.properties).toMatchObject({
      statusLabel: { type: 'string' },
      statusDescription: { type: 'string' },
      availableActions: expect.objectContaining({ type: 'array' }),
      nextStep: { $ref: '#/components/schemas/FlowNextStep' },
      photos: expect.objectContaining({ type: 'array' }),
    });
    expect(serviceRequest?.required).toEqual(expect.arrayContaining(['photos']));
    expect(booking?.properties).toMatchObject({
      statusLabel: { type: 'string' },
      statusDescription: { type: 'string' },
      availableActions: expect.objectContaining({ type: 'array' }),
      nextStep: { $ref: '#/components/schemas/FlowNextStep' },
      hasPayment: { type: 'boolean' },
      hasReview: { type: 'boolean' },
    });
    expect(booking?.required).toEqual(expect.arrayContaining(['hasPayment', 'hasReview']));
  });
});
