import fp from 'fastify-plugin';
import { createContainer } from '../container.js';

export default fp(async (app) => {
  const container = createContainer(
    app.prisma,
    app.redis
  );

  app.decorate('container', container);
});

declare module 'fastify' {
  interface FastifyInstance {
    container: ReturnType<typeof createContainer>;
  }
}