
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';

describe('Worker concurrency', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows exactly one worker to claim a queued job', async () => {
    const suffix = randomUUID();
    const workerA = `test-worker-a-${suffix}`;
    const workerB = `test-worker-b-${suffix}`;

    let userId: string | undefined;
    let jobId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          email: `worker-test-${suffix}@example.com`,
          passwordHash: 'test-password-hash',
        },
      });

      userId = user.id;

      await prisma.worker.createMany({
        data: [
          {
            id: workerA,
            status: 'HEALTHY',
            lastHeartbeat: new Date(),
          },
          {
            id: workerB,
            status: 'HEALTHY',
            lastHeartbeat: new Date(),
          },
        ],
      });

      const job = await prisma.job.create({
        data: {
          userId: user.id,
          type: 'CPU_TASK',
          status: 'QUEUED',
          priority: 5,
          payload: { operation: 'concurrency-test' },
        },
      });

      jobId = job.id;

      // Simulate two workers trying to claim the same job
      // at nearly the same time.
      const claims = await Promise.all([
        prisma.job.updateMany({
          where: {
            id: job.id,
            status: 'QUEUED',
          },
          data: {
            status: 'PROCESSING',
            workerId: workerA,
            attempts: { increment: 1 },
          },
        }),
        prisma.job.updateMany({
          where: {
            id: job.id,
            status: 'QUEUED',
          },
          data: {
            status: 'PROCESSING',
            workerId: workerB,
            attempts: { increment: 1 },
          },
        }),
      ]);

      const successfulClaims = claims.reduce(
        (total, claim) => total + claim.count,
        0,
      );

      const storedJob = await prisma.job.findUnique({
        where: { id: job.id },
      });

      expect(successfulClaims).toBe(1);
      expect(storedJob?.status).toBe('PROCESSING');
      expect([workerA, workerB]).toContain(storedJob?.workerId);
      expect(storedJob?.attempts).toBe(1);
    } finally {
      if (jobId) {
        await prisma.job.deleteMany({ where: { id: jobId } });
      }

      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }

      await prisma.worker.deleteMany({
        where: { id: { in: [workerA, workerB] } },
      });
    }
  });

  
it('prevents a stale worker from completing a reassigned job', async () => {
  const suffix = randomUUID();
  const workerA = `stale-worker-a-${suffix}`;
  const workerB = `stale-worker-b-${suffix}`;

  let userId: string | undefined;
  let jobId: string | undefined;

  try {
    const user = await prisma.user.create({
      data: {
        email: `stale-test-${suffix}@example.com`,
        passwordHash: 'test-password-hash',
      },
    });

    userId = user.id;

    await prisma.worker.createMany({
      data: [
        {
          id: workerA,
          status: 'UNHEALTHY',
          lastHeartbeat: new Date(),
        },
        {
          id: workerB,
          status: 'HEALTHY',
          lastHeartbeat: new Date(),
        },
      ],
    });

    const job = await prisma.job.create({
      data: {
        userId: user.id,
        type: 'CPU_TASK',
        status: 'PROCESSING',
        workerId: workerA,
        attempts: 1,
        payload: { operation: 'stale-worker-test' },
      },
    });

    jobId = job.id;

    // Simulate recovery reassigning the job to worker B.
    await prisma.job.updateMany({
      where: {
        id: job.id,
        status: 'PROCESSING',
        workerId: workerA,
        attempts: 1,
      },
      data: {
        status: 'QUEUED',
        workerId: null,
      },
    });

    // Worker B claims the recovered job.
    const newClaim = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: 'QUEUED',
      },
      data: {
        status: 'PROCESSING',
        workerId: workerB,
        attempts: { increment: 1 },
      },
    });

    expect(newClaim.count).toBe(1);

    // Worker A wakes up and attempts to complete its old attempt.
    const staleCompletion = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: 'PROCESSING',
        workerId: workerA,
        attempts: 1,
      },
      data: {
        status: 'COMPLETED',
        result: { message: 'stale result' },
      },
    });

    const storedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(staleCompletion.count).toBe(0);
    expect(storedJob?.status).toBe('PROCESSING');
    expect(storedJob?.workerId).toBe(workerB);
    expect(storedJob?.attempts).toBe(2);
  } finally {
    if (jobId) {
      await prisma.job.deleteMany({ where: { id: jobId } });
    }

    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    await prisma.worker.deleteMany({
      where: { id: { in: [workerA, workerB] } },
    });
  }
});

});
