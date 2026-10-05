import Fastify from "fastify";
import prismaPlugin from "./infrastructure/database/prisma.plugin";
import redisPlugin from "./infrastructure/redis/redis.plugin";
import appPlugin from "./infrastructure/app.plugin";
import jwtPlugin from "./infrastructure/auth/jwt.plugin";
import { authRoutes } from "./modules/auth/auth.route";
import { jobsRoutes } from './modules/jobs/jobs.routes';

export function buildApp() {
    const app = Fastify({
        logger: true,
    });

    app.register(prismaPlugin)
    app.register(redisPlugin);
    app.register(appPlugin)
    app.register(jwtPlugin)
    app.register(authRoutes, {
        prefix: '/api/v1/auth',
    });
    app.register(jobsRoutes, {
        prefix: '/api/v1/jobs',
    });

    app.get('/', async () => {
        return {
            message: "Distrubuted task processing platform",
        };
    });

    app.get('/api/v1/health', async (request, reply) => {
        let postgresStatus = 'ok';
        let redisStatus = 'ok';

        try {
            await app.prisma.$queryRaw`SELECT 1`;
        } catch (error) {
            request.log.error(error, 'PostgreSQL health check failed');
            postgresStatus = 'error';
        }

        try {
            await app.redis.ping();
        } catch (error) {
            request.log.error(error, 'Redis health check failed');
            redisStatus = 'error';
        }

        const healthy =
            postgresStatus === 'ok' &&
            redisStatus === 'ok';

        return reply
            .code(healthy ? 200 : 503)
            .send({
                status: healthy ? 'ok' : 'error',
                services: {
                    api: 'ok',
                    postgres: postgresStatus,
                    redis: redisStatus,
                },
            });
    });

    return app;
}