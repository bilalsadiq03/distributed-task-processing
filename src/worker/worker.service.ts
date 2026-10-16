
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { JobQueue } from '../infrastructure/queue/job.queue.js';
import { TaskExecutor } from './task.executor.js';

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export class WorkerService {
  private stopping = false;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    private readonly executor: TaskExecutor,
    private readonly workerId: string,
  ) {}

  requestStop(): void {
    if (this.stopping) return;

    this.stopping = true;
    console.log(
      '[Worker] Shutdown requested. No new jobs will be accepted.',
    );
  }

  async start(): Promise<void> {
    // Prevent accidentally starting multiple polling loops.
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.runLoop();
    return this.startPromise;
  }

  private async runLoop(): Promise<void> {
    console.log(
      `[Worker] ${this.workerId} started. Waiting for jobs...`,
    );
    
    console.log('[Worker] Waiting for a job...');
    while (!this.stopping) {
      let jobId: string | null;

      try {
        jobId = await this.queue.dequeue();

        // Shutdown may have been requested while Redis was blocking.
        // Return any newly dequeued job to the shared queue.
        if (this.stopping) {
          if (jobId) {
            await this.queue.acknowledge(jobId);
            await this.queue.enqueue(jobId);
          }

          break;
        }

        if (!jobId) {
          continue;
        }

        console.log(`[Worker] Received job ${jobId}`);
        console.log(`[Worker] Starting processing for ${jobId}`);

        await this.processJob(jobId);

        // Remove the job from this worker's Redis processing list
        // after its processing attempt has been handled.
        await this.queue.acknowledge(jobId);

        console.log(`[Worker] Finished processing for ${jobId}`);
      } catch (error) {
        console.error('[Worker] Queue or processing error:', error);
      }
    }

    console.log(`[Worker] ${this.workerId} worker loop stopped.`);
  }

  private async processJob(jobId: string): Promise<void> {
    console.log(`[Worker] Attempting database claim for ${jobId}`);

    let claimed: {
      job: Prisma.JobGetPayload<Record<string, never>>;
      attemptId: string;
      attemptNumber: number;
    } | null;

    try {
      console.log(`[Worker] Claim transaction starting: ${jobId}`);

      claimed = await this.prisma.$transaction(
        async (tx) => {
          console.log(`[Worker] Transaction callback entered: ${jobId}`);
          console.log(`[Worker] Running conditional job update: ${jobId}`);

          const claim = await tx.job.updateMany({
            where: {
              id: jobId,
              status: 'QUEUED',
              OR: [
                { scheduledAt: null },
                { scheduledAt: { lte: new Date() } },
              ],
            },
            data: {
              status: 'PROCESSING',
              workerId: this.workerId,
              attempts: { increment: 1 },
            },
          });

          console.log(
            `[Worker] Conditional update finished for ${jobId}; ` +
              `matched rows: ${claim.count}`,
          );

          if (claim.count !== 1) {
            return null;
          }

          console.log(`[Worker] Fetching claimed job: ${jobId}`);

          const job = await tx.job.findUnique({
            where: { id: jobId },
          });

          console.log(`[Worker] Job fetch finished: ${jobId}`);

          if (!job) {
            throw new Error(
              `Job ${jobId} disappeared after being claimed`,
            );
          }

          console.log(`[Worker] Creating attempt record: ${jobId}`);

          const attempt = await tx.jobAttempt.create({
            data: {
              jobId: job.id,
              workerId: this.workerId,
              attemptNumber: job.attempts,
              status: 'PROCESSING',
              startedAt: new Date(),
            },
          });

          console.log(`[Worker] Attempt record created: ${attempt.id}`);

          return {
            job,
            attemptId: attempt.id,
            attemptNumber: job.attempts,
          };
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
        },
      );

      console.log(`[Worker] Claim transaction finished: ${jobId}`);
    } catch (error) {
      console.error(
        `[Worker] Database claim failed for ${jobId}:`,
        error,
      );
      throw error;
    }

    if (!claimed) {
      console.warn(
        `[Worker] Job ${jobId} could not be claimed. ` +
          'It may no longer be QUEUED or may not be due yet.',
      );
      return;
    }

    const { job, attemptId, attemptNumber } = claimed;

    console.log(
      `[Worker] Claimed job ${jobId}; attempt ${attemptNumber}.`,
    );

    let result: unknown;

    try {
      console.log(`[Worker] Executing job ${jobId}`);

      result = await this.executor.execute(
        job.type,
        job.payload as Record<string, unknown>,
      );

      console.log(`[Worker] Task execution succeeded for ${jobId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      console.error(
        `[Worker] Task execution failed for ${jobId}: ${message}`,
      );

      await this.handleFailure(
        job.id,
        attemptId,
        attemptNumber,
        job.maxRetries,
        message,
      );

      return;
    }

    console.log(`[Worker] Recording completion for ${jobId}`);

    const completed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.job.updateMany({
        where: {
          id: job.id,
          status: 'PROCESSING',
          workerId: this.workerId,
          attempts: attemptNumber,
        },
        data: {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonValue,
          workerId: null,
        },
      });

      if (update.count !== 1) {
        return false;
      }

      await tx.jobAttempt.updateMany({
        where: {
          id: attemptId,
          status: 'PROCESSING',
        },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return true;
    });

    if (completed) {
      console.log(`[Worker] Job ${jobId} completed successfully.`);
    } else {
      console.warn(
        `[Worker] Ignoring stale completion for ${jobId}, ` +
          `attempt ${attemptNumber}.`,
      );
    }
  }

  private async handleFailure(
    jobId: string,
    attemptId: string,
    attemptNumber: number,
    maxRetries: number,
    message: string,
  ): Promise<void> {
    const shouldRetry = attemptNumber <= maxRetries;

    const delayMs = Math.min(
      INITIAL_RETRY_DELAY_MS * 2 ** (attemptNumber - 1),
      MAX_RETRY_DELAY_MS,
    );

    const nextStatus = shouldRetry ? 'RETRYING' : 'DEAD_LETTER';

    console.log(
      `[Worker] Recording failure for ${jobId}; ` +
        `next status: ${nextStatus}.`,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const update = await tx.job.updateMany({
        where: {
          id: jobId,
          status: 'PROCESSING',
          workerId: this.workerId,
          attempts: attemptNumber,
        },
        data: {
          status: nextStatus,
          workerId: null,
          scheduledAt: shouldRetry
            ? new Date(Date.now() + delayMs)
            : null,
          result: {
            error: message,
          } as Prisma.InputJsonValue,
        },
      });

      if (update.count !== 1) {
        return false;
      }

      await tx.jobAttempt.updateMany({
        where: {
          id: attemptId,
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
        },
      });

      return true;
    });

    if (!updated) {
      console.warn(
        `[Worker] Ignoring stale failure for ${jobId}, ` +
          `attempt ${attemptNumber}.`,
      );
      return;
    }

    if (shouldRetry) {
      console.error(
        `[Worker] Job ${jobId} failed on attempt ${attemptNumber}. ` +
          `Retry scheduled in ${delayMs}ms: ${message}`,
      );
    } else {
      console.error(
        `[Worker] Job ${jobId} exhausted its retries and ` +
          `entered DEAD_LETTER: ${message}`,
      );
    }
  }
}
