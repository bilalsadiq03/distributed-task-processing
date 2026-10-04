import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async createUser(email: string, passwordHash: string) {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });
  }
}