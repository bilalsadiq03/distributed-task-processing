import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Jobs API', () => {
  it('should create a job for an authenticated user', async () => {
    const app = buildApp();

    await app.ready();

    const email = `job-${Date.now()}@example.com`;
    const password = 'StrongPassword123';

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password,
      },
    });

    expect(registerResponse.statusCode).toBe(201);

    const { token } = registerResponse.json();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'CPU_TASK',
        payload: {
          operation: 'calculate',
          value: 100,
        },
        priority: 5,
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();

    expect(body.job).toBeDefined();
    expect(body.job.id).toBeDefined();
    expect(body.job.userId).toBeDefined();
    expect(body.job.type).toBe('CPU_TASK');
    expect(body.job.status).toBe('QUEUED');
    expect(body.job.priority).toBe(5);
    expect(body.job.payload).toEqual({
      operation: 'calculate',
      value: 100,
    });

    await app.close();
  });

  it('should reject unauthenticated job creation', async () => {
    const app = buildApp();

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      payload: {
        type: 'CPU_TASK',
        payload: {
          operation: 'calculate',
        },
      },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('should reject invalid job priority', async () => {
    const app = buildApp();

    await app.ready();

    const email = `priority-${Date.now()}@example.com`;

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'StrongPassword123',
      },
    });

    const { token } = registerResponse.json();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'CPU_TASK',
        payload: {
          operation: 'calculate',
        },
        priority: 15,
      },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('should retrieve a job belonging to the authenticated user', async () => {
    const app = buildApp();

    await app.ready();

    const email = `retrieve-${Date.now()}@example.com`;

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'StrongPassword123',
      },
    });

    const { token } = registerResponse.json();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'IO_TASK',
        payload: {
          operation: 'fetch-data',
        },
        priority: 7,
      },
    });

    const jobId = createResponse.json().job.id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${jobId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.job.id).toBe(jobId);
    expect(body.job.type).toBe('IO_TASK');
    expect(body.job.status).toBe('QUEUED');

    await app.close();
  });

  it('should return 404 when another user requests the job', async () => {
    const app = buildApp();

    await app.ready();

    const firstUserResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `owner-${Date.now()}@example.com`,
        password: 'StrongPassword123',
      },
    });

    const firstUser = firstUserResponse.json();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: {
        authorization: `Bearer ${firstUser.token}`,
      },
      payload: {
        type: 'CPU_TASK',
        payload: {
          operation: 'private-task',
        },
      },
    });

    const jobId = createResponse.json().job.id;

    const secondUserResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `other-${Date.now()}@example.com`,
        password: 'StrongPassword123',
      },
    });

    const secondUser = secondUserResponse.json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${jobId}`,
      headers: {
        authorization: `Bearer ${secondUser.token}`,
      },
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toEqual({
      message: 'Job not found',
    });

    await app.close();
  });
});