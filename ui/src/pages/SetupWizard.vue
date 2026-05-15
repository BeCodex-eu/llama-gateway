<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useModelsStore, useSettingsStore, api } from '../stores';

const router = useRouter();
const modelsStore = useModelsStore();
const settingsStore = useSettingsStore();

const step = ref(1);
const TOTAL_STEPS = 5;

// Step 1: models directory
const modelsDir = ref('');
const dirError = ref('');

// Step 2: scan results
const scanning = ref(false);
const foundModels = ref<string[]>([]);
const scanError = ref('');

// Step 3: select default model
const selectedModel = ref('');
const customName = ref('');

// Step 4: connection
const llamaHost = ref('127.0.0.1');
const llamaPort = ref('8080');
const llamaBin = ref('');
const autoLaunch = ref(false);
const launchPathError = ref('');

// Step 5: done
const saving = ref(false);
const launchResult = ref('');

const progress = computed(() => `${(step.value / TOTAL_STEPS) * 100}%`);

onMounted(async () => {
  try {
    const status = await api<{ connection: { host: string; port: number } }>('/status');
    llamaHost.value = status.connection.host;
    llamaPort.value = String(status.connection.port);
  } catch {
    // Keep the local fallback values when the status call is unavailable.
  }
});

async function goStep1() {
  if (!modelsDir.value.trim()) {
    dirError.value = 'Please enter a directory path.';
    return;
  }
  dirError.value = '';
  step.value = 2;
  await runScan();
}

