import { PrismaService } from './infrastructure/database/prisma.service.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { JobsRepository } from './modules/jobs/jobs.repository.js';
import { JobsService } from './modules/jobs/jobs.service.js';

export function createContainer(prisma: PrismaService) {
  const jobsRepository = new JobsRepository(prisma);
  const jobsService = new JobsService(jobsRepository);

  const authRepository = new AuthRepository(prisma);
  const authService = new AuthService(authRepository);

  return {
    jobsRepository,
    jobsService,
    authRepository,
    authService,
  };
}