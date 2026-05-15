<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAppStore, useModelsStore, useSettingsStore } from '../stores';

const appStore = useAppStore();
const settingsStore = useSettingsStore();
const modelsStore = useModelsStore();

const launching = ref(false);
const launchMessage = ref('');
const selectedModelPath = ref('');
const editableCommand = ref('');
const commandDirty = ref(false);
const fetchingPreview = ref(false);

let pollTimer: ReturnType<typeof setInterval> | undefined;

const isOnline = computed(() => appStore.llamaStatus === 'ok');
const isGatewayUnavailable = computed(() => appStore.llamaStatus === 'loading' || appStore.llamaStatus === 'unreachable');
const hasLaunchBlockers = computed(() => appStore.launchIssues.length > 0);
const canLaunch = computed(() => appStore.launchReady && !launching.value && !isOnline.value);
const statusDotClass = computed(() => {
  if (isOnline.value) return 'online';
  if (appStore.launchReady) return 'pending';
  return 'offline';
});

const headline = computed(() => {
  if (isOnline.value) return 'llama.cpp is already running';
  if (isGatewayUnavailable.value) return 'Waiting for the gateway';
  if (appStore.launchReady) return 'Ready to start llama.cpp';
  return 'Launch needs setup';
});

const subheadline = computed(() => {
  if (isOnline.value) {
    return 'The gateway can already forward traffic. You can jump straight into the dashboard or keep this page open as a lightweight control surface.';
  }
  if (isGatewayUnavailable.value) {
    return 'The quick-start page is up, but the gateway has not answered yet. Leave this page open for a moment while the proxy starts.';
  }
  if (appStore.launchReady) {
    return 'Your saved binary, model, and connection settings are ready. Start llama.cpp in one click and watch the terminal window for logs.';
  }
  return 'The gateway cannot launch llama.cpp yet. Resolve the blockers below, then come back here to start it.';
});

