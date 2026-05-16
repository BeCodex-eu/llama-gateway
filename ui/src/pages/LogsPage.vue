<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useAnalyticsStore, useModelsStore, type RequestRow } from '../stores';

const analytics = useAnalyticsStore();
const modelsStore = useModelsStore();

const filterModel = ref('');
const filterFromDate = ref('');
const filterToDate = ref('');
const page = ref(1);
const pageSize = 50;
const expandedId = ref<number | null>(null);

onMounted(async () => {
  await modelsStore.fetchModels();
  await fetchPage();
});

watch([filterModel, filterFromDate, filterToDate], () => {
  page.value = 1;
  fetchPage();
});

async function fetchPage() {
  await analytics.fetchRequests({
    model: filterModel.value || undefined,
    fromDate: filterFromDate.value || undefined,
    toDate: filterToDate.value || undefined,
    limit: pageSize,
    offset: (page.value - 1) * pageSize,
  });
}

function nextPage() {
  if (page.value * pageSize < analytics.requestsTotal) {
    page.value++;
    fetchPage();
  }
}

function prevPage() {
  if (page.value > 1) {
    page.value--;
    fetchPage();
  }
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString();
}

function statusClass(code: number): string {
  if (code < 300) return 'badge-green';
  if (code < 400) return 'badge-yellow';
  return 'badge-red';
}
</script>

<template>
  <div class="logs-page">
    <div class="page-header">
      <div>
        <h1>Request Logs</h1>
        <p class="text-secondary" style="margin-top:0.25rem;font-size:0.85rem;">
          {{ analytics.requestsTotal.toLocaleString() }} total requests
        </p>
      </div>
    </div>

    <!-- Filters -->
    <div class="card filters-card">
      <div class="filters-row">
        <div class="filter-group">
          <label class="filter-label">Model</label>
          <select v-model="filterModel" class="input">
            <option value="">All models</option>
            <option v-for="m in modelsStore.models" :key="m.id" :value="m.name">{{ m.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">From</label>
          <input v-model="filterFromDate" type="date" class="input" />
        </div>
        <div class="filter-group">
          <label class="filter-label">To</label>
          <input v-model="filterToDate" type="date" class="input" />
        </div>
        <button class="btn btn-ghost" @click="filterModel='';filterFromDate='';filterToDate='';">
          Reset
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden">
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Model</th>
            <th>In</th>
            <th>Out</th>
            <th>Duration</th>
            <th>PP Speed</th>
            <th>Gen Speed</th>
            <th>Status</th>
            <th>Prompt</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="!analytics.requests.length">
            <tr>
              <td colspan="9" style="text-align:center;color:var(--text-muted);padding:3rem">
                No requests logged yet
              </td>
            </tr>
          </template>
          <template v-for="row in analytics.requests" :key="row.id">
            <tr class="log-row" @click="toggleExpand(row.id)">
              <td class="mono-cell" style="white-space:nowrap;font-size:0.75rem">{{ formatTs(row.timestamp) }}</td>
              <td><span class="badge badge-blue mono-cell" style="font-size:0.65rem">{{ row.model }}</span></td>
              <td class="mono-cell">{{ row.input_tokens }}</td>
              <td class="mono-cell">{{ row.output_tokens }}</td>
              <td class="mono-cell">
                <span :class="row.duration_ms > 5000 ? 'text-warning' : ''">
                  {{ row.duration_ms >= 1000 ? `${(row.duration_ms/1000).toFixed(1)}s` : `${row.duration_ms}ms` }}
                </span>
              </td>
              <td class="mono-cell">{{ row.prompt_processing_ms > 0 ? `${(row.input_tokens * 1000 / row.prompt_processing_ms).toFixed(1)} tok/s` : '—' }}</td>
              <td class="mono-cell">{{ row.completion_ms > 0 ? `${(row.output_tokens * 1000 / row.completion_ms).toFixed(1)} tok/s` : '—' }}</td>
              <td><span :class="['badge', statusClass(row.status_code)]">{{ row.status_code }}</span></td>
              <td class="prompt-cell">
                <span class="prompt-preview">{{ row.prompt || '—' }}</span>
              </td>
            </tr>
            <!-- Expanded detail -->
            <tr v-if="expandedId === row.id" class="expanded-row">
              <td colspan="9">
                <div class="expanded-detail">
                  <div class="detail-section">
                    <div class="detail-label">Prompt</div>
                    <pre class="detail-pre">{{ row.prompt || '(empty)' }}</pre>
                  </div>
                  <div class="detail-section">
                    <div class="detail-label">Response Preview</div>
                    <pre class="detail-pre">{{ row.response_preview || '(empty)' }}</pre>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="pagination" v-if="analytics.requestsTotal > pageSize">
        <button class="btn btn-ghost" :disabled="page === 1" @click="prevPage">← Prev</button>
        <span class="page-info">
          {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, analytics.requestsTotal) }}
          of {{ analytics.requestsTotal.toLocaleString() }}
        </span>
        <button class="btn btn-ghost" :disabled="page * pageSize >= analytics.requestsTotal" @click="nextPage">Next →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logs-page { display: flex; flex-direction: column; gap: 1.5rem; }

.page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }

.filters-row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 0.35rem; min-width: 140px; }
.filter-label { font-size: 0.7rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }

.log-row { cursor: pointer; }

.prompt-cell { max-width: 260px; overflow: hidden; }
.prompt-preview {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.78rem;
  color: var(--text-muted);
  max-width: 260px;
}

/* ── Light mode ──────────────────────────────────────────────────────────── */
body.light-mode .logs-page .card {
  box-shadow: var(--shadow-sm);
}

body.light-mode .filters-card {
  box-shadow: var(--shadow-sm);
}

body.light-mode .data-table tr:hover td {
  background: var(--bg-hover);
}

.expanded-row td { padding: 0; background: var(--bg-base) !important; }
.expanded-detail {
  padding: 1rem 1.5rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.detail-section { display: flex; flex-direction: column; gap: 0.4rem; }
.detail-label {
  font-size: 0.68rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.detail-pre {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid var(--border);
}
.page-info { font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono); }
</style>
