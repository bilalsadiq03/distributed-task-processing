import fp from 'fastify-plugin';
import { createClient, RedisClientType } from 'redis';
import { getRedisConfig } from './redis.config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType;
  }
}

export default fp(async (app) => {
  const { host, port } = getRedisConfig();

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
  app.log.info({ host, port }, 'Redis connected');

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
