import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { initDb, closeDb } from './db/database';
import { getSetting } from './db/queries';
import { config } from './config';
import { isLlamaRoute, proxyToLlama } from './routes/proxy';
import { modelsPlugin } from './routes/models';
import { analyticsPlugin } from './routes/analytics';
import { settingsPlugin } from './routes/settings';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
  // Disable built-in body parsing for proxy routes (we handle raw buffer)
  bodyLimit: 50 * 1024 * 1024, // 50 MB
});

async function bootstrap(): Promise<void> {
  // ── 1. Database ─────────────────────────────────────────────────────────
  initDb();
  fastify.log.info('SQLite database ready');

  // ── 2. Security + CORS ──────────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Managed by Vue app
    crossOriginEmbedderPolicy: false,
  });
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  });

  // ── 3. API Routes (registered BEFORE proxy to take priority) ────────────
  await fastify.register(modelsPlugin);
  await fastify.register(analyticsPlugin);
  await fastify.register(settingsPlugin);

  // ── 4. Static UI (Vue dist) ─────────────────────────────────────────────
  const uiPath = config.uiDist;
  const uiAvailable = fs.existsSync(path.join(uiPath, 'index.html'));
  if (uiAvailable) {
    // Serve static assets — do NOT use index fallback here;
    // SPA routes and llama.cpp passthrough are handled by setNotFoundHandler below.
    await fastify.register(staticPlugin, {
      root: uiPath,
      prefix: '/',
      index: false,      // disable auto index — we handle root manually
      decorateReply: true,
    });
  } else {
    fastify.log.warn(`UI dist not found at ${uiPath}. Run 'npm run build' inside /ui first.`);
  }

  // ── 5. Catch-all: proxy to llama.cpp OR serve SPA index.html ─────────────
  //
  // Using setNotFoundHandler avoids any wildcard route conflict with
  // @fastify/static. Static serves files that exist in dist/; everything
  // else falls here.
  //
  // Decision logic:
  //   • /api/*           → should never reach here (registered above)
  //   • /v1/*, /completion, /health, /metrics, etc. → proxy to llama.cpp
  //   • anything else    → serve index.html (Vue SPA)
  fastify.setNotFoundHandler(async (request, reply) => {
    const url = request.url.split('?')[0];

    if (isLlamaRoute(url)) {
      return proxyToLlama(request, reply);
    }

    // SPA fallback — serve index.html for all unknown UI routes
    if (uiAvailable) {
      return reply.sendFile('index.html');
    }

    reply.status(404).send({ error: 'Not Found', message: `No route for ${request.method} ${url}` });
  });

  // ── 6. Start listening ───────────────────────────────────────────────────
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Llama Gateway running on http://localhost:${config.port}`);

  // ── 7. First-run: open browser to setup wizard ───────────────────────────
  const setupComplete = getSetting('setup_complete') === 'true';
  if (!setupComplete && config.openBrowserOnStart) {
    fastify.log.info('First run detected — opening setup wizard in browser...');
    openBrowser(`http://localhost:${config.port}/setup`);
  }
}

function openBrowser(url: string): void {
  try {
    // Dynamic import so this only runs at runtime, not during TS compilation
    import('open').then(({ default: open }) => open(url)).catch(() => {
      fastify.log.info(`Open your browser at: ${url}`);
    });
  } catch {
    fastify.log.info(`Open your browser at: ${url}`);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  fastify.log.info(`Received ${signal} — shutting down gracefully`);
  await fastify.close();
  closeDb();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

// ── Entry point ──────────────────────────────────────────────────────────────
bootstrap().catch((err) => {
  console.error('Failed to start Llama Gateway:', err);
  process.exit(1);
});
