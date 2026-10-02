import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(jobId: string) {
    return this.prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });
  }
}