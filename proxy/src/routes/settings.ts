import { FastifyInstance } from 'fastify';
import { bulkSetSettings, deleteAllRequests, deleteOldRequests, getAllSettings, getSetting, vacuumDb } from '../db/queries';
import { EDITABLE_SETTING_KEYS, SETTING_DEFAULTS, getLlamaSettingSchema } from '../lib/llama-settings';
import { getLlamaLaunchPlan, launchLlamaProcess, launchRawCommand, stopLlamaProcess } from '../services/llama-process';
import { getGatewayStatus } from '../services/llama-status';

export async function settingsPlugin(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings
  fastify.get('/api/settings', async () => {
    return { settings: getAllSettings() };
  });

  // GET /api/settings/schema
  fastify.get('/api/settings/schema', async () => {
    return getLlamaSettingSchema();
  });

  // PUT /api/settings — bulk update
  fastify.put<{ Body: Record<string, string> }>('/api/settings', async (request) => {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.body)) {
      if (EDITABLE_SETTING_KEYS.has(key)) {
        filtered[key] = String(value);
      }
    }
    bulkSetSettings(filtered);
    return { settings: getAllSettings() };
  });

  // POST /api/settings/cleanup — delete old logs
  fastify.post<{ Body: { days?: number; deleteAll?: boolean } }>('/api/settings/cleanup', async (request) => {
    const { days, deleteAll } = request.body ?? {};
    let deleted: number;

    if (deleteAll) {
      deleted = deleteAllRequests();
    } else {
      const retentionDays = days ?? parseInt(getSetting('log_retention_days') || '30', 10);
      deleted = deleteOldRequests(retentionDays);
    }

    return { deleted };
  });

  // POST /api/settings/vacuum — SQLite VACUUM
  fastify.post('/api/settings/vacuum', async () => {
    vacuumDb();
    return { success: true };
  });

  // POST /api/settings/reset — factory reset (deletes all data)
  fastify.post('/api/settings/reset', async () => {
    deleteAllRequests();
    bulkSetSettings(SETTING_DEFAULTS);
    return { success: true };
  });

  // POST /api/llama/launch — spawn the llama.cpp server process
  // Body fields are optional overrides; all defaults come from stored settings.
  fastify.get<{ Querystring: { modelPath?: string } }>('/api/llama/preview', async (request, reply) => {
    try {
      const plan = getLlamaLaunchPlan({ modelPath: request.query.modelPath });
      return { command: plan.command };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.post<{ Body?: { bin?: string; port?: string; host?: string; modelPath?: string; rawCommand?: string } | null }>(
    '/api/llama/launch',
    async (request, reply) => {
      try {
        if (request.body?.rawCommand) {
          return launchRawCommand(request.body.rawCommand);
        }
        return launchLlamaProcess(request.body ?? {});
      } catch (err) {
        return reply.status(500).send({ error: `Failed to launch: ${(err as Error).message}` });
      }
    },
  );

  // POST /api/llama/stop — kill the tracked llama.cpp process
  fastify.post('/api/llama/stop', async (request, reply) => {
    try {
      return stopLlamaProcess();
    } catch (err) {
      return reply.status(500).send({ error: `Failed to stop: ${(err as Error).message}` });
    }
  });

  // GET /api/status — proxy + llama.cpp health
  fastify.get('/api/status', async () => {
    return getGatewayStatus();
  });
}
