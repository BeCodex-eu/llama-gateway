import fs from 'fs';
import path from 'path';
import {
  deleteModel,
  getAllModels,
  getSetting,
  setDefaultModel,
  setSetting,
  upsertModel,
  type ModelRecord,
} from '../db/queries';

const MAX_SCAN_DEPTH = 3;

export class ModelsServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ModelsServiceError';
  }
}

export function listModels(): ModelRecord[] {
  return getAllModels();
}

export function saveModel(input: { name: string; path: string; is_default?: number }): ModelRecord {
  const model = upsertModel({
    name: input.name,
    path: input.path,
    is_default: input.is_default || 0,
  });

  if (input.is_default && model.id) {
    setDefaultModel(model.id);
  }

  return model;
}

export function removeModelById(id: number): void {
  const model = getModelOrThrow(id);
  const removed = deleteModel(id);

  if (!removed) {
    throw new ModelsServiceError('Model not found', 404);
  }

  if (model.is_default) {
    setSetting('active_model', '');
  }
}

export function activateModelById(id: number): void {
  getModelOrThrow(id);
  setDefaultModel(id);
}

export function scanModelDirectory(dir?: string): { directory: string; models: string[] } {
  const directory = resolveDirectory(dir);
  return {
    directory,
    models: scanForGguf(directory),
  };
}

export function scanAndImportModels(dir: string): { directory: string; imported: ModelRecord[] } {
  const directory = resolveDirectory(dir, { persist: true });
  const imported = scanForGguf(directory).map((filePath) => upsertModel({
    name: path.basename(filePath, '.gguf'),
    path: filePath,
  }));

  return { directory, imported };
}

function getModelOrThrow(id: number): ModelRecord {
  const model = getAllModels().find((entry) => entry.id === id);
  if (!model) {
    throw new ModelsServiceError('Model not found', 404);
  }
  return model;
}

function resolveDirectory(dir?: string, options?: { persist?: boolean }): string {
  const directory = (dir || getSetting('models_dir')).trim();

  if (!directory) {
    throw new ModelsServiceError('No directory specified. Pass ?dir= or configure models_dir in settings.');
  }

  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new ModelsServiceError(`Directory not found: ${directory}`);
  }

  if (options?.persist) {
    setSetting('models_dir', directory);
  }

  return directory;
}

function scanForGguf(dir: string, depth = 0): string[] {
  if (depth > MAX_SCAN_DEPTH) {
    return [];
  }

  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...scanForGguf(fullPath, depth + 1));
      }
    }
  } catch {
    // Skip directories that cannot be traversed.
  }

  return results;
}