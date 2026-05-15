<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { LlamaSettingsSchemaField } from '../stores';
import { useAppStore, useSettingsStore } from '../stores';

const appStore = useAppStore();
const store = useSettingsStore();

const toast = ref('');
const toastType = ref<'success' | 'error'>('success');
const launchLog = ref('');
const launching = ref(false);
const stopping = ref(false);

const connectionForm = reactive({
  log_retention_days: '30',
  llama_host: '127.0.0.1',
  llama_port: '8080',
  gateway_port: '11435',
});

const llamaForm = reactive<Record<string, string | boolean>>({});

const cleanupDays = ref(30);
const cleanupLoading = ref(false);

const schemaSections = computed(() => store.schema?.sections ?? []);

onMounted(async () => {
  await Promise.all([store.fetchSettings(), store.fetchSchema(), appStore.refreshStatus()]);
  hydrateForms();
});

function hydrateForms() {
  Object.assign(connectionForm, {
    log_retention_days: store.settings.log_retention_days || '30',
    llama_host: store.settings.llama_host || '127.0.0.1',
    llama_port: store.settings.llama_port || '8080',
    gateway_port: store.settings.gateway_port || '11435',
  });

  for (const field of store.schema?.fields ?? []) {
    const savedValue = store.settings[field.key] ?? field.defaultValue;
    llamaForm[field.key] = field.input === 'boolean' ? savedValue === 'true' : savedValue;
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toast.value = message;
  toastType.value = type;
  setTimeout(() => {
    toast.value = '';
  }, 3500);
}

function fieldsForSection(sectionKey: string): LlamaSettingsSchemaField[] {
  return store.schema?.fields.filter((field) => field.section === sectionKey) ?? [];
}

function readStringField(field: LlamaSettingsSchemaField): string {
  const value = llamaForm[field.key];
  return typeof value === 'boolean' ? String(value) : String(value ?? '');
}

function readBooleanField(field: LlamaSettingsSchemaField): boolean {
  return Boolean(llamaForm[field.key]);
}

function writeField(field: LlamaSettingsSchemaField, value: string | boolean) {
  llamaForm[field.key] = value;
}

async function saveConnectionSettings(showMessage = true) {
  try {
    await store.saveSettings({ ...connectionForm });
    await appStore.refreshStatus();
    if (showMessage) showToast('Connection settings saved.');
  } catch (error) {
    showToast((error as Error).message, 'error');
    throw error;
  }
}

async function saveRuntimeSettings(showMessage = true) {
  try {
    const updates: Record<string, string> = {};
    for (const field of store.schema?.fields ?? []) {
      updates[field.key] = field.input === 'boolean'
        ? String(readBooleanField(field))
        : readStringField(field);
    }
    await store.saveSettings(updates);
    await appStore.refreshStatus();
    if (showMessage) showToast('llama.cpp runtime settings saved.');
  } catch (error) {
    showToast((error as Error).message, 'error');
    throw error;
  }
}

async function launchLlama() {
  launching.value = true;
  launchLog.value = '';
  try {
    await saveConnectionSettings(false);
    await saveRuntimeSettings(false);
    const result = await store.launch();
    launchLog.value = result.pid
      ? `Started in a new terminal window (PID ${result.pid}).`
      : 'Started in a new terminal window.';
    await appStore.refreshStatus();
    showToast('llama.cpp launched.');
  } catch (error) {
    launchLog.value = `Launch error: ${(error as Error).message}`;
    showToast((error as Error).message, 'error');
  } finally {
    launching.value = false;
  }
}

async function stopLlama() {
  stopping.value = true;
  try {
    const result = await store.stop();
    launchLog.value = result.note || 'Stopped.';
    await appStore.refreshStatus();
    showToast('llama.cpp stopped.');
  } catch (error) {
    showToast((error as Error).message, 'error');
  } finally {
    stopping.value = false;
  }
}

async function runCleanup(deleteAll = false) {
  if (deleteAll && !confirm('Delete ALL request logs? This cannot be undone.')) return;
  cleanupLoading.value = true;
  try {
    const result = await store.cleanup(cleanupDays.value, deleteAll);
    showToast(`Deleted ${result.deleted} records.`);
  } catch (error) {
    showToast((error as Error).message, 'error');
  } finally {
    cleanupLoading.value = false;
  }
}

async function runVacuum() {
  try {
    await store.vacuum();
    showToast('Database vacuumed.');
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}

async function runReset() {
  if (!confirm('Reset ALL settings and logs? This cannot be undone.')) return;
  try {
    await store.reset();
    await store.fetchSettings();
    await appStore.refreshStatus();
    hydrateForms();
    showToast('System reset complete.');
  } catch (error) {
    showToast((error as Error).message, 'error');
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <div>
        <h1>Control Center</h1>
        <p class="text-secondary page-subtitle">Runtime orchestration, launch tuning, and gateway maintenance.</p>
      </div>
    </div>

    <Transition name="page">
      <div v-if="toast" :class="['toast', `toast-${toastType}`]">{{ toast }}</div>
    </Transition>

    <section class="settings-hero card-elevated">
      <div class="hero-copy">
        <div class="hero-badges">
          <span :class="['hero-pill', appStore.llamaStatus === 'ok' ? 'hero-pill--ok' : 'hero-pill--danger']">
            {{ appStore.llamaStatus === 'ok' ? 'llama.cpp online' : 'llama.cpp offline' }}
          </span>
          <span :class="['hero-pill', appStore.launchReady ? 'hero-pill--ok' : 'hero-pill--warn']">
            {{ appStore.launchReady ? 'launch ready' : 'launch needs attention' }}
          </span>
        </div>

        <h2>llama.cpp Runtime</h2>
        <p class="hero-description">
          The gateway now reads its launch surface from a shared runtime schema, so the UI and backend stay in sync.
          Use this page to shape the command line, launch in a dedicated terminal, and inspect readiness before you start serving traffic.
        </p>

        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-label">Active Model</span>
            <span class="hero-stat-value mono">{{ appStore.activeModel || 'No model selected' }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">llama Route</span>
            <span class="hero-stat-value mono">{{ connectionForm.llama_host }}:{{ connectionForm.llama_port }}</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">Gateway</span>
            <span class="hero-stat-value mono">0.0.0.0:{{ connectionForm.gateway_port }}</span>
          </div>
        </div>

        <div v-if="appStore.launchIssues.length" class="issue-panel">
          <div class="issue-title">Launch blockers</div>
          <ul class="issue-list">
            <li v-for="issue in appStore.launchIssues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
        <div v-else class="ready-panel">
          Launch configuration is complete. The current settings are ready to start in a dedicated terminal window.
        </div>

        <div v-if="appStore.launchCommandPreview" class="command-preview mono">
          {{ appStore.launchCommandPreview }}
        </div>
      </div>

      <div class="hero-actions">
        <button class="btn btn-ghost" :disabled="store.saving" @click="saveConnectionSettings()">
          {{ store.saving ? 'Saving…' : 'Save Connection' }}
        </button>
        <button class="btn btn-ghost" :disabled="store.saving" @click="saveRuntimeSettings()">
          {{ store.saving ? 'Saving…' : 'Save Runtime' }}
        </button>
        <button class="btn btn-danger-ghost" :disabled="stopping" @click="stopLlama">
          {{ stopping ? 'Stopping…' : 'Stop llama.cpp' }}
        </button>
        <button class="btn btn-primary" :disabled="launching" @click="launchLlama">
          {{ launching ? 'Launching…' : 'Launch llama.cpp' }}
        </button>
        <div v-if="launchLog" class="launch-log">{{ launchLog }}</div>
      </div>
    </section>

    <section class="card settings-section">
      <div class="section-header">
        <div>
          <h3 class="section-title">Connection</h3>
          <p class="section-description">These values control where the gateway forwards llama traffic and how the UI labels the route.</p>
        </div>
      </div>
      <div class="field-grid field-grid--compact">
        <div class="field-card">
          <label class="form-label">llama.cpp Host</label>
          <input v-model="connectionForm.llama_host" class="input" placeholder="127.0.0.1" />
          <p class="field-hint">Read dynamically by the proxy and status checks.</p>
        </div>
        <div class="field-card">
          <label class="form-label">llama.cpp Port</label>
          <input v-model="connectionForm.llama_port" class="input" type="number" placeholder="8080" />
          <p class="field-hint">The target server port for proxied requests.</p>
        </div>
        <div class="field-card">
          <label class="form-label">Gateway Port</label>
          <input v-model="connectionForm.gateway_port" class="input" type="number" placeholder="11435" />
          <p class="field-hint">Stored for visibility; restart the gateway process to apply.</p>
        </div>
        <div class="field-card">
          <label class="form-label">Retention</label>
          <select v-model="connectionForm.log_retention_days" class="input">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
          <p class="field-hint">Controls automatic pruning of stored request analytics.</p>
        </div>
      </div>
    </section>

    <section v-for="section in schemaSections" :key="section.key" class="card settings-section">
      <div class="section-header">
        <div>
          <h3 class="section-title">{{ section.label }}</h3>
          <p class="section-description">{{ section.description }}</p>
        </div>
      </div>

      <div class="field-grid" :class="{ 'field-grid--wide': section.key === 'advanced' }">
        <div
          v-for="field in fieldsForSection(section.key)"
          :key="field.key"
          class="field-card"
          :class="{ 'field-card--wide': field.input === 'textarea' }"
        >
          <div class="field-head">
            <label class="form-label">{{ field.label }}</label>
            <span v-if="field.flag" class="flag-chip">{{ field.flag }}</span>
          </div>

          <template v-if="field.input === 'boolean'">
            <label class="toggle-row">
              <input
                type="checkbox"
                :checked="readBooleanField(field)"
                @change="writeField(field, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ field.description }}</span>
            </label>
          </template>

          <template v-else-if="field.input === 'select'">
            <select
              class="input"
              :value="readStringField(field)"
              @change="writeField(field, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <p v-if="field.description" class="field-hint">{{ field.description }}</p>
          </template>

          <template v-else-if="field.input === 'textarea'">
            <textarea
              class="input textarea-mono"
              rows="4"
              :value="readStringField(field)"
              :placeholder="field.placeholder"
              @input="writeField(field, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <p v-if="field.description" class="field-hint">{{ field.description }}</p>
          </template>

          <template v-else>
            <input
              class="input"
              :type="field.input === 'number' ? 'number' : 'text'"
              :step="field.input === 'number' ? 'any' : undefined"
              :value="readStringField(field)"
              :placeholder="field.placeholder"
              @input="writeField(field, ($event.target as HTMLInputElement).value)"
            />
            <p v-if="field.description" class="field-hint">{{ field.description }}</p>
          </template>
        </div>
      </div>
    </section>

    <section class="settings-footer-grid">
      <div class="card settings-section">
        <div class="section-header">
          <div>
            <h3 class="section-title">Manual Cleanup</h3>
            <p class="section-description">Trim historical request analytics without touching runtime configuration.</p>
          </div>
        </div>
        <div class="cleanup-row">
          <div class="field-card cleanup-card">
            <label class="form-label">Delete older than</label>
            <select v-model="cleanupDays" class="input">
              <option :value="7">7 days</option>
              <option :value="30">30 days</option>
              <option :value="60">60 days</option>
              <option :value="90">90 days</option>
            </select>
          </div>
          <button class="btn btn-ghost" :disabled="cleanupLoading" @click="runCleanup(false)">
            {{ cleanupLoading ? 'Running…' : 'Clean Old Logs' }}
          </button>
          <button class="btn btn-danger" :disabled="cleanupLoading" @click="runCleanup(true)">
            Delete All Logs
          </button>
        </div>
      </div>

      <div class="card settings-section">
        <div class="section-header">
          <div>
            <h3 class="section-title">Database & Reset</h3>
            <p class="section-description">Maintenance operations for the local SQLite store.</p>
          </div>
        </div>
        <div class="action-stack">
          <button class="btn btn-ghost" @click="runVacuum">Vacuum Database</button>
          <button class="btn btn-danger" @click="runReset">Factory Reset</button>
        </div>
      </div>
    </section>

    <details class="card raw-config-card">
      <summary class="section-title raw-config-summary">Raw Configuration</summary>
      <pre class="settings-dump">{{ JSON.stringify(store.settings, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-subtitle {
  margin-top: 0.35rem;
  font-size: 0.9rem;
}

.settings-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 1.5rem;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.settings-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(61, 126, 255, 0.16), transparent 38%),
    radial-gradient(circle at bottom left, rgba(0, 255, 157, 0.12), transparent 42%);
  pointer-events: none;
  transition: background 0.3s ease;
}

.hero-copy,
.hero-actions {
  position: relative;
  z-index: 1;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hero-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.hero-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.02);
}

.hero-pill--ok {
  color: var(--accent);
  border-color: var(--border-accent);
  background: rgba(0, 255, 157, 0.1);
}

.hero-pill--warn {
  color: var(--warning);
  border-color: rgba(255, 165, 0, 0.3);
  background: rgba(255, 165, 0, 0.08);
}

.hero-pill--danger {
  color: var(--danger);
  border-color: rgba(255, 77, 106, 0.32);
  background: rgba(255, 77, 106, 0.08);
}

.hero-description {
  max-width: 72ch;
  color: var(--text-secondary);
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.8rem;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.8rem 0.9rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(8, 12, 20, 0.7);
}

.hero-stat-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.hero-stat-value {
  color: var(--text-primary);
  font-size: 0.86rem;
}

.issue-panel,
.ready-panel,
.command-preview,
.launch-log {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(8, 12, 20, 0.72);
}

.issue-panel {
  padding: 0.95rem 1rem;
}

.issue-title {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--warning);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.55rem;
}

.issue-list {
  margin: 0;
  padding-left: 1rem;
  color: var(--text-secondary);
}

.issue-list li + li {
  margin-top: 0.35rem;
}

.ready-panel {
  padding: 0.85rem 1rem;
  color: var(--accent);
}

.command-preview,
.launch-log {
  padding: 0.8rem 0.95rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  overflow-x: auto;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  justify-content: flex-start;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.section-title {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}

.section-description {
  margin-top: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.84rem;
  max-width: 76ch;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
}

.field-grid--compact {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.field-grid--wide {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.field-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.95rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0));
}

.field-card--wide {
  grid-column: 1 / -1;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.form-label {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.field-hint {
  color: var(--text-muted);
  font-size: 0.76rem;
  line-height: 1.45;
}

.flag-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: rgba(61, 126, 255, 0.12);
  border: 1px solid rgba(61, 126, 255, 0.24);
  color: var(--accent-2);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.toggle-row input[type='checkbox'] {
  margin-top: 0.15rem;
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}

.textarea-mono {
  min-height: 88px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.settings-footer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}

.cleanup-row {
  display: flex;
  gap: 0.9rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.cleanup-card {
  min-width: 180px;
}

.action-stack {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.raw-config-card {
  margin-bottom: 1rem;
}

.raw-config-summary {
  cursor: pointer;
  user-select: none;
}

.settings-dump {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 1rem;
  padding: 1rem;
  background: var(--bg-base);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow-x: auto;
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* ── Light mode overrides ──────────────────────────────────────────── */
body.light-mode .settings-hero::before {
  background:
    radial-gradient(circle at top right, rgba(45, 106, 79, 0.08), transparent 38%),
    radial-gradient(circle at bottom left, rgba(27, 122, 52, 0.06), transparent 42%);
  opacity: 0.8;
}

body.light-mode .settings-hero {
  box-shadow: var(--shadow-sm);
  border-color: var(--border);
}

body.light-mode .hero-stat {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .ready-panel {
  background: linear-gradient(135deg, rgba(27,122,52,0.08), rgba(45,106,79,0.06));
  border-color: var(--border-accent);
  color: var(--accent);
}

body.light-mode .issue-panel {
  background: rgba(217,64,82,0.04);
  border-color: rgba(217,64,82,0.2);
}

body.light-mode .command-preview,
body.light-mode .launch-log {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-secondary);
}

body.light-mode .field-card {
  background: linear-gradient(180deg, var(--bg-surface), var(--bg-elevated));
  border-color: var(--border);
}

body.light-mode .field-card--wide {
  background: linear-gradient(180deg, var(--bg-surface), var(--bg-elevated));
}

body.light-mode .settings-dump {
  background: var(--bg-elevated);
}

body.light-mode .btn-danger-ghost {
  border-color: rgba(217,64,82,0.3);
}

body.light-mode .btn-danger-ghost:hover:not(:disabled) {
  background: rgba(217,64,82,0.06);
}

body.light-mode .hero-pill {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .hero-pill--ok {
  background: rgba(27,122,52,0.1);
  border-color: rgba(27,122,52,0.3);
  color: #1b7a34;
}

body.light-mode .toast-success {
  background: rgba(27,122,52,0.08);
  border-color: var(--border-accent);
  color: #1b7a34;
}

body.light-mode .raw-config-summary {
  color: var(--accent);
}

body.light-mode .flag-chip {
  background: rgba(45, 106, 79, 0.1);
  border-color: rgba(45, 106, 79, 0.25);
  color: #2d6a4f;
}

.btn-danger-ghost {
  background: transparent;
  border: 1px solid rgba(255, 77, 106, 0.35);
  color: var(--danger);
}

.btn-danger-ghost:hover:not(:disabled) {
  background: rgba(255, 77, 106, 0.08);
  border-color: var(--danger);
}

.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.7rem 1.2rem;
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
}

.toast-success {
  background: var(--accent-muted);
  border: 1px solid var(--border-accent);
  color: var(--accent);
}

.toast-error {
  background: rgba(255, 77, 106, 0.12);
  border: 1px solid rgba(255, 77, 106, 0.3);
  color: var(--danger);
}

@media (max-width: 1080px) {
  .settings-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .hero-stats,
  .field-grid,
  .settings-footer-grid {
    grid-template-columns: 1fr;
  }

  .cleanup-row,
  .action-stack {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
