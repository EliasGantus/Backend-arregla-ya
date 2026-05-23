import request from 'supertest';

import { createApp } from '../app.js';

describe('GET /health', () => {
  it('responde con estado ok', async () => {
    const app = createApp();
    const response = await request(app).get('/health');
    const body = response.body as { status?: unknown; service?: unknown };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('arreglaya-backend');
  });
});
