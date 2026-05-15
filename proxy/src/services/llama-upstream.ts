import http from 'http';
import { FastifyReply, FastifyRequest } from 'fastify';
import { logRequestAsync, parseCompletionUsage, parseStreamingUsage } from './logger';
import { getLlamaConnectionConfig } from './runtime-config';

const LLAMA_ROUTE_PREFIXES = [
  '/completion',
  '/tokenize',
  '/detokenize',
  '/embedding',
  '/health',
  '/props',
  '/slots',
  '/metrics',
  '/infill',
  '/lora-adapters',
  '/rerank',
];

const upstreamAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 16,
  scheduling: 'lifo',
  timeout: 60_000,
});

export function isLlamaRoute(url: string): boolean {
  const pathname = url.split('?')[0];
  return pathname === '/v1' || pathname.startsWith('/v1/') || LLAMA_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxyToLlama(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  return new Promise<void>((resolve) => {
    const startTime = Date.now();
    const connection = getLlamaConnectionConfig();

    let bodyBuffer = Buffer.alloc(0);
    const rawBody = request.body as Buffer<ArrayBuffer> | Record<string, unknown> | undefined;
    if (rawBody && Buffer.isBuffer(rawBody)) {
      bodyBuffer = Buffer.from(rawBody);
    } else if (rawBody) {
      bodyBuffer = Buffer.from(JSON.stringify(rawBody));
    }

    let requestMeta: { model?: string; prompt?: string; isStream?: boolean } = {};
    try {
      const parsed = JSON.parse(bodyBuffer.toString());
      requestMeta = {
        model: parsed.model,
        isStream: parsed.stream === true,
        prompt: extractPromptText(parsed),
      };
    } catch {
      /* non-JSON body — passthrough only */
    }

    const upstreamOptions: http.RequestOptions = {
      agent: upstreamAgent,
      hostname: connection.host,
      port: connection.port,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `${connection.host}:${connection.port}`,
        'content-length': bodyBuffer.length.toString(),
      },
    };

    reply.hijack();

    const upstreamReq = http.request(upstreamOptions, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode ?? 200;
      reply.raw.writeHead(statusCode, sanitizeHeaders(upstreamRes.headers));

      if (requestMeta.isStream) {
        let lastDataLine = '';

        upstreamRes.on('data', (chunk: Buffer) => {
          reply.raw.write(chunk);
          observeSseChunk(chunk.toString(), (line) => {
            lastDataLine = line;
          });
        });

        upstreamRes.on('end', () => {
          reply.raw.end();

          const durationMs = Date.now() - startTime;
          const usage = parseStreamingUsage(lastDataLine);

          logRequestAsync({
            model: requestMeta.model || 'unknown',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            durationMs,
            prompt: requestMeta.prompt || '',
            responsePreview: usage.responsePreview,
            endpoint: request.url.split('?')[0],
            statusCode,
          });

          resolve();
        });

        upstreamRes.on('error', () => {
          reply.raw.end();
          resolve();
        });
      } else {
        const chunks: Buffer[] = [];

        upstreamRes.on('data', (chunk: Buffer) => {
          reply.raw.write(chunk);
          chunks.push(chunk);
        });

        upstreamRes.on('end', () => {
          reply.raw.end();

          const durationMs = Date.now() - startTime;
          const responseBody = Buffer.concat(chunks).toString();
          const usage = parseCompletionUsage(responseBody);

          logRequestAsync({
            model: requestMeta.model || 'unknown',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            durationMs,
            prompt: requestMeta.prompt || '',
            responsePreview: usage.responsePreview,
            endpoint: request.url.split('?')[0],
            statusCode,
          });

          resolve();
        });

        upstreamRes.on('error', () => {
          reply.raw.end();
          resolve();
        });
      }
    });

    upstreamReq.on('error', (err) => {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(502, { 'content-type': 'application/json' });
      }
      reply.raw.end(
        JSON.stringify({ error: 'Bad Gateway', message: `Cannot reach llama.cpp: ${err.message}` }),
      );
      resolve();
    });

    if (bodyBuffer.length > 0) {
      upstreamReq.write(bodyBuffer);
    }
    upstreamReq.end();
  });
}

function observeSseChunk(text: string, cb: (line: string) => void): void {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
      cb(trimmed.slice(6));
    }
  }
}

function extractPromptText(body: Record<string, unknown>): string {
  try {
    if (Array.isArray(body.messages)) {
      const msgs = body.messages as Array<{ role: string; content: unknown }>;
      const last = [...msgs].reverse().find((message) => message.role === 'user');
      if (last) {
        return typeof last.content === 'string'
          ? last.content.slice(0, 1000)
          : JSON.stringify(last.content).slice(0, 1000);
      }
    }
    if (typeof body.prompt === 'string') {
      return body.prompt.slice(0, 1000);
    }
  } catch {
    /* ignore */
  }
  return '';
}

function sanitizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string | string[]> {
  const hopByHop = new Set([
    'connection', 'keep-alive', 'transfer-encoding',
    'te', 'trailer', 'upgrade', 'proxy-authorization',
    'proxy-authenticate',
  ]);
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!hopByHop.has(key.toLowerCase()) && value !== undefined) {
      result[key] = value as string | string[];
    }
  }
  return result;
}