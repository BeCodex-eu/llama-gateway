import { defineStore } from 'pinia';
import { ref } from 'vue';

// ─── API helper ──────────────────────────────────────────────────────────────
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface GatewayStatusResponse {
  gateway: { status: 'ok'; version: string };
  llama: { status: string; model?: string; error?: string };
  launch: { ready: boolean; issues: string[]; pid: string; commandPreview?: string };
  connection: { host: string; port: number };
  settings: { setupComplete: boolean; activeModel: string };
}

export interface LlamaSettingsSchemaSection {
  key: 'runtime' | 'performance' | 'cache' | 'server' | 'reasoning' | 'sampling' | 'advanced';
  label: string;
  description: string;
}

export interface LlamaSettingsSchemaField {
  key: string;
  label: string;
  section: LlamaSettingsSchemaSection['key'];
  input: 'text' | 'number' | 'boolean' | 'select' | 'textarea';
  defaultValue: string;
  placeholder?: string;
  description?: string;
  flag?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface LlamaSettingsSchema {
  sections: LlamaSettingsSchemaSection[];
  fields: LlamaSettingsSchemaField[];
}

// ─── App / Status Store ──────────────────────────────────────────────────────
export const useAppStore = defineStore('app', () => {
  const llamaStatus = ref<'ok' | 'unreachable' | 'error' | 'loading'>('loading');
  const activeModel = ref('');
  const setupComplete = ref(true);
  const launchReady = ref(false);
  const launchIssues = ref<string[]>([]);
  const launchCommandPreview = ref('');
  const connection = ref({ host: '127.0.0.1', port: 8080 });

  async function refreshStatus() {
    try {
      const data = await api<GatewayStatusResponse>('/status');
      llamaStatus.value = data.llama.status === 'ok'
        ? 'ok'
        : data.llama.status === 'error'
          ? 'error'
          : 'unreachable';
      activeModel.value = data.settings.activeModel;
      setupComplete.value = data.settings.setupComplete;
      launchReady.value = data.launch.ready;
      launchIssues.value = data.launch.issues;
      launchCommandPreview.value = data.launch.commandPreview || '';
      connection.value = data.connection;
    } catch {
      llamaStatus.value = 'unreachable';
    }
  }

  return {
    llamaStatus,
    activeModel,
    setupComplete,
    launchReady,
    launchIssues,
    launchCommandPreview,
    connection,
    refreshStatus,
  };
});

// ─── Analytics Store ─────────────────────────────────────────────────────────
export interface OverviewStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_latency_ms: number;
  requests_today: number;
  tokens_today: number;
}
export interface DailyTokens { date: string; input_tokens: number; output_tokens: number; requests: number; }
export interface ModelUsage { model: string; requests: number; input_tokens: number; output_tokens: number; avg_duration_ms: number; }
export interface LatencyPoint { date: string; avg_latency_ms: number; max_latency_ms: number; }
export interface HourlyRequests { hour: string; requests: number; }
export interface StatusStats { date: string; success: number; errors: number; }
export interface RequestRow {
  id: number; timestamp: string; model: string;
  input_tokens: number; output_tokens: number;
  duration_ms: number; prompt: string;
  response_preview: string; status_code: number;
}

