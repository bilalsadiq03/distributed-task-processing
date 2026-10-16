import 'dotenv/config';
import { createClient } from 'redis';

import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { WorkerFailureDetector } from './worker.failure-detector.js';
import { JobRecoveryService } from './job-recovery.service.js';
import { RetryScheduler } from './retry-scheduler.service.js';
import { getRedisConfig } from '../infrastructure/redis/redis.config.js';

async function main(): Promise<void> {
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
    console.error('Monitor Redis error:', error);
  });

  try {
    await redis.connect();
    console.log(`Monitor connected to Redis at ${host}:${port}.`);

    const failureDetector = new WorkerFailureDetector(prisma);
    const recoveryService = new JobRecoveryService(prisma);
    const retryScheduler = new RetryScheduler(prisma);

    let stopping = false;
    let recoveryRunning = false;
    let retrySchedulingRunning = false;

    // Detect workers that have stopped sending heartbeats.
    failureDetector.start();

    // Recover jobs assigned to unhealthy workers.
    const recoveryTimer = setInterval(async () => {
      if (stopping || recoveryRunning) return;

      recoveryRunning = true;

      try {
        const recovered =
          await recoveryService.recoverJobsFromUnhealthyWorkers();

        if (recovered > 0) {
          console.log(`Recovered ${recovered} job(s) from unhealthy workers.`);
        }
      } catch (error) {
        console.error('Job recovery failed:', error);
      } finally {
        recoveryRunning = false;
      }
    }, 10_000);

    // Requeue retries whose backoff delay has expired.
    const retryTimer = setInterval(async () => {
      if (stopping || retrySchedulingRunning) return;

      retrySchedulingRunning = true;

      try {
        const count = await retryScheduler.scheduleDueRetries();

        if (count > 0) {
          console.log(`Scheduled ${count} due retry job(s).`);
        }
      } catch (error) {
        console.error('Retry scheduler failed:', error);
      } finally {
        retrySchedulingRunning = false;
      }
    }, 1_000);

    console.log('Monitor started.');
    console.log('Worker failure detection is active.');
    console.log('Job recovery runs every 10 seconds.');
    console.log('Retry scheduling runs every 1 second.');

    let shutdownPromise: Promise<void> | undefined;

    const shutdown = (signal: string): Promise<void> => {
      if (shutdownPromise) return shutdownPromise;

      shutdownPromise = (async () => {
        stopping = true;

        console.log(`Received ${signal}. Shutting down monitor...`);

        clearInterval(recoveryTimer);
        clearInterval(retryTimer);
        failureDetector.stop();

        // Wait for any in-flight monitor tasks to finish.
        while (recoveryRunning || retrySchedulingRunning) {
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }

        try {
          if (redis.isOpen) {
            await redis.quit();
          }
        } finally {
          await prisma.disconnect();
        }

        console.log('Monitor stopped.');
      })();

      return shutdownPromise;
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT').catch((error) => {
        console.error('Monitor shutdown failed:', error);
        process.exitCode = 1;
      });
    });

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM').catch((error) => {
        console.error('Monitor shutdown failed:', error);
        process.exitCode = 1;
      });
    });
  } catch (error) {
    console.error('Failed to start monitor:', error);

    if (redis.isOpen) {
      await redis.quit();
    }

    await prisma.disconnect();
    throw error;
  }
}

main().catch((error) => {
  console.error('Monitor terminated:', error);
  process.exitCode = 1;
});
