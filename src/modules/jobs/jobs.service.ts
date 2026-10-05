import { JobsRepository } from './jobs.repository.js';
import { CreateJobInput } from './job.schema.js';

export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
  ) {}

  async createJob(userId: string, data: CreateJobInput) {
    return this.jobsRepository.createJob(userId, data);
  }

  async getJobById(jobId: string, userId: string) {
    return this.jobsRepository.findById(jobId, userId);
  }
}