onMounted(async () => {
  await Promise.all([appStore.refreshStatus(), modelsStore.fetchModels()]);
  editableCommand.value = appStore.launchCommandPreview;
  // pre-select the active model
  const active = modelsStore.models.find(m => m.name === appStore.activeModel);
  if (active) selectedModelPath.value = active.path;
  pollTimer = setInterval(() => appStore.refreshStatus(), 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// When status refreshes, sync command only if user hasn't manually edited it
watch(() => appStore.launchCommandPreview, (val) => {
  if (!commandDirty.value && !selectedModelPath.value) {
    editableCommand.value = val;
  }
});

async function onModelChange() {
  commandDirty.value = false;
  if (!selectedModelPath.value) {
    editableCommand.value = appStore.launchCommandPreview;
    return;
  }
  fetchingPreview.value = true;
  try {
    const res = await settingsStore.previewCommand(selectedModelPath.value);
    editableCommand.value = res.command;
  } catch (e) {
    launchMessage.value = `Preview error: ${(e as Error).message}`;
  } finally {
    fetchingPreview.value = false;
  }
}

async function resetCommand() {
  commandDirty.value = false;
  await onModelChange();
}

async function launchLlama() {
  launching.value = true;
  launchMessage.value = '';
  try {
    const opts = editableCommand.value ? { rawCommand: editableCommand.value } : {};
    const result = await settingsStore.launch(opts);
    launchMessage.value = result.pid
      ? `Launched. Terminal PID ${result.pid}.`
      : 'Launch requested. Check the llama terminal window for logs.';
    await appStore.refreshStatus();
  } catch (error) {
    launchMessage.value = `Launch error: ${(error as Error).message}`;
  } finally {
    launching.value = false;
  }
}

async function refreshStatus() {
  launchMessage.value = '';
  await appStore.refreshStatus();
}
</script>

<template>
  <div class="quick-start-shell">
    <section class="quick-start-hero card-elevated">
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="eyebrow-row">
            <span class="badge badge-blue">Quick Start</span>
            <span class="route-chip mono">{{ appStore.connection.host }}:{{ appStore.connection.port }}</span>
          </div>

          <div class="hero-status">
            <span :class="['status-dot', statusDotClass]"></span>
            <span class="hero-status-label">{{ headline }}</span>
          </div>

          <h1>Start the local runtime without opening the full control center.</h1>
          <p class="hero-text">{{ subheadline }}</p>

          <div class="hero-actions">
            <button class="btn btn-primary" :disabled="!canLaunch" @click="launchLlama">
              {{ launching ? 'Launching…' : isOnline ? 'Already Running' : 'Launch llama.cpp' }}
            </button>
            <button class="btn btn-ghost" @click="refreshStatus">Refresh Status</button>
            <RouterLink v-if="appStore.setupComplete" class="btn btn-ghost" to="/dashboard">Open Dashboard</RouterLink>
            <RouterLink v-else class="btn btn-ghost" to="/setup">Run Setup</RouterLink>
          </div>

      <div v-if="launchMessage" class="launch-message mono">{{ launchMessage }}</div>
        </div>

        <div class="hero-panel">
          <div class="mini-stat">
            <span class="mini-stat-label">Gateway State</span>
            <span class="mini-stat-value">{{ appStore.llamaStatus }}</span>
          </div>
          <div class="mini-stat">
            <span class="mini-stat-label">Active Model</span>
            <span class="mini-stat-value mono">{{ appStore.activeModel || 'None selected' }}</span>
          </div>
          <div class="mini-stat">
            <span class="mini-stat-label">Launch Readiness</span>
            <span class="mini-stat-value">{{ appStore.launchReady ? 'Ready' : 'Blocked' }}</span>
          </div>
        </div>
      </div>
    </section>

    <section>
      <article class="card config-card">
        <div class="section-heading">
          <h2>Launch configuration</h2>
          <span v-if="commandDirty" class="badge badge-yellow">edited</span>
          <span v-else class="badge badge-blue">auto</span>
        </div>

        <div class="config-row">
          <label class="config-label" for="model-select">Model</label>
          <select
            id="model-select"
            v-model="selectedModelPath"
            class="config-select"
            @change="onModelChange"
          >
            <option value="">— use active model —</option>
            <option v-for="m in modelsStore.models" :key="m.id" :value="m.path">
              {{ m.name }}
            </option>
          </select>
        </div>

        <div class="config-row">
          <div class="config-label-row">
            <label class="config-label" for="cmd-textarea">Command</label>
            <button class="btn btn-ghost btn-xs" :disabled="fetchingPreview" @click="resetCommand">
              {{ fetchingPreview ? 'Loading…' : 'Reset' }}
            </button>
          </div>
          <textarea
            id="cmd-textarea"
            v-model="editableCommand"
            class="config-textarea mono"
            rows="3"
            spellcheck="false"
            @input="commandDirty = true"
          />
        </div>
      </article>
    </section>

    <section >
      <article class="card diagnostics-card">
        <div class="section-heading">
          <h2>Launch blockers</h2>
          <span :class="['badge', hasLaunchBlockers ? 'badge-yellow' : 'badge-green']">
            {{ hasLaunchBlockers ? appStore.launchIssues.length : 'clear' }}
          </span>
        </div>

        <ul v-if="hasLaunchBlockers" class="issue-list">
          <li v-for="issue in appStore.launchIssues" :key="issue">{{ issue }}</li>
        </ul>
        <p v-else class="section-copy">No launch blockers detected. If llama.cpp is not online yet, use the launch button above.</p>

        <div class="link-row">
          <RouterLink class="btn btn-ghost" to="/settings">Open Settings</RouterLink>
          <RouterLink class="btn btn-ghost" to="/models">Open Models</RouterLink>
          <RouterLink class="btn btn-ghost" to="/setup">Run Setup</RouterLink>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.quick-start-shell {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: min(1080px, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 2rem 1rem;
}

.quick-start-hero {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow: hidden;
  position: relative;
}

.quick-start-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(0, 255, 157, 0.12), transparent 32%),
    radial-gradient(circle at bottom right, rgba(61, 126, 255, 0.14), transparent 36%);
  pointer-events: none;
}

.hero-grid,
.command-preview {
  position: relative;
  z-index: 1;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.8fr);
  gap: 1rem;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.eyebrow-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.route-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.hero-status {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.hero-status-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.hero-text {
  max-width: 68ch;
  color: var(--text-secondary);
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.hero-panel {
  display: grid;
  gap: 0.75rem;
}

.mini-stat {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.85rem 0.95rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(8, 12, 20, 0.74);
}

.mini-stat-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.mini-stat-value {
  font-size: 0.92rem;
  color: var(--text-primary);
}

.launch-message {
  padding: 0.85rem 0.95rem;
  border-radius: var(--radius);
  background: rgba(8, 12, 20, 0.78);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  overflow-x: auto;
  width: fit-content;
  max-width: 100%;
}

.config-card {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.config-row {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.config-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.config-select {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(8, 12, 20, 0.78);
  color: var(--text-primary);
  font-size: 0.88rem;
  outline: none;
  cursor: pointer;
}

.config-select:focus {
  border-color: var(--accent);
}

.config-textarea {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(8, 12, 20, 0.78);
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.config-textarea:focus {
  border-color: var(--accent);
  color: var(--text-primary);
}

.btn-xs {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
}

.diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.diagnostics-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.section-copy {
  color: var(--text-secondary);
}

.issue-list {
  padding-left: 1rem;
  color: var(--text-secondary);
}

.issue-list li + li {
  margin-top: 0.45rem;
}

.link-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.info-stack {
  display: grid;
  gap: 0.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--border);
}

.info-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.info-key {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.info-value {
  color: var(--text-secondary);
  text-align: right;
}

@media (max-width: 900px) {
  .hero-grid,
  .diagnostics-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .quick-start-shell {
    width: 100%;
    padding: 1.25rem 0.75rem;
  }

  .hero-actions,
  .link-row {
    flex-direction: column;
  }

  .info-row {
    flex-direction: column;
  }

  .info-value {
    text-align: left;
  }
}

/* ── Light mode overrides ──────────────────────────────────────────── */
body.light-mode .quick-start-hero {
  box-shadow: var(--shadow-sm);
  border-color: var(--border);
}

body.light-mode .quick-start-hero::before {
  background:
    radial-gradient(circle at top left, rgba(27,122,52,0.08), transparent 32%),
    radial-gradient(circle at bottom right, rgba(45,106,79,0.06), transparent 36%);
  opacity: 0.7;
}

body.light-mode .mini-stat {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .launch-message {
  background: var(--bg-elevated);
  border-color: var(--border);
}

body.light-mode .config-select {
  background: var(--bg-surface) !important;
  color: var(--text-primary);
  color-scheme: light;
}

body.light-mode .config-textarea {
  background: var(--bg-surface);
  color: var(--text-secondary);
}

body.light-mode .route-chip {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-secondary);
}

body.light-mode .diagnostics-card {
  box-shadow: var(--shadow-sm);
}

body.light-mode .issue-list {
  color: var(--text-secondary);
}

body.light-mode .section-copy {
  color: var(--text-secondary);
}

body.light-mode .info-row {
  border-bottom-color: var(--border);
}
</style>