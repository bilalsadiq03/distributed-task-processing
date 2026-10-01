import fp from 'fastify-plugin';
import { PrismaService } from './prisma.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaService;
  }
}

export default fp(async (app) => {
  const prisma = new PrismaService();

  await prisma.connect();

  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.disconnect();
  });
});