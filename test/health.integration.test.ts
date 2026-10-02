import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health API', () => {
  it('should verify API, PostgreSQL and Redis are available', async () => {
    const app = buildApp();

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      status: 'ok',
      services: {
        api: 'ok',
        postgres: 'ok',
        redis: 'ok',
      },
    });

    await app.close();
  });
});