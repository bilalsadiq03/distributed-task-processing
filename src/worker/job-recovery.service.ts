import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';

export class JobRecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async recoverJobsFromUnhealthyWorkers(): Promise<number> {
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
          attempts: true,
        },
      });

      for (const job of jobs) {
        const recovered = await this.prisma.$transaction(async (tx) => {
          // Only recover the job if it is still assigned to this
          // unhealthy worker and remains in PROCESSING.
          const result = await tx.job.updateMany({
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

          // Another recovery pass may have handled this job already.
          if (result.count !== 1) {
            return false;
          }

          // Persist the queue event atomically with the job update.
          await tx.outboxEvent.create({
            data: {
              jobId: job.id,
              eventType: 'JOB_QUEUED',
              payload: {
                jobId: job.id,
              } as Prisma.InputJsonValue,
            },
          });

          await tx.jobAttempt.updateMany({
            where: {
              jobId: job.id,
              workerId: worker.id,
              attemptNumber: job.attempts,
              status: 'PROCESSING',
            },
            data: {
              status: 'FAILED',
              error: `Recovered from unhealthy worker ${worker.id}`,
              completedAt: new Date(),
            },
          });

          return true;
        });

        if (recovered) {
          recoveredCount++;
          console.log(`Recovered job ${job.id} from worker ${worker.id}.`);
        }
      }
    }

    return recoveredCount;
  }
}
