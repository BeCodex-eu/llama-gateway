import { config } from '../config';

export type LlamaSettingSectionKey =
  | 'runtime'
  | 'performance'
  | 'cache'
  | 'template'
  | 'advanced';

export type LlamaSettingInput = 'text' | 'number' | 'boolean' | 'select' | 'textarea';

export interface LlamaSettingOption {
  label: string;
  value: string;
}

export interface LlamaSettingDefinition {
  key: string;
  label: string;
  section: LlamaSettingSectionKey;
  input: LlamaSettingInput;
  defaultValue: string;
  placeholder?: string;
  description?: string;
  flag?: string;
  options?: LlamaSettingOption[];
  buildArgs?: (value: string) => string[];
  // When true, only shown when MTP is enabled
  requiresMtp?: boolean;
}

export interface LlamaSettingSchemaField {
  key: string;
  label: string;
  section: LlamaSettingSectionKey;
  input: LlamaSettingInput;
  defaultValue: string;
  placeholder?: string;
  description?: string;
  flag?: string;
  options?: LlamaSettingOption[];
  requiresMtp?: boolean;
}

export interface LlamaSettingSection {
  key: LlamaSettingSectionKey;
  label: string;
  description: string;
}

export const LLAMA_SETTING_SECTIONS: LlamaSettingSection[] = [
  {
    key: 'runtime',
    label: 'Binary & Model',
    description: 'Path to llama-server and model identity settings.',
  },
  {
    key: 'performance',
    label: 'Performance & MTP',
    description: 'Threading, GPU offload, and Multi-Token Prediction for faster generation.',
  },
  {
    key: 'cache',
    label: 'Cache & Memory',
    description: 'KV cache settings that affect speed and memory usage.',
  },
  {
    key: 'template',
    label: 'Thinking & Template',
    description: 'Chat template parameters for reasoning models.',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    description: 'Custom flags not covered above — anything you add here is appended to the launch command.',
  },
];

export const CORE_SETTING_DEFAULTS: Record<string, string> = {
  setup_complete: 'false',
  models_dir: '',
  log_retention_days: '30',
  active_model: '',
  llama_host: config.llamaHost,
  llama_port: String(config.llamaPort),
  gateway_port: '11435',
  llama_pid: '',
};

const CACHE_TYPE_OPTIONS: LlamaSettingOption[] = [
  { label: 'Default / f16', value: 'f16' },
  { label: 'bf16', value: 'bf16' },
  { label: 'q8_0 (fast, smaller)', value: 'q8_0' },
  { label: 'q4_0', value: 'q4_0' },
  { label: 'q4_1', value: 'q4_1' },
  { label: 'iq4_nl', value: 'iq4_nl' },
  { label: 'q5_0', value: 'q5_0' },
  { label: 'q5_1', value: 'q5_1' },
  { label: 'f32', value: 'f32' },
];

function scalarFlag(flag: string) {
  return (value: string): string[] => {
    const trimmed = value.trim();
    return trimmed ? [flag, trimmed] : [];
  };
}

function booleanFlag(enabledFlag: string, disabledFlag?: string) {
  return (value: string): string[] => {
    if (value === 'true') return [enabledFlag];
    if (value === 'false' && disabledFlag) return [disabledFlag];
    return [];
  };
}

