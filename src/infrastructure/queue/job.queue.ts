import { RedisClientType } from 'redis';

export class JobQueue {
  private readonly queueName = 'task-processing';

  constructor(private readonly redis: RedisClientType) {}

  async enqueue(jobId: string) {
    await this.redis.rPush(this.queueName, jobId);
  }

  async dequeue(): Promise<string | null> {
    const result = await this.redis.blPop(
      this.queueName,
      0,
    );

    if (!result) {
      return null;
    }

    return result.element;
  }
}