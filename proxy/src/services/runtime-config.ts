import { getSetting } from '../db/queries';
import { config } from '../config';

export interface LlamaConnectionConfig {
  host: string;
  port: number;
}

export function getLlamaConnectionConfig(): LlamaConnectionConfig {
  const storedHost = getSetting('llama_host').trim();
  const storedPort = parseInt(getSetting('llama_port') || '', 10);

  return {
    host: storedHost || config.llamaHost,
    port: Number.isFinite(storedPort) && storedPort > 0 ? storedPort : config.llamaPort,
  };
}