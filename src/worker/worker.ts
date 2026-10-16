
import 'dotenv/config';

import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { JobQueue } from '../infrastructure/queue/job.queue.js';
import { createClient } from 'redis';
import { TaskExecutor } from './task.executor.js';
import { WorkerService } from './worker.service.js';
import { WorkerRepository } from './worker.repository.js';
import { WorkerHeartbeat } from './worker.heartbeat.js';
import { randomUUID } from 'node:crypto';
import { getRedisConfig } from '../infrastructure/redis/redis.config.js';

const startWorker = async () => {
  const prisma = new PrismaService();
  await prisma.connect();

  const { host, port } = getRedisConfig();

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
  console.log(`[Worker] Connected to Redis at ${host}:${port}.`);

  const workerId = `worker-${randomUUID()}`;
  const workerRepository = new WorkerRepository(prisma);

  const heartbeat = new WorkerHeartbeat(
    workerRepository,
    workerId,
  );

  await heartbeat.start();

  const queue = new JobQueue(redis, workerId);
  const requeued = await queue.requeueInFlight();

  if (requeued > 0) {
    console.warn(
      `[Worker] Requeued ${requeued} in-flight Redis job(s) on startup.`,
    );
  }

  const executor = new TaskExecutor();

  const worker = new WorkerService(
    prisma,
    queue,
    executor,
    workerId,
  );

  // Start exactly one worker loop and retain its promise.
  const workerLoop = worker.start();

  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      console.log('[Worker] Shutting down gracefully...');

      // Stop accepting new jobs and wait for the active job/loop.
      worker.requestStop();
      await workerLoop;

      // Close resources only after the loop has exited.
      await heartbeat.stop();

      if (redis.isOpen) {
        await redis.quit();
      }

      await prisma.disconnect();

      console.log('[Worker] Shutdown complete.');
    })();

    return shutdownPromise;
  };

  process.once('SIGINT', () => {
    void shutdown().catch((error) => {
      console.error('[Worker] Shutdown failed:', error);
      process.exitCode = 1;
    });
  });

  process.once('SIGTERM', () => {
    void shutdown().catch((error) => {
      console.error('[Worker] Shutdown failed:', error);
      process.exitCode = 1;
    });
  });

  await workerLoop;
};

startWorker().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exitCode = 1;
});
