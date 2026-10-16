
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CreateJobInput } from './job.schema.js';

export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(userId: string, data: CreateJobInput) {
    return this.prisma.$transaction(async (tx) => {
      const isScheduledForFuture =
        data.scheduledAt !== undefined &&
        data.scheduledAt.getTime() > Date.now();

      const job = await tx.job.create({
        data: {
          userId,
          type: data.type,
          payload: data.payload as Prisma.InputJsonValue,
          priority: data.priority,
          scheduledAt: data.scheduledAt,
          status: 'QUEUED',
        },
      });

      if (!isScheduledForFuture) {
        await tx.outboxEvent.create({
          data: {
            jobId: job.id,
            eventType: 'JOB_QUEUED',
            payload: { jobId: job.id },
          },
        });
      }

      return job;
    });
  }

  async findById(jobId: string, userId: string) {
    return this.prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
      },
    });
  }

  async assignWorker(jobId: string, workerId: string) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { workerId },
    });
  }
}
