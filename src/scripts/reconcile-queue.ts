
import 'dotenv/config';

import { createClient } from 'redis';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { getRedisConfig } from '../infrastructure/redis/redis.config.js';

const MAIN_QUEUE = 'task-processing';
const PROCESSING_PATTERN = `${MAIN_QUEUE}:processing:*`;

const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED',
]);

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const { host, port } = getRedisConfig();

  const redis = createClient({
    socket: { host, port },
  });

  redis.on('error', (error) => {
    console.error('[Reconciliation] Redis error:', error);
  });

  try {
    await prisma.connect();
    await redis.connect();

    // Collect processing lists and their job IDs.
    const lists: string[] = [];

    for await (const key of redis.scanIterator({
      MATCH: PROCESSING_PATTERN,
      COUNT: 100,
    })) {
      if (Array.isArray(key)) {
        lists.push(...key);
      } else {
        lists.push(key);
      }
    }

    const entries = new Map<string, string[]>();

    for (const list of lists) {
      entries.set(list, await redis.lRange(list, 0, -1));
    }

    const allIds = new Set(
      [...entries.values()].flat(),
    );

    // Also inspect the main queue to avoid introducing duplicates.
    const mainQueueIds = new Set(
      await redis.lRange(MAIN_QUEUE, 0, -1),
    );

    const jobs = await prisma.job.findMany({
      where: { id: { in: [...allIds] } },
      select: {
        id: true,
        status: true,
        workerId: true,
        scheduledAt: true,
      },
    });

    const jobsById = new Map(
      jobs.map((job) => [job.id, job]),
    );

    let removed = 0;
    let requeued = 0;
    let preserved = 0;

    for (const [list, ids] of entries) {
      for (const id of ids) {
        const job = jobsById.get(id);

        if (!job || TERMINAL_STATUSES.has(job.status)) {
          const count = await redis.lRem(list, 1, id);
          removed += count;

          if (!job) {
            console.log(`[Removed orphan] ${id}`);
          } else {
            console.log(`[Removed terminal job] ${id} (${job.status})`);
          }

          continue;
        }

        const isEligibleQueuedJob =
          job.status === 'QUEUED' &&
          job.workerId === null &&
          (!job.scheduledAt || job.scheduledAt <= new Date());

        if (isEligibleQueuedJob) {
          // Remove one stranded occurrence before re-enqueueing.
          // Atomic DB claiming protects against duplicate execution.
          const count = await redis.lRem(list, 1, id);

          if (count > 0) {
            if (!mainQueueIds.has(id)) {
              await redis.rPush(MAIN_QUEUE, id);
              mainQueueIds.add(id);
              requeued++;
              console.log(`[Requeued] ${id}`);
            } else {
              console.log(`[Removed duplicate processing entry] ${id}`);
            }
          }

          continue;
        }

        // Do not move PROCESSING jobs or jobs scheduled for later.
        preserved++;
        console.log(
          `[Preserved] ${id} | status=${job.status} | ` +
          `workerId=${job.workerId ?? 'null'}`,
        );
      }
    }

    console.log('\n[Reconciliation] Finished.');
    console.log(`Removed stale entries: ${removed}`);
    console.log(`Requeued jobs: ${requeued}`);
    console.log(`Preserved entries: ${preserved}`);
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }

    await prisma.disconnect();
  }
}

main().catch((error) => {
  console.error('[Reconciliation] Failed:', error);
  process.exitCode = 1;
});