async function runScan() {
  scanning.value = true;
  scanError.value = '';
  foundModels.value = [];
  try {
    const res = await modelsStore.scanDir(modelsDir.value.trim());
    foundModels.value = res.models;
    if (res.models.length > 0) selectedModel.value = res.models[0];
  } catch (e) {
    scanError.value = (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

function modelName(path: string): string {
  const base = path.split(/[/\\]/).pop() || path;
  return base.replace(/\.gguf$/i, '');
}

async function finishSetup() {
  launchPathError.value = '';

  if (autoLaunch.value && !llamaBin.value.trim()) {
    launchPathError.value = 'llama-server Binary Path is required when auto-launch is enabled.';
    return;
  }

  saving.value = true;
  try {
    // 1. Import all found models
    if (foundModels.value.length > 0) {
      await modelsStore.scanImport(modelsDir.value.trim());
    }

    // 2. If a model was manually entered / selected, ensure it's saved
    if (selectedModel.value) {
      const name = customName.value.trim() || modelName(selectedModel.value);
      await modelsStore.addModel(name, selectedModel.value);
      // Set as default
      await modelsStore.fetchModels();
      const model = modelsStore.models.find(m => m.path === selectedModel.value || m.name === name);
      if (model) await modelsStore.activateModel(model.id);
    }

    // 3. Save connection settings + llama binary + mark setup complete
    const settings: Record<string, string> = {
      models_dir: modelsDir.value.trim(),
      llama_host: llamaHost.value.trim(),
      llama_port: llamaPort.value.trim(),
      setup_complete: 'true',
    };
    if (llamaBin.value.trim()) settings.llama_bin = llamaBin.value.trim();
    await settingsStore.saveSettings(settings);

    // 4. Auto-launch llama.cpp if enabled
    if (autoLaunch.value && llamaBin.value.trim()) {
      try {
        const res = await api<{ launched: boolean; pid?: number; command?: string }>('/llama/launch', {
          method: 'POST',
          body: JSON.stringify({
            bin:  llamaBin.value.trim(),
            port: llamaPort.value.trim(),
            host: llamaHost.value.trim(),
          }),
        });
        launchResult.value = res.launched ? `Started (PID ${res.pid})` : 'Launch failed';
      } catch (e) {
        launchResult.value = `Launch error: ${(e as Error).message}`;
      }
    }

    step.value = 5;
  } catch (e) {
    scanError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

function launchDashboard() {
  router.push('/dashboard');
  // Force a page reload so the App re-reads setupComplete
  window.location.href = '/dashboard';
}
</script>

<template>
  <div class="wizard-backdrop">
    <div class="wizard-card">
      <!-- Header -->
      <div class="wizard-header">
        <div class="wizard-logo">
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="rgba(0,255,157,0.1)"/>
            <path d="M6 24 L16 8 L26 24" stroke="#00ff9d" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M10 18 L22 18" stroke="#00ff9d" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="wizard-brand">LLAMA <span style="color:var(--accent)">GATEWAY</span></span>
        </div>
        <div class="step-counter">Step {{ step }} / {{ TOTAL_STEPS }}</div>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress }"></div>
      </div>

      <!-- Steps -->
      <div class="wizard-body">
        <!-- Step 1: Directory -->
        <template v-if="step === 1">
          <h2 class="step-title">Select Models Directory</h2>
          <p class="step-desc">Where are your <code>.gguf</code> model files stored?</p>
          <div class="form-group">
            <label class="form-label">Models Directory Path</label>
            <input
              v-model="modelsDir"
              class="input"
              placeholder="C:\models  or  /home/user/models"
              @keyup.enter="goStep1"
              autofocus
            />
            <div v-if="dirError" class="error-msg">{{ dirError }}</div>
          </div>
          <div class="wizard-actions">
            <button class="btn btn-primary btn-wide" @click="goStep1">Scan Directory →</button>
          </div>
        </template>

        <!-- Step 2: Scan results -->
        <template v-else-if="step === 2">
          <h2 class="step-title">Found Models</h2>
          <div v-if="scanning" class="scan-status">
            <div class="spinner"></div>
            <span>Scanning for .gguf files…</span>
          </div>
          <template v-else>
            <div v-if="scanError" class="error-msg">{{ scanError }}</div>
            <div v-else-if="foundModels.length === 0" class="empty-scan">
              <p class="text-muted">No .gguf files found in <code>{{ modelsDir }}</code></p>
              <p class="text-muted" style="font-size:0.8rem;margin-top:0.4rem">You can add models manually in the next steps.</p>
            </div>
            <ul v-else class="model-list">
              <li
                v-for="p in foundModels" :key="p"
                :class="['model-list-item', { selected: selectedModel === p }]"
                @click="selectedModel = p"
              >
                <span class="model-check">{{ selectedModel === p ? '●' : '○' }}</span>
                <div>
                  <div class="model-item-name">{{ modelName(p) }}</div>
                  <div class="model-item-path">{{ p }}</div>
                </div>
              </li>
            </ul>
          </template>
          <div class="wizard-actions">
            <button class="btn btn-ghost" @click="step = 1">← Back</button>
            <button class="btn btn-primary btn-wide" :disabled="scanning" @click="step = 3">
              Continue →
            </button>
          </div>
        </template>

        <!-- Step 3: Default model -->
        <template v-else-if="step === 3">
          <h2 class="step-title">Choose Default Model</h2>
          <p class="step-desc">Select or confirm the model to use by default.</p>
          <div class="form-group">
            <label class="form-label">Selected Model Path</label>
            <input v-model="selectedModel" class="input" placeholder="/models/llama3.gguf" />
          </div>
          <div class="form-group" style="margin-top:0.75rem">
            <label class="form-label">Display Name (optional)</label>
            <input v-model="customName" class="input" :placeholder="selectedModel ? modelName(selectedModel) : 'my-model'" />
          </div>
          <div class="wizard-actions">
            <button class="btn btn-ghost" @click="step = 2">← Back</button>
            <button class="btn btn-primary btn-wide" @click="step = 4">Continue →</button>
          </div>
        </template>

        <!-- Step 4: llama.cpp connection -->
        <template v-else-if="step === 4">
          <h2 class="step-title">llama.cpp Connection</h2>
          <p class="step-desc">Where is your llama.cpp server running?</p>
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Host</label>
              <input v-model="llamaHost" class="input" placeholder="127.0.0.1" />
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Port</label>
              <input v-model="llamaPort" class="input" type="number" placeholder="8080" />
            </div>
          </div>

          <!-- Auto-launch toggle -->
          <div class="launch-section">
            <label class="toggle-label">
              <input type="checkbox" v-model="autoLaunch" />
              <span>Auto-launch llama.cpp when I click Save</span>
            </label>
            <div v-if="autoLaunch" class="form-group" style="margin-top:0.85rem">
              <label class="form-label">llama-server Binary Path</label>
              <input
                v-model="llamaBin"
                class="input"
                placeholder="C:\llama.cpp\llama-server.exe  —  /usr/local/bin/llama-server"
                required
                autofocus
              />
              <p class="form-hint">Full path to the <code>llama-server</code> (or <code>server</code>) executable.</p>
              <div v-if="launchPathError" class="error-msg">{{ launchPathError }}</div>
            </div>
          </div>

          <div v-if="!autoLaunch" class="llama-hint">
            Start manually: <code>llama-server -m /path/to/model.gguf --port {{ llamaPort }}</code>
          </div>
          <div class="wizard-actions">
            <button class="btn btn-ghost" @click="step = 3">← Back</button>
            <button class="btn btn-primary btn-wide" :disabled="saving" @click="finishSetup">
              {{ saving ? 'Saving…' : (autoLaunch ? 'Save & Launch →' : 'Save & Continue →') }}
            </button>
          </div>
          <div v-if="scanError" class="error-msg" style="margin-top:0.75rem">{{ scanError }}</div>
        </template>

        <!-- Step 5: Done -->
        <template v-else-if="step === 5">
          <div class="done-state">
            <div class="done-icon">✦</div>
            <h2 class="step-title">All Set!</h2>
            <p class="step-desc">
              Llama Gateway is configured. Your requests will be proxied through <code>localhost:11435</code>.
            </p>
            <div class="done-details">
              <div class="done-detail-item">
                <span class="text-muted">llama.cpp</span>
                <span class="mono-cell text-accent">{{ llamaHost }}:{{ llamaPort }}</span>
              </div>
              <div class="done-detail-item">
                <span class="text-muted">Gateway</span>
                <span class="mono-cell text-accent">0.0.0.0:11435</span>
              </div>
              <div v-if="selectedModel" class="done-detail-item">
                <span class="text-muted">Active Model</span>
                <span class="mono-cell text-accent">{{ modelName(selectedModel) }}</span>
              </div>
              <div v-if="launchResult" class="done-detail-item">
                <span class="text-muted">llama-server</span>
                <span :class="['mono-cell', launchResult.startsWith('Launch error') ? 'text-error' : 'text-accent']">{{ launchResult }}</span>
              </div>
            </div>
            <button class="btn btn-primary btn-wide" style="margin-top:2rem" @click="launchDashboard">
              Open Dashboard →
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-backdrop {
  min-height: 100vh;
  width: 100%;
  background: var(--bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background-image: radial-gradient(ellipse at 20% 50%, rgba(0,255,157,0.04) 0%, transparent 60%),
                    radial-gradient(ellipse at 80% 20%, rgba(61,126,255,0.04) 0%, transparent 60%);
}

.wizard-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  box-shadow: var(--shadow-lg), 0 0 0 1px rgba(0,255,157,0.05);
}

.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem 1rem;
}

.wizard-logo {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.wizard-brand {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
}

.step-counter {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  background: var(--bg-base);
  border: 1px solid var(--border);
  padding: 0.25rem 0.65rem;
  border-radius: 99px;
}

.progress-bar {
  height: 2px;
  background: var(--bg-overlay);
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
  transition: width 0.4s ease;
}

.wizard-body {
  padding: 2rem;
  min-height: 320px;
  display: flex;
  flex-direction: column;
}

.step-title {
  font-size: 1.4rem;
  margin-bottom: 0.5rem;
}

.step-desc {
  color: var(--text-secondary);
  font-size: 0.88rem;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
.form-row { display: flex; gap: 1rem; }
.form-label { font-size: 0.72rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.error-msg { color: var(--danger); font-size: 0.8rem; font-family: var(--font-mono); }

.wizard-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 2rem;
}
.btn-wide { flex: 1; justify-content: center; }

.scan-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  flex: 1;
}

.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-scan { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 0.25rem; }

.model-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  flex: 1;
}

.model-list-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.12s;
}
.model-list-item:hover { background: var(--bg-elevated); }
.model-list-item.selected {
  background: var(--accent-muted);
  border-color: var(--border-accent);
}
.model-check { color: var(--accent); font-size: 0.85rem; flex-shrink: 0; }
.model-item-name { font-weight: 600; font-size: 0.88rem; }
.model-item-path { font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); margin-top: 0.1rem; }

.llama-hint {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.llama-hint code { color: var(--accent); }

/* Auto-launch section */
.launch-section {
  margin-top: 1.25rem;
  padding: 1rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-secondary);
  user-select: none;
}
.toggle-label input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
  cursor: pointer;
}
.form-hint {
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.form-hint code { color: var(--accent); font-size: 0.78rem; }
.text-error { color: #ff5f5f; }

/* Done state */
.done-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1rem 0;
}
.done-icon {
  font-size: 3rem;
  color: var(--accent);
  margin-bottom: 1rem;
  text-shadow: 0 0 24px var(--accent-glow);
  animation: glow 2s ease-in-out infinite alternate;
}
@keyframes glow {
  from { text-shadow: 0 0 12px rgba(0,255,157,0.3); }
  to   { text-shadow: 0 0 28px rgba(0,255,157,0.7); }
}
.done-details {
  margin-top: 1.5rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.done-detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.82rem;
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* ── Light mode overrides ──────────────────────────────────────────── */
body.light-mode .wizard-card {
  box-shadow: var(--shadow-lg), 0 0 0 1px rgba(27,122,52,0.05);
  background: var(--bg-surface);
  border-color: var(--border);
}

body.light-mode .step-counter {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-secondary);
}

body.light-mode .step-dot {
  color: var(--text-muted);
}

body.light-mode .step-dot-active {
  color: var(--accent);
  text-shadow: 0 0 10px var(--accent-glow);
}

body.light-mode .wizard-section {
  border-color: var(--border);
}

body.light-mode .model-list-item {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--text-primary);
}

body.light-mode .model-list-item:hover {
  background: var(--bg-elevated);
}

body.light-mode .model-list-item.selected {
  background: linear-gradient(135deg, rgba(27,122,52,0.06), rgba(45,106,79,0.06));
  border-color: var(--border-accent);
}

body.light-mode .model-check {
  color: var(--accent);
}

body.light-mode .input {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--text-primary);
  color-scheme: light;
}

body.light-mode .input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(27,122,52,0.08);
}

body.light-mode .form-hint {
  color: var(--text-muted);
}

body.light-mode .form-hint code {
  color: var(--accent);
}

body.light-mode .llama-hint {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-muted);
}

body.light-mode .llama-hint strong {
  color: var(--accent);
}

body.light-mode .launch-section {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .launch-log {
  background: var(--bg-base);
  border-color: var(--border);
  color: var(--text-secondary);
}

body.light-mode .done-state .done-icon {
  color: var(--accent);
  text-shadow: 0 0 20px var(--accent-glow);
}

body.light-mode .done-detail-item {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .text-error {
  color: #d94052;
}

@keyframes glow {
  from { text-shadow: 0 0 12px rgba(27,122,52,0.2); }
  to   { text-shadow: 0 0 28px rgba(27,122,52,0.5); }
}
</style>
