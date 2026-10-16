
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { JobQueue } from '../src/infrastructure/queue/job.queue.js';
import { OutboxDispatcher } from '../src/infrastructure/queue/outbox-dispatcher.service.js';

describe('Outbox dispatcher', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('prevents concurrent dispatchers from claiming the same event', async () => {
    const suffix = randomUUID();
    const jobId = `test-job-${suffix}`;

    const event = await prisma.outboxEvent.create({
      data: {
        jobId,
        eventType: 'JOB_QUEUED',
        payload: { jobId },
      },
    });

    const publishedJobIds: string[] = [];

    const fakeQueue = {
      enqueue: async (id: string) => {
        publishedJobIds.push(id);
      },
    } as unknown as JobQueue;

    try {
      const dispatcherA = new OutboxDispatcher(prisma, fakeQueue);
      const dispatcherB = new OutboxDispatcher(prisma, fakeQueue);

      await Promise.all([
        dispatcherA.dispatchPendingEvents(),
        dispatcherB.dispatchPendingEvents(),
      ]);

      const storedEvent = await prisma.outboxEvent.findUnique({
        where: { id: event.id },
      });

      expect(publishedJobIds.filter((id) => id === jobId)).toHaveLength(1);
      expect(storedEvent?.publishedAt).not.toBeNull();
    } finally {
      await prisma.outboxEvent.deleteMany({
        where: { id: event.id },
      });
    }
  });

  it('retries an event after publishing fails', async () => {
    const suffix = randomUUID();
    const jobId = `retry-job-${suffix}`;

    const event = await prisma.outboxEvent.create({
      data: {
        jobId,
        eventType: 'JOB_QUEUED',
        payload: { jobId },
      },
    });

    let shouldFail = true;
    const publishedJobIds: string[] = [];

    const fakeQueue = {
      enqueue: async (id: string) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('Simulated Redis outage');
        }

        publishedJobIds.push(id);
      },
    } as unknown as JobQueue;

    try {
      const dispatcher = new OutboxDispatcher(prisma, fakeQueue);

      await dispatcher.dispatchPendingEvents();

      const failedEvent = await prisma.outboxEvent.findUnique({
        where: { id: event.id },
      });

      expect(failedEvent?.publishedAt).toBeNull();
      expect(failedEvent?.lastError).toContain('Simulated Redis outage');

      await dispatcher.dispatchPendingEvents();

      const retriedEvent = await prisma.outboxEvent.findUnique({
        where: { id: event.id },
      });

      expect(publishedJobIds.filter((id) => id === jobId)).toHaveLength(1);
      expect(retriedEvent?.publishedAt).not.toBeNull();
      expect(retriedEvent?.lastError).toBeNull();
      expect(retriedEvent?.attempts).toBe(2);
    } finally {
      await prisma.outboxEvent.deleteMany({
        where: { id: event.id },
      });
    }
  });
});
