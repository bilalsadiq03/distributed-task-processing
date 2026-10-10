import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { JobQueue } from '../infrastructure/queue/job.queue.js';

export class JobRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
  ) {}

  async recoverJobsFromUnhealthyWorkers() {
    const unhealthyWorkers = await this.prisma.worker.findMany({
      where: {
        status: 'UNHEALTHY',
      },
      select: {
        id: true,
      },
    });

    let recoveredCount = 0;

    for (const worker of unhealthyWorkers) {
      const jobs = await this.prisma.job.findMany({
        where: {
          workerId: worker.id,
          status: 'PROCESSING',
        },
        select: {
          id: true,
        },
      });

      for (const job of jobs) {
        // Only re-queue if the job is still PROCESSING
        // and still assigned to this unhealthy worker.
        const result = await this.prisma.job.updateMany({
          where: {
            id: job.id,
            workerId: worker.id,
            status: 'PROCESSING',
          },
          data: {
            status: 'QUEUED',
            workerId: null,
          },
        });

        if (result.count === 1) {
          await this.queue.enqueue(job.id);
          recoveredCount++;
        }
      }
    }

    return recoveredCount;
  }
}