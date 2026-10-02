import { JobsRepository } from './jobs.repository.js';

export class JobsService {
  constructor(private readonly jobsRepository: JobsRepository) {}

  async getJobById(jobId: string) {
    return this.jobsRepository.findById(jobId);
  }
}