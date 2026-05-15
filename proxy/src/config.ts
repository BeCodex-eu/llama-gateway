import path from 'path';

export interface GatewayConfig {
  port: number;
  host: string;
  llamaHost: string;
  llamaPort: number;
  dbPath: string;
  uiDist: string;
  logRetentionDays: number;
  openBrowserOnStart: boolean;
}

export const config: GatewayConfig = {
  port: parseInt(process.env.GATEWAY_PORT || '11435'),
  host: process.env.GATEWAY_HOST || '0.0.0.0',
  llamaHost: process.env.LLAMA_HOST || '127.0.0.1',
  llamaPort: parseInt(process.env.LLAMA_PORT || '8080'),
  dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'gateway.db'),
  uiDist: process.env.UI_DIST || path.join(process.cwd(), '..', 'ui', 'dist'),
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30'),
  openBrowserOnStart: process.env.OPEN_BROWSER !== 'false',
};

export const LLAMA_BASE_URL = `http://${config.llamaHost}:${config.llamaPort}`;
