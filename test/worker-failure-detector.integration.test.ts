
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { WorkerFailureDetector } from '../src/worker/worker.failure-detector.js';

describe('Worker failure detector', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('marks stale healthy workers unhealthy and handles draining workers safely', async () => {
    const suffix = randomUUID();
    const userId = `failure-test-${suffix}@example.com`;

    const healthyWorker = `healthy-${suffix}`;
    const staleDrainingWorker = `stale-draining-${suffix}`;
    const idleDrainingWorker = `idle-draining-${suffix}`;
    const activeDrainingWorker = `active-draining-${suffix}`;

    let createdUserId: string | undefined;
    const jobIds: string[] = [];

    try {
      const user = await prisma.user.create({
        data: {
          email: userId,
          passwordHash: 'test-password-hash',
        },
      });

      createdUserId = user.id;

      await prisma.worker.createMany({
        data: [
          {
            id: healthyWorker,
            status: 'HEALTHY',
            lastHeartbeat: new Date(0),
          },
          {
            id: staleDrainingWorker,
            status: 'DRAINING',
            lastHeartbeat: new Date(0),
          },
          {
            id: idleDrainingWorker,
            status: 'DRAINING',
            lastHeartbeat: new Date(0),
          },
          {
            id: activeDrainingWorker,
            status: 'DRAINING',
            lastHeartbeat: new Date(),
          },
        ],
      });

      const jobs = await prisma.job.createManyAndReturn({
        data: [
          {
            userId: user.id,
            type: 'CPU_TASK',
            status: 'PROCESSING',
            priority: 5,
            attempts: 1,
            workerId: staleDrainingWorker,
            payload: { test: 'stale-draining' },
          },
          {
            userId: user.id,
            type: 'CPU_TASK',
            status: 'PROCESSING',
            priority: 5,
            attempts: 1,
            workerId: activeDrainingWorker,
            payload: { test: 'active-draining' },
          },
        ],
        select: { id: true },
      });

      jobIds.push(...jobs.map((job) => job.id));

      const detector = new WorkerFailureDetector(prisma);
      await detector.checkWorkers();

      const workers = await prisma.worker.findMany({
        where: {
          id: {
            in: [
              healthyWorker,
              staleDrainingWorker,
              idleDrainingWorker,
              activeDrainingWorker,
            ],
          },
        },
        select: { id: true, status: true },
      });

      const statusById = new Map(
        workers.map((worker) => [worker.id, worker.status]),
      );

      expect(statusById.get(healthyWorker)).toBe('UNHEALTHY');
      expect(statusById.get(staleDrainingWorker)).toBe('UNHEALTHY');
      expect(statusById.get(idleDrainingWorker)).toBe('DRAINING');
      expect(statusById.get(activeDrainingWorker)).toBe('DRAINING');
    } finally {
      if (jobIds.length > 0) {
        await prisma.job.deleteMany({
          where: { id: { in: jobIds } },
        });
      }

      if (createdUserId) {
        await prisma.user.deleteMany({
          where: { id: createdUserId },
        });
      }

      await prisma.worker.deleteMany({
        where: {
          id: {
            in: [
              healthyWorker,
              staleDrainingWorker,
              idleDrainingWorker,
              activeDrainingWorker,
            ],
          },
        },
      });
    }
  });
});
