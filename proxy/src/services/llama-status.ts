import http from 'http';
import fs from 'fs';
import { getDefaultModelPath, getSetting } from '../db/queries';
import { getLlamaConnectionConfig } from './runtime-config';
import { getLlamaLaunchPlan, resolveExecutablePath } from './llama-process';

export interface LlamaHealthStatus {
  status: string;
  model?: string;
  error?: string;
}

export async function getGatewayStatus(): Promise<{
  gateway: { status: 'ok'; version: string };
  llama: LlamaHealthStatus;
  launch: { ready: boolean; issues: string[]; pid: string; commandPreview?: string };
  connection: { host: string; port: number };
  settings: { setupComplete: boolean; activeModel: string };
}> {
  const connection = getLlamaConnectionConfig();
  const issues = getLaunchIssues();
  let commandPreview: string | undefined;

  try {
    commandPreview = getLlamaLaunchPlan().command;
  } catch {
    commandPreview = undefined;
  }

  return {
    gateway: { status: 'ok', version: '1.0.0' },
    llama: await checkLlamaHealth(),
    launch: {
      ready: issues.length === 0,
      issues,
      pid: getSetting('llama_pid'),
      commandPreview,
    },
    connection,
    settings: {
      setupComplete: getSetting('setup_complete') === 'true',
      activeModel: getSetting('active_model'),
    },
  };
}

export function getLaunchIssues(): string[] {
  const issues: string[] = [];
  const bin = getSetting('llama_bin').trim();
  const modelPath = getDefaultModelPath();

  if (!bin) {
    issues.push('Binary path is not configured.');
  } else if (!resolveExecutablePath(bin)) {
    issues.push(`Binary not found: ${bin}`);
  }

  if (!modelPath) {
    issues.push('No active model selected.');
  } else if (!fs.existsSync(modelPath)) {
    issues.push(`Model file not found: ${modelPath}`);
  }

  return issues;
}

export function checkLlamaHealth(): Promise<LlamaHealthStatus> {
  return new Promise((resolve) => {
    const connection = getLlamaConnectionConfig();
    const req = http.request(
      { hostname: connection.host, port: connection.port, path: '/health', method: 'GET', timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ status: parsed.status || 'ok', model: parsed.model_path });
          } catch {
            resolve({ status: res.statusCode === 200 ? 'ok' : 'error' });
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'unreachable', error: 'timeout' });
    });
    req.on('error', (error) => resolve({ status: 'unreachable', error: error.message }));
    req.end();
  });
}