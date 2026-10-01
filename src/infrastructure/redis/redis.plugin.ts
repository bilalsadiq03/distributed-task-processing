import fp from 'fastify-plugin';
import { createClient, RedisClientType } from 'redis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType;
  }
}

export default fp(async (app) => {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? 6379);

  const redis = createClient({
    socket: {
      host,
      port,
    },
  });

  redis.on('error', (error) => {
    app.log.error(error, 'Redis client error');
  });

  await redis.connect();

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});