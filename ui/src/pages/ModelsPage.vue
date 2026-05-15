<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useModelsStore, useAppStore } from '../stores';

const store = useModelsStore();
const appStore = useAppStore();

const showAddForm = ref(false);
const scanDir = ref('');
const scanning = ref(false);
const scanResults = ref<string[]>([]);
const scanError = ref('');
const newModelName = ref('');
const newModelPath = ref('');
const addError = ref('');

onMounted(() => store.fetchModels());

async function handleScan() {
  if (!scanDir.value.trim()) return;
  scanning.value = true;
  scanError.value = '';
  scanResults.value = [];
  try {
    const res = await store.scanDir(scanDir.value.trim());
    scanResults.value = res.models;
  } catch (e) {
    scanError.value = (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

async function handleScanImport() {
  if (!scanDir.value.trim()) return;
  scanning.value = true;
  scanError.value = '';
  try {
    const res = await store.scanImport(scanDir.value.trim());
    scanResults.value = [];
    scanDir.value = '';
    await store.fetchModels();
    alert(`Imported ${res.imported.length} model(s).`);
  } catch (e) {
    scanError.value = (e as Error).message;
  } finally {
    scanning.value = false;
  }
}

async function handleAdd() {
  addError.value = '';
  if (!newModelName.value.trim() || !newModelPath.value.trim()) {
    addError.value = 'Name and path are required.';
    return;
  }
  try {
    await store.addModel(newModelName.value.trim(), newModelPath.value.trim());
    newModelName.value = '';
    newModelPath.value = '';
    showAddForm.value = false;
  } catch (e) {
    addError.value = (e as Error).message;
  }
}

async function handleActivate(id: number) {
  await store.activateModel(id);
  await appStore.refreshStatus();
}

async function handleDelete(id: number, name: string) {
  if (!confirm(`Delete model "${name}"? This won't delete the file.`)) return;
  await store.removeModel(id);
}

function formatDate(d: string | null): string {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString();
}
</script>

<template>
  <div class="models-page">
    <div class="page-header">
      <div>
        <h1>Models</h1>
        <p class="text-secondary" style="margin-top:0.25rem;font-size:0.85rem;">Manage and switch GGUF models</p>
      </div>
      <button class="btn btn-primary" @click="showAddForm = !showAddForm">
        {{ showAddForm ? '✕ Cancel' : '+ Add Model' }}
      </button>
    </div>

    <!-- Add model form -->
    <Transition name="page">
      <div v-if="showAddForm" class="card add-form">
        <h3 style="margin-bottom:1rem;">Add Model Manually</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Display Name</label>
            <input v-model="newModelName" class="input" placeholder="e.g. llama3-8b-q4" />
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Model Path</label>
            <input v-model="newModelPath" class="input" placeholder="/models/llama3.gguf" />
          </div>
        </div>
        <div v-if="addError" class="error-msg">{{ addError }}</div>
        <div class="form-actions">
          <button class="btn btn-primary" :disabled="store.loading" @click="handleAdd">
            {{ store.loading ? 'Saving…' : 'Save Model' }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Scanner -->
    <div class="card">
      <h3 style="margin-bottom:1rem;">Auto-Scan Directory</h3>
      <div class="scan-row">
        <input v-model="scanDir" class="input" placeholder="/path/to/models" @keyup.enter="handleScan" />
        <button class="btn btn-ghost" :disabled="scanning" @click="handleScan">
          {{ scanning ? '⟳ Scanning…' : '⌕ Scan' }}
        </button>
        <button class="btn btn-primary" :disabled="scanning || !scanDir" @click="handleScanImport">
          ↓ Import All
        </button>
      </div>
      <div v-if="scanError" class="error-msg mt-2">{{ scanError }}</div>
      <div v-if="scanResults.length" class="scan-results">
        <div v-for="p in scanResults" :key="p" class="scan-result-item">
          <span class="mono-cell text-accent">◈</span>
          <span class="mono-cell">{{ p }}</span>
        </div>
      </div>
      <p v-else-if="!scanning" class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">
        Enter a directory path to find .gguf model files
      </p>
    </div>

    <!-- Models list -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border)">
        <h3>Saved Models <span class="badge badge-muted" style="margin-left:0.5rem">{{ store.models.length }}</span></h3>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Path</th>
            <th>Last Used</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!store.models.length">
            <td colspan="5" style="text-align:center;color:var(--text-muted);padding:2.5rem">
              No models yet. Add one above or run a scan.
            </td>
          </tr>
          <tr v-for="m in store.models" :key="m.id">
            <td>
              <div class="model-name-cell">
                <span class="mono-cell">{{ m.name }}</span>
                <span v-if="m.is_default" class="badge badge-green" style="margin-left:0.4rem">Active</span>
              </div>
            </td>
            <td class="path-cell mono-cell">{{ m.path }}</td>
            <td>{{ formatDate(m.last_used) }}</td>
            <td>
              <span v-if="m.is_default" class="badge badge-green">Default</span>
              <span v-else class="badge badge-muted">Standby</span>
            </td>
            <td>
              <div class="action-row">
                <button
                  v-if="!m.is_default"
                  class="btn btn-ghost"
                  style="font-size:0.7rem"
                  @click="handleActivate(m.id)"
                >Set Active</button>
                <button
                  class="btn btn-danger"
                  style="font-size:0.7rem;padding:0.3rem 0.6rem"
                  @click="handleDelete(m.id, m.name)"
                >✕</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.models-page { display: flex; flex-direction: column; gap: 1.5rem; }

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.form-group { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 180px; }
.form-label { font-size: 0.72rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.form-actions { margin-top: 1rem; }

.error-msg { color: var(--danger); font-size: 0.82rem; margin-top: 0.4rem; font-family: var(--font-mono); }

.scan-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.scan-row .input { flex: 1; min-width: 200px; }

.scan-results { margin-top: 1rem; display: flex; flex-direction: column; gap: 4px; }
.scan-result-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.75rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.78rem;
}

.model-name-cell { display: flex; align-items: center; }
.path-cell { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.73rem; color: var(--text-muted); }
.action-row { display: flex; gap: 0.4rem; }

/* ── Light mode ──────────────────────────────────────────────────────────── */
body.light-mode .models-page .card {
  box-shadow: var(--shadow-sm);
}

body.light-mode .scan-result-item {
  background: var(--bg-elevated);
  border-color: var(--border);
}
</style>
