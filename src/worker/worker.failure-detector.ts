import { PrismaService } from '../infrastructure/database/prisma.service.js';

export class WorkerFailureDetector {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleAfterMs = 30_000,
  ) {}

  async checkWorkers() {
    const staleBefore = new Date(Date.now() - this.staleAfterMs);

    const result = await this.prisma.worker.updateMany({
      where: {
        status: 'HEALTHY',
        lastHeartbeat: {
          lt: staleBefore,
        },
      },
      data: {
        status: 'UNHEALTHY',
      },
    });

    if (result.count > 0) {
      console.log(`Marked ${result.count} worker(s) unhealthy`);
    }
  }

  start() {
    this.timer = setInterval(() => {
      void this.checkWorkers().catch((error) => {
        console.error('Worker failure detection failed:', error);
      });
    }, 10_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}