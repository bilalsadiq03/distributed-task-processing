import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CreateJobInput } from './job.schema.js';

export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(userId: string, data: CreateJobInput) {
    return this.prisma.job.create({
      data: {
        userId,
        type: data.type,
        payload: data.payload as Prisma.InputJsonValue,
        priority: data.priority,
        scheduledAt: data.scheduledAt,
        status: 'QUEUED',
      },
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
}