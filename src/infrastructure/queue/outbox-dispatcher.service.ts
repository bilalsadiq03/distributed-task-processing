
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { JobQueue } from './job.queue.js';

type ClaimedEvent = {
  id: string;
  jobId: string;
  eventType: string;
  payload: Prisma.JsonValue;
};

export class OutboxDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly dispatcherId = `dispatcher-${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    private readonly pollIntervalMs = 1_000,
    private readonly leaseMs = 30_000,
  ) {}

  private async claimBatch(): Promise<ClaimedEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<ClaimedEvent[]>`
        SELECT id, job_id AS "jobId", event_type AS "eventType", payload
        FROM outbox_events
        WHERE published_at IS NULL
          AND (locked_until IS NULL OR locked_until < NOW())
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `;

      if (events.length === 0) return [];

      const ids = events.map((event) => event.id);
      const lockedUntil = new Date(Date.now() + this.leaseMs);

      await tx.outboxEvent.updateMany({
        where: { id: { in: ids }, publishedAt: null },
        data: {
          lockedBy: this.dispatcherId,
          lockedUntil,
          attempts: { increment: 1 },
        },
      });

      return events;
    });
  }

  async dispatchPendingEvents(): Promise<number> {
    const events = await this.claimBatch();
    let publishedCount = 0;

    for (const event of events) {
      try {
        if (event.eventType !== 'JOB_QUEUED') {
          throw new Error(`Unsupported event type: ${event.eventType}`);
        }

        const payload = event.payload as { jobId?: unknown };

        if (typeof payload.jobId !== 'string') {
          throw new Error('Outbox event has an invalid jobId');
        }

        if (payload.jobId !== event.jobId) {
          throw new Error('Outbox event payload jobId does not match event jobId');
        }

        await this.queue.enqueue(payload.jobId);

        const marked = await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            publishedAt: null,
            lockedBy: this.dispatcherId,
          },
          data: {
            publishedAt: new Date(),
            lockedBy: null,
            lockedUntil: null,
            lastError: null,
          },
        });

        if (marked.count === 1) {
          publishedCount++;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        console.error(`[Outbox] Event ${event.id} failed: ${message}`);

        await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            publishedAt: null,
            lockedBy: this.dispatcherId,
          },
          data: {
            lockedBy: null,
            lockedUntil: null,
            lastError: message.slice(0, 2_000),
          },
        }).catch((updateError) => {
          console.error('[Outbox] Failed to release event lease:', updateError);
        });
      }
    }

    return publishedCount;
  }

  start(): void {
    if (this.timer) return;

    const poll = async () => {
      if (this.running) return;
      this.running = true;

      try {
        const count = await this.dispatchPendingEvents();

        if (count > 0) {
          console.log(`[Outbox] Published ${count} event(s) to Redis.`);
        }
      } catch (error) {
        console.error('[Outbox] Poll failed:', error);
      } finally {
        this.running = false;
      }
    };

    void poll();
    this.timer = setInterval(() => void poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
