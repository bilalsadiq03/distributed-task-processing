
import { RedisClientType } from 'redis';

export class JobQueue {
  private readonly queueName = 'task-processing';
  private readonly processingQueueName: string;

  constructor(
    private readonly redis: RedisClientType,
    consumerId?: string,
  ) {
    this.processingQueueName = consumerId
      ? `${this.queueName}:processing:${consumerId}`
      : `${this.queueName}:processing`;
  }

  async enqueue(jobId: string): Promise<void> {
    await this.redis.rPush(this.queueName, jobId);
  }

  async dequeue(): Promise<string | null> {
    return this.redis.brPopLPush(
      this.queueName,
      this.processingQueueName,
      1,
    );
  }

  async acknowledge(jobId: string): Promise<void> {
    await this.redis.lRem(this.processingQueueName, 1, jobId);
  }

  async requeueInFlight(): Promise<number> {
    let moved = 0;

    while (true) {
      const jobId = await this.redis.rPopLPush(
        this.processingQueueName,
        this.queueName,
      );

      if (!jobId) {
        return moved;
      }

      moved++;
    }
  }
}
