import { config } from '../config';

export type LlamaSettingSectionKey =
  | 'runtime'
  | 'performance'
  | 'cache'
  | 'server'
  | 'reasoning'
  | 'sampling'
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
}

export interface LlamaSettingSection {
  key: LlamaSettingSectionKey;
  label: string;
  description: string;
}

export const LLAMA_SETTING_SECTIONS: LlamaSettingSection[] = [
  {
    key: 'runtime',
    label: 'Runtime',
    description: 'Binary and model identity settings that affect how the launched server presents itself.',
  },
  {
    key: 'performance',
    label: 'Performance',
    description: 'Threading, batching, and GPU offload controls for the main server process.',
  },
  {
    key: 'cache',
    label: 'Cache & Memory',
    description: 'KV cache, memory mapping, and reuse settings that influence throughput and memory pressure.',
  },
  {
    key: 'server',
    label: 'Server Behavior',
    description: 'HTTP, endpoint exposure, and general server runtime behavior.',
  },
  {
    key: 'reasoning',
    label: 'Reasoning & Speculative',
    description: 'Thinking output and speculative decoding controls supported by the local llama-server build.',
  },
  {
    key: 'sampling',
    label: 'Sampling Defaults',
    description: 'Default generation behavior applied when the server itself handles sampling.',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    description: 'Escape hatch for flags not surfaced explicitly in the control panel.',
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
  { label: 'q8_0', value: 'q8_0' },
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
    key: 'llama_tags',
    label: 'Tags',
    section: 'runtime',
    input: 'text',
    defaultValue: '',
    flag: '--tags',
    placeholder: 'prod,qwen,reasoning',
    description: 'Optional informational tags exposed by the server.',
    buildArgs: scalarFlag('--tags'),
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
    defaultValue: 'auto',
    flag: '-ngl',
    placeholder: 'auto',
    description: 'Exact layer count, auto, or all.',
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
    key: 'llama_threads_http',
    label: 'HTTP Threads',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '--threads-http',
    placeholder: '4',
    description: 'Threads used to process incoming HTTP requests.',
    buildArgs: scalarFlag('--threads-http'),
  },
  {
    key: 'llama_batch_size',
    label: 'Batch Size',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '-b',
    placeholder: '2048',
    description: 'Logical maximum batch size.',
    buildArgs: scalarFlag('-b'),
  },
  {
    key: 'llama_ubatch_size',
    label: 'uBatch Size',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '-ub',
    placeholder: '512',
    description: 'Physical maximum batch size.',
    buildArgs: scalarFlag('-ub'),
  },
  {
    key: 'llama_parallel',
    label: 'Parallel Slots',
    section: 'performance',
    input: 'number',
    defaultValue: '',
    flag: '--parallel',
    placeholder: '1',
    description: 'Number of server slots for concurrent requests.',
    buildArgs: scalarFlag('--parallel'),
  },
  {
    key: 'llama_cont_batching',
    label: 'Continuous Batching',
    section: 'performance',
    input: 'boolean',
    defaultValue: 'true',
    description: 'Keep dynamic batching enabled between requests.',
    buildArgs: booleanFlag('--cont-batching', '--no-cont-batching'),
  },
  {
    key: 'llama_flash_attn',
    label: 'Flash Attention',
    section: 'cache',
    input: 'select',
    defaultValue: 'auto',
    flag: '-fa',
    description: 'Control Flash Attention mode.',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'On', value: 'on' },
      { label: 'Off', value: 'off' },
    ],
    buildArgs: scalarFlag('-fa'),
  },
  {
    key: 'llama_cache_type_k',
    label: 'Cache Type K',
    section: 'cache',
    input: 'select',
    defaultValue: 'f16',
    flag: '--cache-type-k',
    description: 'KV cache datatype for K.',
    options: CACHE_TYPE_OPTIONS,
    buildArgs: scalarFlag('--cache-type-k'),
  },
  {
    key: 'llama_cache_type_v',
    label: 'Cache Type V',
    section: 'cache',
    input: 'select',
    defaultValue: 'f16',
    flag: '--cache-type-v',
    description: 'KV cache datatype for V.',
    options: CACHE_TYPE_OPTIONS,
    buildArgs: scalarFlag('--cache-type-v'),
  },
  {
    key: 'llama_no_mmap',
    label: 'Disable mmap',
    section: 'cache',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Disable memory mapped model loading.',
    buildArgs: (value) => (value === 'true' ? ['--no-mmap'] : []),
  },
  {
    key: 'llama_cache_prompt',
    label: 'Prompt Cache',
    section: 'cache',
    input: 'boolean',
    defaultValue: 'true',
    description: 'Enable prompt caching for faster repeated prompts.',
    buildArgs: booleanFlag('--cache-prompt', '--no-cache-prompt'),
  },
  {
    key: 'llama_cache_reuse',
    label: 'Cache Reuse Threshold',
    section: 'cache',
    input: 'number',
    defaultValue: '',
    flag: '--cache-reuse',
    placeholder: '256',
    description: 'Minimum chunk size to attempt KV reuse.',
    buildArgs: scalarFlag('--cache-reuse'),
  },
  {
    key: 'llama_timeout',
    label: 'HTTP Timeout (seconds)',
    section: 'server',
    input: 'number',
    defaultValue: '',
    flag: '--timeout',
    placeholder: '600',
    description: 'Server read/write timeout.',
    buildArgs: scalarFlag('--timeout'),
  },
  {
    key: 'llama_prio',
    label: 'Process Priority',
    section: 'server',
    input: 'select',
    defaultValue: '',
    flag: '--prio',
    description: 'Adjust OS scheduling priority for the llama-server process.',
    options: [
      { label: 'Default', value: '' },
      { label: '0 - Normal', value: '0' },
      { label: '1 - Medium', value: '1' },
      { label: '2 - High', value: '2' },
      { label: '3 - Realtime', value: '3' },
    ],
    buildArgs: scalarFlag('--prio'),
  },
  {
    key: 'llama_slots',
    label: 'Expose Slots Endpoint',
    section: 'server',
    input: 'boolean',
    defaultValue: 'true',
    description: 'Expose /slots monitoring.',
    buildArgs: booleanFlag('--slots', '--no-slots'),
  },
  {
    key: 'llama_props',
    label: 'Enable /props',
    section: 'server',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Allow updating global properties via POST /props.',
    buildArgs: (value) => (value === 'true' ? ['--props'] : []),
  },
  {
    key: 'llama_metrics',
    label: 'Enable Metrics',
    section: 'server',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Expose Prometheus-compatible metrics.',
    buildArgs: (value) => (value === 'true' ? ['--metrics'] : []),
  },
  {
    key: 'llama_api_prefix',
    label: 'API Prefix',
    section: 'server',
    input: 'text',
    defaultValue: '',
    flag: '--api-prefix',
    placeholder: '/v1',
    description: 'Optional prefix served by llama-server itself.',
    buildArgs: scalarFlag('--api-prefix'),
  },
  {
    key: 'llama_embedding',
    label: 'Embeddings Only',
    section: 'server',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Restrict the server to embedding use cases.',
    buildArgs: (value) => (value === 'true' ? ['--embedding'] : []),
  },
  {
    key: 'llama_rerank',
    label: 'Enable Rerank Endpoint',
    section: 'server',
    input: 'boolean',
    defaultValue: 'false',
    description: 'Enable the reranking endpoint.',
    buildArgs: (value) => (value === 'true' ? ['--rerank'] : []),
  },
  {
    key: 'llama_reasoning_format',
    label: 'Reasoning Format',
    section: 'reasoning',
    input: 'select',
    defaultValue: 'auto',
    flag: '--reasoning-format',
    description: 'How reasoning content is returned in API responses.',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'None', value: 'none' },
      { label: 'DeepSeek', value: 'deepseek' },
      { label: 'DeepSeek Legacy', value: 'deepseek-legacy' },
    ],
    buildArgs: scalarFlag('--reasoning-format'),
  },
  {
    key: 'llama_reasoning',
    label: 'Reasoning Mode',
    section: 'reasoning',
    input: 'select',
    defaultValue: 'auto',
    flag: '--reasoning',
    description: 'Force reasoning on, off, or auto.',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'On', value: 'on' },
      { label: 'Off', value: 'off' },
    ],
    buildArgs: scalarFlag('--reasoning'),
  },
  {
    key: 'llama_reasoning_budget',
    label: 'Reasoning Budget',
    section: 'reasoning',
    input: 'number',
    defaultValue: '',
    flag: '--reasoning-budget',
    placeholder: '-1',
    description: 'Token budget for thinking; -1 means unrestricted.',
    buildArgs: scalarFlag('--reasoning-budget'),
  },
  {
    key: 'llama_spec_type',
    label: 'Speculative Type',
    section: 'reasoning',
    input: 'select',
    defaultValue: 'none',
    flag: '--spec-type',
    description: 'Speculative decoding mode when no draft model is configured.',
    options: [
      { label: 'None', value: 'none' },
      { label: 'MTP', value: 'mtp' },
      { label: 'ngram-cache', value: 'ngram-cache' },
      { label: 'ngram-simple', value: 'ngram-simple' },
      { label: 'ngram-map-k', value: 'ngram-map-k' },
      { label: 'ngram-map-k4v', value: 'ngram-map-k4v' },
      { label: 'ngram-mod', value: 'ngram-mod' },
    ],
    buildArgs: scalarFlag('--spec-type'),
  },
  {
    key: 'llama_spec_draft_n_max',
    label: 'Draft Tokens Max',
    section: 'reasoning',
    input: 'number',
    defaultValue: '',
    flag: '--spec-draft-n-max',
    placeholder: '2',
    description: 'Maximum drafted tokens for speculative decoding.',
    buildArgs: scalarFlag('--spec-draft-n-max'),
  },
  {
    key: 'llama_n_predict',
    label: 'Default Max Predict',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--n-predict',
    placeholder: '-1',
    description: 'Default maximum generated tokens.',
    buildArgs: scalarFlag('--n-predict'),
  },
  {
    key: 'llama_temp',
    label: 'Temperature',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--temp',
    placeholder: '0.8',
    description: 'Sampling temperature.',
    buildArgs: scalarFlag('--temp'),
  },
  {
    key: 'llama_top_p',
    label: 'Top-P',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--top-p',
    placeholder: '0.95',
    description: 'Nucleus sampling parameter.',
    buildArgs: scalarFlag('--top-p'),
  },
  {
    key: 'llama_top_k',
    label: 'Top-K',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--top-k',
    placeholder: '40',
    description: 'Top-k sampling parameter.',
    buildArgs: scalarFlag('--top-k'),
  },
  {
    key: 'llama_min_p',
    label: 'Min-P',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--min-p',
    placeholder: '0.05',
    description: 'Minimum probability sampling threshold.',
    buildArgs: scalarFlag('--min-p'),
  },
  {
    key: 'llama_repeat_penalty',
    label: 'Repeat Penalty',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--repeat-penalty',
    placeholder: '1.1',
    description: 'Penalty applied to repeated tokens.',
    buildArgs: scalarFlag('--repeat-penalty'),
  },
  {
    key: 'llama_presence_penalty',
    label: 'Presence Penalty',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--presence-penalty',
    placeholder: '0.0',
    description: 'Presence penalty.',
    buildArgs: scalarFlag('--presence-penalty'),
  },
  {
    key: 'llama_frequency_penalty',
    label: 'Frequency Penalty',
    section: 'sampling',
    input: 'number',
    defaultValue: '',
    flag: '--frequency-penalty',
    placeholder: '0.0',
    description: 'Frequency penalty.',
    buildArgs: scalarFlag('--frequency-penalty'),
  },
  {
    key: 'llama_extra_args',
    label: 'Extra Arguments',
    section: 'advanced',
    input: 'textarea',
    defaultValue: '',
    placeholder: '--rope-scaling linear --rope-freq-scale 0.5',
    description: 'Appended verbatim after all structured flags.',
    buildArgs: (value) => value.trim().split(/\s+/).filter(Boolean),
  },
];

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