export const LLAMA_SETTING_DEFINITIONS: LlamaSettingDefinition[] = [
  // ── Runtime ──────────────────────────────────────────────
  {
    key: 'llama_bin',
    label: 'llama-server Binary Path',
    section: 'runtime',
    input: 'text',
    defaultValue: '',
    placeholder: 'D:\\llama.cpp\\llamacpp\\llama-server.exe',
    description: 'Path to the executable. If the name is on PATH, that also works.',
  },
  {
    key: 'llama_alias',
    label: 'Model Alias',
    section: 'runtime',
    input: 'text',
    defaultValue: '',
    flag: '--alias',
    placeholder: 'Qwen3.6-35B Gateway',
    description: 'Alias exposed by llama-server for API clients.',
    buildArgs: scalarFlag('--alias'),
  },
  {
    key: 'llama_mmproj',
    label: 'Multimodal Projector (mmproj)',
    section: 'runtime',
    input: 'text',
    defaultValue: '',
    flag: '--mmproj',
    placeholder: 'mmproj-Qwen3.6-27B-BF16.gguf',
    description: 'Path to the multimodal projector file for vision models.',
    buildArgs: scalarFlag('--mmproj'),
  },

  // ── Performance & MTP ────────────────────────────────────
  {
    key: 'llama_mtp_enabled',
    label: 'Enable MTP Speculative Decoding',
    section: 'performance',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Multi-Token Prediction. Makes MTP-native models (Qwen3.6, etc.) generate tokens much faster.',
    buildArgs: (value) => value === 'true' ? ['--spec-type', 'draft-mtp'] : [],
  },
  {
    key: 'llama_spec_draft_n_max',
    label: 'MTP Draft Tokens',
    section: 'performance',
    input: 'number',
    defaultValue: '2',
    flag: '--spec-draft-n-max',
    placeholder: '2',
    description: 'Number of tokens to draft per MTP step. Higher = faster but uses more VRAM.',
    requiresMtp: true,
    buildArgs: scalarFlag('--spec-draft-n-max'),
  },
  {
    key: 'llama_context_size',
    label: 'Context Size',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '-c',
    placeholder: '65536',
    description: 'Prompt context size. Leave blank to use the model default.',
    buildArgs: scalarFlag('-c'),
  },
  {
    key: 'llama_gpu_layers',
    label: 'GPU Layers',
    section: 'performance',
    input: 'text',
    defaultValue: '-1',
    flag: '-ngl',
    placeholder: '-1',
    description: '-1 = all layers on GPU. 0 = CPU only. Or enter exact count.',
    buildArgs: scalarFlag('-ngl'),
  },
  {
    key: 'llama_threads',
    label: 'Generation Threads',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '-t',
    placeholder: '8',
    description: 'CPU threads used during generation.',
    buildArgs: scalarFlag('-t'),
  },
  {
    key: 'llama_no_mmproj_offload',
    label: 'Disable mmproj GPU Offload',
    section: 'performance',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Keep the mmproj file on CPU instead of GPU. Use when VRAM is limited.',
    buildArgs: (value) => (value === 'true' ? ['--no-mmproj-offload'] : []),
  },

  // ── Cache & Memory ──────────────────────────────────────
  {
    key: 'llama_cache_type_k',
    label: 'Cache Type K',
    section: 'cache',
    input: 'select',
    defaultValue: 'q8_0',
    flag: '--cache-type-k',
    description: 'KV cache datatype for K. q8_0 is a good balance of speed and memory.',
    options: CACHE_TYPE_OPTIONS,
    buildArgs: scalarFlag('--cache-type-k'),
  },
  {
    key: 'llama_cache_type_v',
    label: 'Cache Type V',
    section: 'cache',
    input: 'select',
    defaultValue: 'q8_0',
    flag: '--cache-type-v',
    description: 'KV cache datatype for V. q8_0 is a good balance of speed and memory.',
    options: CACHE_TYPE_OPTIONS,
    buildArgs: scalarFlag('--cache-type-v'),
  },
  {
    key: 'llama_fit',
    label: 'Auto-fit to Memory',
    section: 'cache',
    input: 'select',
    defaultValue: 'on',
    flag: '--fit',
    description: 'Automatically adjust unset arguments to fit device memory.',
    options: [
      { label: 'On (auto)', value: 'on' },
      { label: 'Off (manual)', value: 'off' },
    ],
    buildArgs: scalarFlag('--fit'),
  },

  // ── Thinking & Template ──────────────────────────────────
  {
    key: 'llama_chat_template_kwargs',
    label: 'Chat Template Kwargs',
    section: 'template',
    input: 'textarea',
    defaultValue: '',
    placeholder: '{"preserve_thinking": true}',
    description: 'JSON params for the chat template. Use {"preserve_thinking": true} to keep thinking tags in output.',
    buildArgs: scalarFlag('--chat-template-kwargs'),
  },

  // ── Custom Command (overrides all individual settings) ──
  {
    key: 'llama_custom_launch_command',
    label: 'Custom Launch Command',
    section: 'advanced',
    input: 'textarea',
    defaultValue: '',
    placeholder: 'Paste or edit the full llama-server command here...',
    description: 'Full launch command line. When set, overrides all individual runtime settings. Use {MODEL} as placeholder — it is replaced with the active model at launch time.',
    buildArgs: (value) => value.trim().split(/\s+/).filter(Boolean),
  },

  // ── Advanced ─────────────────────────────────────────────
  {
    key: 'llama_extra_args',
    label: 'Extra Command-Line Arguments',
    section: 'advanced',
    input: 'textarea',
    defaultValue: '',
    placeholder: '--rope-scaling linear --rope-freq-scale 0.5',
    description: 'Any additional flags not covered above. Split by spaces — appended verbatim to the launch command.',
    buildArgs: (value) => value.trim().split(/\s+/).filter(Boolean),
  },
];

// Default custom launch command — {MODEL} is replaced with active model at launch time
export const DEFAULT_CUSTOM_COMMAND =
  'llama-server -m {MODEL} -c 65536 -ngl -1 -t 8 -ctk q8_0 -ctv q8_0 --chat-template-kwargs \'{{"preserve_thinking": true}}\' --spec-type draft-mtp --spec-draft-n-max 2 --fit off --no-mmproj-offload';

export const SETTING_DEFAULTS: Record<string, string> = {
  ...CORE_SETTING_DEFAULTS,
  ...Object.fromEntries(LLAMA_SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue])),
};

export const EDITABLE_SETTING_KEYS = new Set<string>([
  'setup_complete',
  'models_dir',
  'log_retention_days',
  'active_model',
  'llama_host',
  'llama_port',
  'gateway_port',
  ...LLAMA_SETTING_DEFINITIONS.map((definition) => definition.key),
]);

export function getLlamaSettingSchema(): { sections: LlamaSettingSection[]; fields: LlamaSettingSchemaField[] } {
  return {
    sections: LLAMA_SETTING_SECTIONS,
    fields: LLAMA_SETTING_DEFINITIONS.map(({ buildArgs: _buildArgs, ...field }) => field),
  };
}

export function buildLlamaLaunchArgs(settings: Record<string, string>, baseArgs: string[]): string[] {
  const args = [...baseArgs];

  for (const definition of LLAMA_SETTING_DEFINITIONS) {
    if (!definition.buildArgs) continue;
    const value = settings[definition.key] ?? definition.defaultValue;
    args.push(...definition.buildArgs(String(value)));
  }

  return args;
}
