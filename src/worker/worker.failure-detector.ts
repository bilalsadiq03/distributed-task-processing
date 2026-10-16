
import { PrismaService } from '../infrastructure/database/prisma.service.js';

export class WorkerFailureDetector {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly staleAfterMs = 30_000,
  ) {}

  async checkWorkers(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.staleAfterMs);

    const unhealthyResult = await this.prisma.worker.updateMany({
      where: {
        status: 'HEALTHY',
        lastHeartbeat: { lt: staleBefore },
      },
      data: { status: 'UNHEALTHY' },
    });

    if (unhealthyResult.count > 0) {
      console.log(
        `Marked ${unhealthyResult.count} worker(s) unhealthy`,
      );
    }

    const staleDrainingWorkers = await this.prisma.worker.findMany({
      where: {
        status: 'DRAINING',
        lastHeartbeat: { lt: staleBefore },
        jobs: {
          some: { status: 'PROCESSING' },
        },
      },
      select: { id: true },
    });

    for (const worker of staleDrainingWorkers) {
      const result = await this.prisma.worker.updateMany({
        where: {
          id: worker.id,
          status: 'DRAINING',
          lastHeartbeat: { lt: staleBefore },
        },
        data: { status: 'UNHEALTHY' },
      });

      if (result.count > 0) {
        console.log(
          `Marked draining worker ${worker.id} unhealthy because it still owns processing jobs.`,
        );
      }
    }
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.checkWorkers().catch((error) => {
        console.error('Worker failure detection failed:', error);
      });
    }, 10_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
