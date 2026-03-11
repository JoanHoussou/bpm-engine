import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

export async function adminAuthMiddleware(
  app: FastifyInstance,
  _options: Record<string, unknown>
): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminSecret = request.headers['x-admin-secret'] as string;
    const expectedSecret = process.env.ADMIN_SECRET;

    if (!expectedSecret) {
      request.log.error('ADMIN_SECRET not configured on server');
      return reply.status(500).send({
        error: 'Server configuration error',
        message: 'Admin authentication not properly configured',
      });
    }

    if (!adminSecret) {
      return reply.status(401).send({
        error: 'Invalid admin secret',
        message: 'Missing X-Admin-Secret header',
      });
    }

    const receivedBuffer = Buffer.from(adminSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return reply.status(401).send({
        error: 'Invalid admin secret',
      });
    }

    const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

    if (!isValid) {
      return reply.status(401).send({
        error: 'Invalid admin secret',
      });
    }
  });
}
