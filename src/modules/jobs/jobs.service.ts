import { JobsRepository } from './jobs.repository.js';
import { CreateJobInput } from './job.schema.js';
import { JobQueue } from '../../infrastructure/queue/job.queue.js';

export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly jobQueue: JobQueue,
  ) {}

  async createJob(
    userId: string,
    data: CreateJobInput,
  ) {
    const job = await this.jobsRepository.createJob(
      userId,
      data,
    );

    await this.jobQueue.enqueue(job.id);

    return job;
  }

  async getJobById(
    jobId: string,
    userId: string,
  ) {
    return this.jobsRepository.findById(
      jobId,
      userId,
    );
  }
}