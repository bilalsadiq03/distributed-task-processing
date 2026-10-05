import { FastifyInstance } from 'fastify';
import { authenticate } from '../../infrastructure/auth/authenticate.js';
import { createJobSchema } from './job.schema.js';

export async function jobsRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      onRequest: [authenticate],
    },
    async (request, reply) => {
      const result = createJobSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          message: 'Invalid request body',
          errors: result.error.flatten().fieldErrors,
        });
      }

      const userId = request.user.sub;

      const job = await app.container.jobsService.createJob(
        userId,
        result.data,
      );

      return reply.code(201).send({
        job,
      });
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const userId = request.user.sub;

      const job = await app.container.jobsService.getJobById(
        id,
        userId,
      );

      if (!job) {
        return reply.code(404).send({
          message: 'Job not found',
        });
      }

      return reply.send({
        job,
      });
    },
  );
}