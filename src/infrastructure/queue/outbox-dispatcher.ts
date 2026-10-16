
import 'dotenv/config';

import { createClient } from 'redis';
import { PrismaService } from '../database/prisma.service.js';
import { JobQueue } from './job.queue.js';
import { OutboxDispatcher } from './outbox-dispatcher.service.js';
import { getRedisConfig } from '../redis/redis.config.js';

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
    console.error('[Outbox] Redis error:', error);
  });

  try {
    await redis.connect();
    console.log(`[Outbox] Connected to Redis at ${host}:${port}.`);

    const dispatcher = new OutboxDispatcher(
      prisma,
      new JobQueue(redis),
    );

    dispatcher.start();
    console.log('[Outbox] Dispatcher started.');

    let stopping = false;

    const shutdown = async (signal: string) => {
      if (stopping) return;
      stopping = true;

      console.log(`[Outbox] Received ${signal}; shutting down.`);
      dispatcher.stop();

      try {
        if (redis.isOpen) await redis.quit();
      } finally {
        await prisma.disconnect();
      }
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT').catch(console.error);
    });

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM').catch(console.error);
    });
  } catch (error) {
    if (redis.isOpen) await redis.quit().catch(() => undefined);
    await prisma.disconnect().catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error('[Outbox] Failed to start:', error);
  process.exitCode = 1;
});
