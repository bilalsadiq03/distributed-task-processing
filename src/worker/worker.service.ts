import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { JobQueue } from '../infrastructure/queue/job.queue.js';
import { TaskExecutor } from './task.executor.js';

export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    private readonly executor: TaskExecutor,
  ) {}

  async start() {
    console.log('Worker started. Waiting for jobs...');

    while (true) {
      const jobId = await this.queue.dequeue();

      if (!jobId) {
        continue;
      }

      await this.processJob(jobId);
    }
  }

  private async processJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });

    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    try {
      await this.prisma.job.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'PROCESSING',
        },
      });

      const result = await this.executor.execute(
        job.type,
        job.payload as Record<string, unknown>,
      );

      await this.prisma.job.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'COMPLETED',
          result: JSON.stringify(result),
        },
      });

      console.log(`Job ${jobId} completed`);
    } catch (error) {
      await this.prisma.job.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'FAILED',
          result: {
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error',
          },
        },
      });

      console.error(`Job ${jobId} failed`, error);
    }
  }
}