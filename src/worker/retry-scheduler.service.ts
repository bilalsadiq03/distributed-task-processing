import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';

export class RetryScheduler {
  constructor(private readonly prisma: PrismaService) {}

  async scheduleDueRetries(limit = 50): Promise<number> {
    const now = new Date();

    const dueJobs = await this.prisma.job.findMany({
      where: {
        status: 'RETRYING',
        scheduledAt: { lte: now },
      },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });

    let scheduledCount = 0;

    for (const job of dueJobs) {
      const scheduled = await this.prisma.$transaction(async (tx) => {
        // Claim this due retry. Conditional update prevents two
        // scheduler instances from scheduling the same retry.
        const updated = await tx.job.updateMany({
          where: {
            id: job.id,
            status: 'RETRYING',
            scheduledAt: { lte: now },
          },
          data: {
            status: 'QUEUED',
            scheduledAt: null,
            workerId: null,
          },
        });

        if (updated.count !== 1) {
          return false;
        }

        // Persist the queue event in the same transaction.
        await tx.outboxEvent.create({
          data: {
            jobId: job.id,
            eventType: 'JOB_QUEUED',
            payload: {
              jobId: job.id,
            } as Prisma.InputJsonValue,
          },
        });

        return true;
      });

      if (scheduled) {
        scheduledCount++;
        console.log(`Retry scheduled for job ${job.id}.`);
      }
    }

    if (scheduledCount >= limit) {
      return scheduledCount;
    }

    const dueScheduledJobs = await this.prisma.job.findMany({
      where: {
        status: 'QUEUED',
        scheduledAt: { lte: now },
      },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: limit - scheduledCount,
    });

    for (const job of dueScheduledJobs) {
      const scheduled = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.job.updateMany({
          where: {
            id: job.id,
            status: 'QUEUED',
            scheduledAt: { lte: now },
          },
          data: {
            scheduledAt: null,
            workerId: null,
          },
        });

        if (updated.count !== 1) {
          return false;
        }

        await tx.outboxEvent.create({
          data: {
            jobId: job.id,
            eventType: 'JOB_QUEUED',
            payload: {
              jobId: job.id,
            } as Prisma.InputJsonValue,
          },
        });

        return true;
      });

      if (scheduled) {
        scheduledCount++;
        console.log(`Scheduled queued job ${job.id}.`);
      }
    }

    return scheduledCount;
  }
}
