import { FastifyInstance, FastifyReply } from 'fastify';
import {
  ModelsServiceError,
  activateModelById,
  listModels,
  removeModelById,
  saveModel,
  scanAndImportModels,
  scanModelDirectory,
} from '../services/models';

export async function modelsPlugin(fastify: FastifyInstance): Promise<void> {
  // GET /api/models — list all saved models
  fastify.get('/api/models', async () => {
    return { models: listModels() };
  });

  // POST /api/models — add / update a model
  fastify.post<{ Body: { name: string; path: string; is_default?: number } }>(
    '/api/models',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'path'],
          properties: {
            name: { type: 'string', minLength: 1 },
            path: { type: 'string', minLength: 1 },
            is_default: { type: 'integer' },
          },
        },
      },
    },
    async (request) => {
      const { name, path: modelPath, is_default } = request.body;
      const model = saveModel({ name, path: modelPath, is_default });
      return { model };
    },
  );

  // DELETE /api/models/:id — remove a model
  fastify.delete<{ Params: { id: string } }>('/api/models/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);

    if (Number.isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid model id' });
    }

    try {
      removeModelById(id);
      return { success: true };
    } catch (error) {
      return sendModelError(reply, error);
    }
  });

  // POST /api/models/:id/activate — set as active / default model
  fastify.post<{ Params: { id: string } }>('/api/models/:id/activate', async (request, reply) => {
    const id = parseInt(request.params.id, 10);

    if (Number.isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid model id' });
    }

    try {
      activateModelById(id);
      return { success: true };
    } catch (error) {
      return sendModelError(reply, error);
    }
  });

  // GET /api/models/scan?dir=/path/to/models — scan directory for .gguf files
  fastify.get<{ Querystring: { dir?: string } }>('/api/models/scan', async (request, reply) => {
    try {
      return scanModelDirectory(request.query.dir);
    } catch (error) {
      return sendModelError(reply, error);
    }
  });

  // POST /api/models/scan-import — scan dir and auto-import all .gguf models
  fastify.post<{ Body: { dir: string } }>(
    '/api/models/scan-import',
    {
      schema: {
        body: {
          type: 'object',
          required: ['dir'],
          properties: { dir: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        return scanAndImportModels(request.body.dir);
      } catch (error) {
        return sendModelError(reply, error);
      }
    },
  );
}

function sendModelError(reply: FastifyReply, error: unknown) {
  if (error instanceof ModelsServiceError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}
