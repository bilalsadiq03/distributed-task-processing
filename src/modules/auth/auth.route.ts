import { FastifyInstance } from 'fastify';
import { authSchema } from './auth.schema';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const result = authSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    try {
      const user = await app.container.authService.register(
        email,
        password,
      );

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
      });

      return reply.code(201).send({
        user,
        token,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'User already exists'
      ) {
        return reply.code(409).send({
          message: 'User already exists',
        });
      }

      throw error;
    }
  });

  app.post('/login', async (request, reply) => {
    const result = authSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
        errors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const user =
      await app.container.authService.validateCredentials(
        email,
        password,
      );

    if (!user) {
      return reply.code(401).send({
        message: 'Invalid email or password',
      });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
    });

    return reply.send({
      user,
      token,
    });
  });
}