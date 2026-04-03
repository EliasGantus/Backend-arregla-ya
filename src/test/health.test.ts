import request from 'supertest';

import { createApp } from '../app.js';

describe('GET /health', () => {
  it('responde con estado ok', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('arreglaya-backend');
  });
});
