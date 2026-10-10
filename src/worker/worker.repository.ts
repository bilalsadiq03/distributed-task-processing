import { PrismaService } from '../infrastructure/database/prisma.service.js';

export class WorkerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async register(workerId: string) {
    return this.prisma.worker.upsert({
      where: { id: workerId },
      create: {
        id: workerId,
        status: 'HEALTHY',
        lastHeartbeat: new Date(),
      },
      update: {
        status: 'HEALTHY',
        lastHeartbeat: new Date(),
      },
    });
  }

  async heartbeat(workerId: string) {
    return this.prisma.worker.update({
      where: { id: workerId },
      data: {
        lastHeartbeat: new Date(),
        status: 'HEALTHY',
      },
    });
  }

  async setStatus(
    workerId: string,
    status: 'HEALTHY' | 'UNHEALTHY' | 'DRAINING',
  ) {
    return this.prisma.worker.update({
      where: { id: workerId },
      data: { status },
    });
  }
}