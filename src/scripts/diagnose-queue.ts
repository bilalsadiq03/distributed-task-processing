
import 'dotenv/config';

import { createClient } from 'redis';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { getRedisConfig } from '../infrastructure/redis/redis.config.js';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const { host, port } = getRedisConfig();

  const redis = createClient({
    socket: { host, port },
  });

  redis.on('error', (error) => {
    console.error('[Diagnostic] Redis error:', error);
  });

  try {
    await prisma.connect();
    await redis.connect();

    const keys: string[] = [];

    for await (const key of redis.scanIterator({
      MATCH: 'task-processing:processing:*',
      COUNT: 100,
    })) {
      if (Array.isArray(key)) {
        keys.push(...key);
      } else {
        keys.push(key);
      }
    }

    const jobIds = new Set<string>();

    for (const key of keys) {
      const ids = await redis.lRange(key, 0, -1);

      for (const id of ids) {
        jobIds.add(id);
      }
    }

    console.log(`Found ${keys.length} processing lists.`);
    console.log(`Found ${jobIds.size} unique job IDs.`);

    if (jobIds.size === 0) {
      console.log('No stranded job IDs found.');
      return;
    }

    const jobs = await prisma.job.findMany({
      where: { id: { in: [...jobIds] } },
      select: {
        id: true,
        status: true,
        attempts: true,
        maxRetries: true,
        workerId: true,
        scheduledAt: true,
      },
    });

    const byId = new Map(jobs.map((job) => [job.id, job]));

    for (const id of jobIds) {
      const job = byId.get(id);

      if (!job) {
        console.log(`${id} | NOT FOUND IN DATABASE`);
        continue;
      }

      console.log(
        `${job.id} | status=${job.status} | ` +
        `attempts=${job.attempts}/${job.maxRetries} | ` +
        `workerId=${job.workerId ?? 'null'} | ` +
        `scheduledAt=${job.scheduledAt?.toISOString() ?? 'null'}`,
      );
    }
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }

    await prisma.disconnect();
  }
}

main().catch((error) => {
  console.error('[Diagnostic] Failed:', error);
  process.exitCode = 1;
});