export const useAnalyticsStore = defineStore('analytics', () => {
  const overview = ref<OverviewStats | null>(null);
  const tokensPerDay = ref<DailyTokens[]>([]);
  const modelUsage = ref<ModelUsage[]>([]);
  const latencyTrend = ref<LatencyPoint[]>([]);
  const reqsPerHour = ref<HourlyRequests[]>([]);
  const statusStats = ref<StatusStats[]>([]);
  const requests = ref<RequestRow[]>([]);
  const requestsTotal = ref(0);
  const loading = ref(false);

  async function fetchOverview() {
    overview.value = await api<OverviewStats>('/analytics/overview');
  }

  async function fetchCharts(days = 30, fromDate?: string, toDate?: string) {
    loading.value = true;
    try {
      const range = fromDate && toDate
        ? `&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`
        : '';
      const [tpd, mu, lt, rph, ss] = await Promise.all([
        api<{ data: DailyTokens[] }>(`/analytics/tokens-per-day?days=${days}${range}`),
        api<{ data: ModelUsage[] }>(`/analytics/model-usage?days=${days}${range}`),
        api<{ data: LatencyPoint[] }>(`/analytics/latency?days=${days}${range}`),
        api<{ data: HourlyRequests[] }>(`/analytics/requests-per-hour?days=${days}${range}`),
        api<{ data: StatusStats[] }>(`/analytics/status-stats?days=${days}${range}`),
      ]);
      tokensPerDay.value = tpd.data;
      modelUsage.value = mu.data;
      latencyTrend.value = lt.data;
      reqsPerHour.value = rph.data;
      statusStats.value = ss.data;
    } finally {
      loading.value = false;
    }
  }

  async function fetchRequests(opts: {
    model?: string; fromDate?: string; toDate?: string;
    limit?: number; offset?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (opts.model)    params.set('model', opts.model);
    if (opts.fromDate) params.set('fromDate', opts.fromDate);
    if (opts.toDate)   params.set('toDate', opts.toDate);
    if (opts.limit)    params.set('limit', String(opts.limit));
    if (opts.offset)   params.set('offset', String(opts.offset));
    const res = await api<{ rows: RequestRow[]; total: number }>(`/analytics/requests?${params}`);
    requests.value = res.rows;
    requestsTotal.value = res.total;
  }

  return { overview, tokensPerDay, modelUsage, latencyTrend, reqsPerHour, statusStats, requests, requestsTotal, loading, fetchOverview, fetchCharts, fetchRequests };
});

// ─── Models Store ─────────────────────────────────────────────────────────────
export interface Model {
  id: number; name: string; path: string;
  last_used: string | null; is_default: number; created_at: string;
}

export const useModelsStore = defineStore('models', () => {
  const models = ref<Model[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchModels() {
    const res = await api<{ models: Model[] }>('/models');
    models.value = res.models;
  }

  async function addModel(name: string, path: string) {
    loading.value = true;
    error.value = '';
    try {
      await api('/models', { method: 'POST', body: JSON.stringify({ name, path }) });
      await fetchModels();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function removeModel(id: number) {
    await api(`/models/${id}`, { method: 'DELETE' });
    await fetchModels();
  }

  async function activateModel(id: number) {
    await api(`/models/${id}/activate`, { method: 'POST' });
    await fetchModels();
  }

  async function scanDir(dir: string) {
    return api<{ directory: string; models: string[] }>(`/models/scan?dir=${encodeURIComponent(dir)}`);
  }

  async function scanImport(dir: string) {
    return api<{ imported: Model[] }>('/models/scan-import', {
      method: 'POST',
      body: JSON.stringify({ dir }),
    });
  }

  return { models, loading, error, fetchModels, addModel, removeModel, activateModel, scanDir, scanImport };
});

// ─── Settings Store ───────────────────────────────────────────────────────────
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Record<string, string>>({});
  const schema = ref<LlamaSettingsSchema | null>(null);
  const saving = ref(false);

  async function fetchSettings() {
    const res = await api<{ settings: Record<string, string> }>('/settings');
    settings.value = res.settings;
  }

  async function fetchSchema() {
    schema.value = await api<LlamaSettingsSchema>('/settings/schema');
  }

  async function saveSettings(updates: Record<string, string>) {
    saving.value = true;
    try {
      const res = await api<{ settings: Record<string, string> }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      settings.value = res.settings;
    } finally {
      saving.value = false;
    }
  }

  async function cleanup(days?: number, deleteAll?: boolean) {
    return api<{ deleted: number }>('/settings/cleanup', {
      method: 'POST',
      body: JSON.stringify({ days, deleteAll }),
    });
  }

  async function vacuum() {
    return api('/settings/vacuum', { method: 'POST' });
  }

  async function reset() {
    return api('/settings/reset', { method: 'POST' });
  }

  async function launch(opts: { modelPath?: string; rawCommand?: string } = {}) {
    return api<{ launched: boolean; pid?: number; command?: string; error?: string }>('/llama/launch', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  async function previewCommand(modelPath?: string) {
    const params = modelPath ? `?modelPath=${encodeURIComponent(modelPath)}` : '';
    return api<{ command: string }>(`/llama/preview${params}`);
  }

  async function stop() {
    return api<{ stopped: boolean; pid?: number; note?: string }>('/llama/stop', { method: 'POST' });
  }

  return { settings, schema, saving, fetchSettings, fetchSchema, saveSettings, cleanup, vacuum, reset, launch, stop, previewCommand };
});

export { api };
