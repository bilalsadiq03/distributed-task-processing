import { PrismaService } from './infrastructure/database/prisma.service.js';
import { JobsRepository } from './modules/jobs/jobs.repository.js';
import { JobsService } from './modules/jobs/jobs.service.js';

export function createContainer(prisma: PrismaService) {
  const jobsRepository = new JobsRepository(prisma);
  const jobsService = new JobsService(jobsRepository);

  return {
    jobsRepository,
    jobsService,
  };
}