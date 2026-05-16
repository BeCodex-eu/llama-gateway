import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { getAllSettings, getDefaultModelPath, getSetting, setSetting } from '../db/queries';
import { buildLlamaLaunchArgs, DEFAULT_CUSTOM_COMMAND } from '../lib/llama-settings';
import { getLlamaConnectionConfig } from './runtime-config';

export interface LaunchOverrides {
  bin?: string;
  host?: string;
  port?: string;
  modelPath?: string;
}

export interface LlamaLaunchPlan {
  executable: string;
  args: string[];
  command: string;
  modelPath: string;
  host: string;
  port: string;
}

export function getLlamaLaunchPlan(overrides: LaunchOverrides = {}): LlamaLaunchPlan {
  const settings = getAllSettings();
  const connection = getLlamaConnectionConfig();
  const host = (overrides.host || settings.llama_host || connection.host).trim();
  const port = (overrides.port || settings.llama_port || String(connection.port)).trim();
  const requestedBin = (overrides.bin || settings.llama_bin || '').trim();

  if (!requestedBin) {
    throw new Error('No llama.cpp binary path configured. Set llama_bin in Settings.');
  }

  const executable = resolveExecutablePath(requestedBin);
  if (!executable) {
    throw new Error(`Binary not found: ${requestedBin}`);
  }

  const modelPath = (overrides.modelPath || getDefaultModelPath() || '').trim();
  if (!modelPath) {
    throw new Error('No active model set. Activate a model on the Models page first.');
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  // Check for custom launch command — if set, use it directly (override all individual settings)
  const customCmd = (settings.llama_custom_launch_command || '').trim();
  if (customCmd) {
    // Replace {MODEL} placeholder with the actual model path
    let resolvedCmd = customCmd.replace(/{MODEL}/g, modelPath);
    return {
      executable,
      args: parseRawCommand(resolvedCmd).slice(1),
      command: resolvedCmd,
      modelPath,
      host,
      port,
    };
  }

  const args = buildLlamaLaunchArgs(settings, ['-m', modelPath, '--host', host, '--port', port]);
  return {
    executable,
    args,
    command: quoteCommand(executable, args),
    modelPath,
    host,
    port,
  };
}

export function launchLlamaProcess(overrides: LaunchOverrides = {}): { launched: true; pid: number | null; command: string } {
  const plan = getLlamaLaunchPlan(overrides);
  const pid = spawnInTerminal(plan.executable, plan.args);
  if (pid) {
    setSetting('llama_pid', String(pid));
  } else {
    setSetting('llama_pid', '');
  }
  return { launched: true, pid, command: plan.command };
}

export function launchRawCommand(rawCommand: string): { launched: true; pid: number | null; command: string } {
  const tokens = parseRawCommand(rawCommand.trim());
  if (!tokens.length) throw new Error('Empty command.');
  const executable = tokens[0];
  const args = tokens.slice(1);
  const resolved = resolveExecutablePath(executable) ?? executable;
  const pid = spawnInTerminal(resolved, args);
  setSetting('llama_pid', pid ? String(pid) : '');
  return { launched: true, pid, command: rawCommand };
}

function parseRawCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    // Track quote context but skip the quote character itself
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;  // don't include shell double-quote in token
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;  // don't include shell single-quote in token
    }
    if (ch === ' ' && !inDouble && !inSingle) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export function stopLlamaProcess(): { stopped: true; pid?: number; note?: string } {
  const binPath = getSetting('llama_bin').trim();
  const pidStr = getSetting('llama_pid').trim();

  if (process.platform === 'win32' && binPath) {
    const exeName = path.basename(resolveExecutablePath(binPath) || binPath);
    spawnSync('taskkill', ['/F', '/IM', exeName], { stdio: 'ignore' });
    setSetting('llama_pid', '');
    return { stopped: true, note: `Killed all ${exeName} processes.` };
  }

  const pid = parseInt(pidStr || '0', 10);
  if (!pid) {
    throw new Error('No llama.cpp process tracked.');
  }

  try {
    process.kill(pid);
    setSetting('llama_pid', '');
    return { stopped: true, pid };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      setSetting('llama_pid', '');
      return { stopped: true, pid, note: 'Process was already terminated.' };
    }
    throw error;
  }
}

export function resolveExecutablePath(requested: string): string | null {
  if (!requested) return null;
  if (fs.existsSync(requested)) return requested;

  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(locator, [requested], { encoding: 'utf8' });
  if (result.status === 0) {
    const firstMatch = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstMatch || null;
  }

  return null;
}

function quoteCommand(executable: string, args: string[]): string {
  return [executable, ...args]
    .map((part) => {
      if (!/[\s"]/u.test(part)) {
        return part;
      }

      return process.platform === 'win32'
        ? `"${part.replace(/"/g, '""')}"`
        : `"${part.replace(/(["$`\\])/g, '\\$1')}"`;
    })
    .join(' ');
}

function spawnInTerminal(executable: string, args: string[]): number | null {
  const title = 'llama-server';

  if (process.platform === 'win32') {
    const scriptPath = writeWindowsLaunchScript(title, executable, args);
    const child = spawn('cmd.exe', ['/k', scriptPath], {
      cwd: path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return child.pid ?? null;
  }

  const cmdLine = quoteCommand(executable, args);

  if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "${cmdLine.replace(/"/g, '\\"')}"`;
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    child.unref();
    return child.pid ?? null;
  }

  const terminals: Array<{ command: string; args: string[] }> = [
    { command: 'gnome-terminal', args: ['--title', title, '--', executable, ...args] },
    { command: 'xterm', args: ['-title', title, '-e', cmdLine] },
    { command: 'konsole', args: ['--title', title, '-e', cmdLine] },
    { command: 'x-terminal-emulator', args: ['-title', title, '-e', cmdLine] },
  ];

  for (const terminal of terminals) {
    try {
      const child = spawn(terminal.command, terminal.args, { detached: true, stdio: 'ignore' });
      child.unref();
      return child.pid ?? null;
    } catch {
      /* try next terminal */
    }
  }

  const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid ?? null;
}

function writeWindowsLaunchScript(title: string, executable: string, args: string[]): string {
  const scriptPath = path.join(os.tmpdir(), 'llama-gateway-launch.cmd');
  const lines = [
    '@echo off',
    `title ${title}`,
    `cd /d ${quoteCommand(path.dirname(executable), [])}`,
    quoteCommand(executable, args),
    'echo.',
    'echo [llama-gateway] llama-server exited. This window stays open so you can review the logs.',
  ];

  fs.writeFileSync(scriptPath, `${lines.join('\r\n')}\r\n`, 'utf8');
  return scriptPath;
}