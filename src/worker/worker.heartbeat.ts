import { WorkerRepository } from './worker.repository.js';

export class WorkerHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly repository: WorkerRepository,
    private readonly workerId: string,
    private readonly intervalMs = 10_000,
  ) {}

  async start() {
    await this.repository.register(this.workerId);

    this.timer = setInterval(() => {
      void this.repository.heartbeat(this.workerId).catch((error) => {
        console.error('Worker heartbeat failed:', error);
      });
    }, this.intervalMs);

    console.log(`Heartbeat started for ${this.workerId}`);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.repository.setStatus(this.workerId, 'DRAINING');
  }
}