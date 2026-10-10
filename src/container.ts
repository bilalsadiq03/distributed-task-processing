import { PrismaService } from './infrastructure/database/prisma.service.js';
import { RedisClientType } from 'redis';

import { JobQueue } from './infrastructure/queue/job.queue.js';

import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';

import { JobsRepository } from './modules/jobs/jobs.repository.js';
import { JobsService } from './modules/jobs/jobs.service.js';

export function createContainer(
  prisma: PrismaService,
  redis: RedisClientType,
) {
  const jobQueue = new JobQueue(redis);

  const jobsRepository = new JobsRepository(prisma);

  const jobsService = new JobsService(
    jobsRepository,
    jobQueue,
  );

  const authRepository = new AuthRepository(prisma);
  const authService = new AuthService(authRepository);

  return {
    jobsRepository,
    jobsService,
    authRepository,
    authService,
    jobQueue,
  };
}