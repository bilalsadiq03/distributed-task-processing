import 'dotenv/config';

import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { JobQueue } from '../infrastructure/queue/job.queue.js';
import { createClient } from 'redis';
import { TaskExecutor } from './task.executor.js';
import { WorkerService } from './worker.service.js';
import { WorkerRepository } from './worker.repository.js';
import { WorkerHeartbeat } from './worker.heartbeat.js';
import { randomUUID } from 'node:crypto';

const startWorker = async () => {
  const prisma = new PrismaService();
  await prisma.connect();

  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? 6379);

  const redis = createClient({
    socket: {
      host,
      port,
    },
  });

  redis.on('error', (error) => {
    console.error('Redis error:', error);
  });

  await redis.connect();

  const workerId = `worker-${randomUUID()}`;

  const workerRepository = new WorkerRepository(prisma);

  const heartbeat = new WorkerHeartbeat(
    workerRepository,
    workerId,
  );

  await heartbeat.start();

  const queue = new JobQueue(redis);
  const executor = new TaskExecutor();

  const worker = new WorkerService(
    prisma,
    queue,
    executor,
  );

  const shutdown = async () => {
    console.log('Shutting down worker...');

    await heartbeat.stop();
    await redis.quit();
    await prisma.disconnect();

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await worker.start();
};

startWorker().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});