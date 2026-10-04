import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Authentication API', () => {
  it('should register a new user', async () => {
    const app = buildApp();

    await app.ready();

    const email = `user-${Date.now()}@example.com`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'StrongPassword123',
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();

    expect(body.user.email).toBe(email);
    expect(body.user.id).toBeDefined();
    expect(body.token).toBeDefined();

    await app.close();
  });

  it('should reject invalid credentials', async () => {
    const app = buildApp();

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'does-not-exist@example.com',
        password: 'WrongPassword123',
      },
    });

    expect(response.statusCode).toBe(401);

    expect(response.json()).toEqual({
      message: 'Invalid email or password',
    });

    await app.close();
  });

  it('should reject invalid registration input', async () => {
    const app = buildApp();

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'invalid-email',
        password: '123',
      },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});