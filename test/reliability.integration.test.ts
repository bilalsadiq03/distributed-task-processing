import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { JobQueue } from '../src/infrastructure/queue/job.queue.js';
import { RetryScheduler } from '../src/worker/retry-scheduler.service.js';
import { TaskExecutor } from '../src/worker/task.executor.js';
import { WorkerService } from '../src/worker/worker.service.js';
import { JobRecoveryService } from '../src/worker/job-recovery.service.js';

const fakeQueue = {
  acknowledge: async () => undefined,
  dequeue: async () => null,
  enqueue: async () => undefined,
  requeueInFlight: async () => 0,
} as unknown as JobQueue;

describe('Reliability module', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('records attempts, retries with backoff, and dead-letters after retries are exhausted', async () => {
    const suffix = randomUUID();
    const workerId = `retry-worker-${suffix}`;
    let userId: string | undefined;
    let jobId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          email: `retry-${suffix}@example.com`,
          passwordHash: 'test-password-hash',
        },
      });
      userId = user.id;

      await prisma.worker.create({
        data: {
          id: workerId,
          status: 'HEALTHY',
          lastHeartbeat: new Date(),
        },
      });

      const job = await prisma.job.create({
        data: {
          userId: user.id,
          type: 'CPU_TASK',
          status: 'QUEUED',
          priority: 5,
          maxRetries: 1,
          payload: { simulateFailure: true },
        },
      });
      jobId = job.id;

      const worker = new WorkerService(
        prisma,
        fakeQueue,
        new TaskExecutor(),
        workerId,
      );

      await worker.processJob(job.id);

      const firstAttempt = await prisma.job.findUniqueOrThrow({
        where: { id: job.id },
        include: { jobAttempts: true },
      });

      expect(firstAttempt.status).toBe('RETRYING');
      expect(firstAttempt.attempts).toBe(1);
      expect(firstAttempt.scheduledAt).not.toBeNull();
      expect(firstAttempt.jobAttempts).toHaveLength(1);
      expect(firstAttempt.jobAttempts[0].status).toBe('FAILED');

      await prisma.job.update({
        where: { id: job.id },
        data: { scheduledAt: new Date(0) },
      });

      const scheduler = new RetryScheduler(prisma);
      const scheduled = await scheduler.scheduleDueRetries();

      expect(scheduled).toBeGreaterThanOrEqual(1);

      const queuedRetry = await prisma.job.findUniqueOrThrow({
        where: { id: job.id },
      });

      expect(queuedRetry.status).toBe('QUEUED');
      expect(queuedRetry.scheduledAt).toBeNull();

      await worker.processJob(job.id);

      const deadLetter = await prisma.job.findUniqueOrThrow({
        where: { id: job.id },
        include: { jobAttempts: { orderBy: { attemptNumber: 'asc' } } },
      });

      expect(deadLetter.status).toBe('DEAD_LETTER');
      expect(deadLetter.attempts).toBe(2);
      expect(deadLetter.jobAttempts).toHaveLength(2);
      expect(deadLetter.jobAttempts.map((attempt) => attempt.status)).toEqual([
        'FAILED',
        'FAILED',
      ]);
    } finally {
      if (jobId) {
        await prisma.outboxEvent.deleteMany({ where: { jobId } });
        await prisma.job.deleteMany({ where: { id: jobId } });
      }

      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }

      await prisma.worker.deleteMany({ where: { id: workerId } });
    }
  });

  it('recovers processing jobs from unhealthy workers and closes the interrupted attempt', async () => {
    const suffix = randomUUID();
    const workerId = `recovery-worker-${suffix}`;
    let userId: string | undefined;
    let jobId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          email: `recovery-${suffix}@example.com`,
          passwordHash: 'test-password-hash',
        },
      });
      userId = user.id;

      await prisma.worker.create({
        data: {
          id: workerId,
          status: 'UNHEALTHY',
          lastHeartbeat: new Date(0),
        },
      });

      const job = await prisma.job.create({
        data: {
          userId: user.id,
          type: 'CPU_TASK',
          status: 'PROCESSING',
          priority: 5,
          attempts: 1,
          workerId,
          payload: { operation: 'recover' },
          jobAttempts: {
            create: {
              workerId,
              attemptNumber: 1,
              status: 'PROCESSING',
              startedAt: new Date(),
            },
          },
        },
      });
      jobId = job.id;

      const recovery = new JobRecoveryService(prisma);
      const recovered = await recovery.recoverJobsFromUnhealthyWorkers();

      expect(recovered).toBeGreaterThanOrEqual(1);

      const storedJob = await prisma.job.findUniqueOrThrow({
        where: { id: job.id },
        include: {
          jobAttempts: true,
        },
      });

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { jobId: job.id },
      });

      expect(storedJob.status).toBe('QUEUED');
      expect(storedJob.workerId).toBeNull();
      expect(storedJob.jobAttempts[0].status).toBe('FAILED');
      expect(storedJob.jobAttempts[0].completedAt).not.toBeNull();
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0].publishedAt).toBeNull();
    } finally {
      if (jobId) {
        await prisma.outboxEvent.deleteMany({ where: { jobId } });
        await prisma.job.deleteMany({ where: { id: jobId } });
      }

      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }

      await prisma.worker.deleteMany({ where: { id: workerId } });
    }
  });
});
