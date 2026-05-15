<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, computed, watch } from 'vue';
import StatCard from '../components/StatCard.vue';
import { useAnalyticsStore, useAppStore } from '../stores';

const analytics = useAnalyticsStore();
const appStore   = useAppStore();
const VChart = defineAsyncComponent(() => import('../lib/echarts').then((m) => m.VChart));

// ── Period filter ─────────────────────────────────────────────────────────────
const PRESETS = [{ label: '1d', days: 1 }, { label: '7d', days: 7 }, { label: '30d', days: 30 }];
const activePreset = ref<number | null>(30);
const customFrom   = ref('');
const customTo     = ref('');
const customError  = ref('');

function today() { return new Date().toISOString().slice(0, 16); }
function selectPreset(days: number) {
  activePreset.value = days;
  customFrom.value = customTo.value = customError.value = '';
}
function applyCustomRange() {
  if (!customFrom.value || !customTo.value) { customError.value = 'Select both start and end.'; return; }
  if (new Date(customFrom.value) > new Date(customTo.value)) { customError.value = 'Start must be before end.'; return; }
  customError.value = '';
  activePreset.value = null;
  triggerFetch();
}
function triggerFetch() {
  if (activePreset.value !== null) {
    analytics.fetchCharts(activePreset.value);
  } else {
    analytics.fetchCharts(30, new Date(customFrom.value).toISOString(), new Date(customTo.value).toISOString());
  }
}

// ── Widget visibility ─────────────────────────────────────────────────────────
const WIDGETS = [
  { key: 'runtime',     label: 'Runtime Status'    },
  { key: 'stats',       label: 'Stat Cards'         },
  { key: 'pricing',     label: 'Pricing Calculator' },
  { key: 'tokens',      label: 'Token Usage'        },
  { key: 'modelDist',   label: 'Model Distribution' },
  { key: 'reqPerHour',  label: 'Requests per Hour'  },
  { key: 'errorRate',   label: 'Error Rate'         },
  { key: 'latency',     label: 'Latency Trend'      },
  { key: 'tokenEff',    label: 'Token Efficiency'   },
  { key: 'costChart',   label: 'Cost Over Time'     },
  { key: 'costByModel', label: 'Cost per Model'     },
  { key: 'modelTable',  label: 'Model Breakdown'    },
] as const;
type WK = typeof WIDGETS[number]['key'];
const WIDGET_STORAGE = 'llama-dashboard-widgets';
function loadVis(): Record<WK, boolean> {
  const def: Record<WK, boolean> = { runtime:true, stats:true, pricing:true, tokens:true, modelDist:true, reqPerHour:true, errorRate:true, latency:true, tokenEff:true, costChart:true, costByModel:true, modelTable:true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(WIDGET_STORAGE) || '{}') }; } catch { return def; }
}
const vis = ref<Record<WK, boolean>>(loadVis());
watch(vis, v => localStorage.setItem(WIDGET_STORAGE, JSON.stringify(v)), { deep: true });
const customizing = ref(false);
function toggleAll(on: boolean) { (Object.keys(vis.value) as WK[]).forEach(k => vis.value[k] = on); }

// ── Pricing calculator ────────────────────────────────────────────────────────
const PRICE_STORAGE = 'llama-dashboard-pricing';
function loadPricing() { try { return JSON.parse(localStorage.getItem(PRICE_STORAGE) || '{}'); } catch { return {}; } }
const savedP   = loadPricing();
const priceIn  = ref<number>(savedP.priceIn  ?? 0);
const priceOut = ref<number>(savedP.priceOut ?? 0);
watch([priceIn, priceOut], () => localStorage.setItem(PRICE_STORAGE, JSON.stringify({ priceIn: priceIn.value, priceOut: priceOut.value })));

const totalCostPeriod = computed(() => {
  const ti = analytics.tokensPerDay.reduce((s, d) => s + d.input_tokens, 0);
  const to = analytics.tokensPerDay.reduce((s, d) => s + d.output_tokens, 0);
  return (ti / 1_000_000) * priceIn.value + (to / 1_000_000) * priceOut.value;
});
const totalInputCost  = computed(() => (analytics.tokensPerDay.reduce((s, d) => s + d.input_tokens, 0) / 1_000_000) * priceIn.value);
const totalOutputCost = computed(() => (analytics.tokensPerDay.reduce((s, d) => s + d.output_tokens, 0) / 1_000_000) * priceOut.value);

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtNum(n: number) { return n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n); }
function fmtMs(ms: number) { return ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${Math.round(ms)}ms`; }
function fmtUSD(v: number) { return v === 0 ? '$0.0000' : v < 0.0001 ? `$${v.toFixed(8)}` : `$${v.toFixed(4)}`; }

function isDarkMode(): boolean {
  return !document.body.classList.contains('light-mode');
}

function getChartTheme() {
  const dark = {
    bg: '#1a2235',
    border: '#2a3550',
    text: '#e2e8f6',
    axis: '#4a5568',
    split: '#111827',
    bgAxis: '#1e2d45',
  };
  const light = {
    bg: '#f4faf4',
    border: '#b8d4be',
    text: '#1a2e1f',
    axis: '#7d9b84',
    split: '#d4e6d6',
    bgAxis: '#dcecdf',
  };
  return isDarkMode() ? dark : light;
}

const PALETTE = ['#00ff9d','#3d7eff','#ff4d6a','#ffa500','#a78bfa','#22d3ee'];
const PALETTE_LIGHT = ['#1b7a34','#2d6a4f','#d94052','#c4840e','#7c3aed','#0891b2'];

function TT() {
  const t = getChartTheme();
  return { backgroundColor: t.bg, borderColor: t.border, textStyle: { color: t.text } };
}
function AX() {
  const t = getChartTheme();
  return { color: t.axis, fontSize: 10, fontFamily: 'Space Mono' };
}
function SPLIT() {
  const t = getChartTheme();
  return { lineStyle: { color: t.split, type: 'dashed' as const } };
}

// ── Chart: Token usage ────────────────────────────────────────────────────────
const tokenChartOpt = computed(() => {
  const palette = isDarkMode() ? PALETTE : PALETTE_LIGHT;
  return {
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...TT() },
  legend: { data: ['Input', 'Output'], textStyle: { color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 11 }, top: 8 },
  grid: { left: 48, right: 20, top: 44, bottom: 36 },
  xAxis: { type: 'category', data: analytics.tokensPerDay.map(d => d.date.slice(5)), axisLine: { lineStyle: { color: getChartTheme().bgAxis } }, axisLabel: AX(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: { ...AX(), formatter: (v: number) => fmtNum(v) } },
  series: [
    { name: 'Input',  type: 'bar', stack: 't', data: analytics.tokensPerDay.map(d => d.input_tokens),  itemStyle: { color: isDarkMode() ? '#3d7eff' : '#2d6a4f', borderRadius: [0,0,0,0] } },
    { name: 'Output', type: 'bar', stack: 't', data: analytics.tokensPerDay.map(d => d.output_tokens), itemStyle: { color: isDarkMode() ? '#00ff9d' : '#1b7a34', borderRadius: [3,3,0,0] } },
  ],
};
});

// ── Chart: Model distribution ─────────────────────────────────────────────────
const modelPieOpt = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', ...TT() },
  legend: { orient: 'vertical', right: 10, top: 'middle', textStyle: { color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 11 } },
  series: [{ type: 'pie', radius: ['48%','72%'], center: ['38%','50%'],
    data: analytics.modelUsage.map((m, i) => ({ name: m.model, value: m.requests, itemStyle: { color: (isDarkMode() ? PALETTE : PALETTE_LIGHT)[i % (isDarkMode() ? PALETTE : PALETTE_LIGHT).length] } })),
    label: { show: false }, emphasis: { label: { show: false }, itemStyle: { shadowBlur: 8 } },
  }],
}));

// ── Chart: Requests per hour ──────────────────────────────────────────────────
const reqPerHourOpt = computed(() => {
  const hrs    = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const counts = hrs.map(h => analytics.reqsPerHour.find(d => d.hour === h)?.requests ?? 0);
  const max    = Math.max(...counts, 1);
  const theme  = getChartTheme();
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...TT() },
    grid: { left: 40, right: 16, top: 16, bottom: 36 },
    xAxis: { type: 'category', data: hrs.map(h => `${h}h`), axisLine: { lineStyle: { color: theme.bgAxis } }, axisLabel: { ...AX(), interval: 2 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: AX() },
    series: [{ type: 'bar',
      data: counts.map((v, i) => ({ value: v, itemStyle: { color: `rgba(27,${Math.round(122 + 84*(counts[i]/max))},52,${isDarkMode() ? (0.35 + 0.65*(counts[i]/max)) : (0.3 + 0.7*(counts[i]/max))})`, borderRadius: [3,3,0,0] } })),
    }],
  };
});

// ── Chart: Error rate ─────────────────────────────────────────────────────────
const errorRateOpt = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...TT() },
  legend: { data: ['Success', 'Errors'], textStyle: { color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 11 }, top: 8 },
  grid: { left: 48, right: 20, top: 44, bottom: 36 },
  xAxis: { type: 'category', data: analytics.statusStats.map(d => d.date.slice(5)), axisLine: { lineStyle: { color: getChartTheme().bgAxis } }, axisLabel: AX(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: AX() },
  series: [
    { name: 'Success', type: 'bar', stack: 's', data: analytics.statusStats.map(d => d.success), itemStyle: { color: isDarkMode() ? '#00ff9d' : '#1b7a34', borderRadius: [0,0,0,0] } },
    { name: 'Errors',  type: 'bar', stack: 's', data: analytics.statusStats.map(d => d.errors),  itemStyle: { color: '#d94052', borderRadius: [3,3,0,0] } },
  ],
}));

// ── Chart: Latency trend ──────────────────────────────────────────────────────
const latencyChartOpt = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...TT() },
  legend: { data: ['Avg', 'Max'], textStyle: { color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 11 }, top: 8 },
  grid: { left: 56, right: 20, top: 44, bottom: 36 },
  xAxis: { type: 'category', data: analytics.latencyTrend.map(d => d.date.slice(5)), axisLine: { lineStyle: { color: getChartTheme().bgAxis } }, axisLabel: AX(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: { ...AX(), formatter: (v: number) => fmtMs(v) } },
  series: [
    { name: 'Avg', type: 'line', smooth: true, data: analytics.latencyTrend.map(d => Math.round(d.avg_latency_ms)), lineStyle: { color: isDarkMode() ? '#00ff9d' : '#1b7a34', width: 2.5 }, itemStyle: { color: isDarkMode() ? '#00ff9d' : '#1b7a34' }, areaStyle: { color: isDarkMode() ? 'rgba(0,255,157,0.06)' : 'rgba(27,122,52,0.06)' }, symbol: 'circle', symbolSize: 5 },
    { name: 'Max', type: 'line', smooth: true, data: analytics.latencyTrend.map(d => Math.round(d.max_latency_ms)), lineStyle: { color: '#d94052', width: 1.5, type: 'dashed' as const }, itemStyle: { color: '#d94052' }, symbol: 'none' },
  ],
}));

// ── Chart: Token efficiency ───────────────────────────────────────────────────
const tokenEffOpt = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...TT() },
  grid: { left: 48, right: 20, top: 24, bottom: 36 },
  xAxis: { type: 'category', data: analytics.tokensPerDay.map(d => d.date.slice(5)), axisLine: { lineStyle: { color: getChartTheme().bgAxis } }, axisLabel: AX(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: AX() },
  series: [{ type: 'line', smooth: true,
    data: analytics.tokensPerDay.map(d => d.input_tokens > 0 ? +(d.output_tokens / d.input_tokens).toFixed(2) : 0),
    lineStyle: { color: isDarkMode() ? '#a78bfa' : '#7c3aed', width: 2.5 }, itemStyle: { color: isDarkMode() ? '#a78bfa' : '#7c3aed' }, areaStyle: { color: isDarkMode() ? 'rgba(167,139,250,0.07)' : 'rgba(124,58,237,0.06)' }, symbol: 'circle', symbolSize: 5,
  }],
}));

// ── Chart: Cost over time ─────────────────────────────────────────────────────
const costChartOpt = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...TT() },
  grid: { left: 80, right: 20, top: 24, bottom: 36 },
  xAxis: { type: 'category', data: analytics.tokensPerDay.map(d => d.date.slice(5)), axisLine: { lineStyle: { color: getChartTheme().bgAxis } }, axisLabel: AX(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: { ...AX(), formatter: (v: number) => `$${v.toFixed(4)}` } },
  series: [{ type: 'bar',
    data: analytics.tokensPerDay.map(d => +((d.input_tokens / 1_000_000) * priceIn.value + (d.output_tokens / 1_000_000) * priceOut.value).toFixed(6)),
    itemStyle: { color: isDarkMode() ? '#ffa500' : '#c4840e', borderRadius: [3,3,0,0] },
  }],
}));

// ── Chart: Cost per model ─────────────────────────────────────────────────────
const costByModelOpt = computed(() => {
  const palette = isDarkMode() ? PALETTE : PALETTE_LIGHT;
  return {
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' as const }, ...TT() },
  grid: { left: 16, right: 80, top: 16, bottom: 16, containLabel: true },
  xAxis: { type: 'value', axisLine: { show: false }, splitLine: SPLIT(), axisLabel: { ...AX(), formatter: (v: number) => `$${v.toFixed(4)}` } },
  yAxis: { type: 'category', data: analytics.modelUsage.map(m => m.model), axisLine: { show: false }, axisLabel: { color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 11 }, axisTick: { show: false } },
  series: [{ type: 'bar',
    data: analytics.modelUsage.map((m, i) => ({ value: +((m.input_tokens / 1_000_000) * priceIn.value + (m.output_tokens / 1_000_000) * priceOut.value).toFixed(6), itemStyle: { color: palette[i % palette.length], borderRadius: [0,3,3,0] } })),
    label: { show: true, position: 'right', color: isDarkMode() ? '#8896b3' : '#4a6b52', fontSize: 10, fontFamily: 'Space Mono', formatter: (p: { value: number }) => `$${p.value.toFixed(4)}` },
  }],
};
});

// ── Theme change: force chart re-renders ────────────────────────────────────
const chartKey = ref(0);

function onThemeChange() {
  chartKey.value++;
}

onMounted(() => {
  window.addEventListener('theme-changed', onThemeChange);
});

onUnmounted(() => {
  window.removeEventListener('theme-changed', onThemeChange);
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let overviewTimer: ReturnType<typeof setInterval> | null = null;
let chartsTimer:   ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await Promise.all([analytics.fetchOverview(), appStore.refreshStatus(), triggerFetch()]);

  // Refresh stat cards + llama status every 2 s (lightweight single-query calls)
  overviewTimer = setInterval(() => {
    analytics.fetchOverview();
    appStore.refreshStatus();
  }, 2_000);

  // Refresh chart data every  15s (five parallel queries — no need to hammer them)
  chartsTimer = setInterval(() => {
    triggerFetch();
  }, 15_000);
});

onUnmounted(() => {
  if (overviewTimer) clearInterval(overviewTimer);
  if (chartsTimer)   clearInterval(chartsTimer);
});

watch(activePreset, v => { if (v !== null) triggerFetch(); });
</script>
<template>
  <div class="dashboard">

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="text-secondary" style="margin-top:0.25rem;font-size:0.85rem;">Usage analytics · Real-time overview</p>
      </div>
      <div class="header-right">
        <div class="filter-row">
          <span class="filter-label">Period</span>
          <div class="period-pills">
            <button v-for="p in PRESETS" :key="p.days" :class="['pill', activePreset===p.days?'pill--active':'']" @click="selectPreset(p.days)">{{ p.label }}</button>
            <button :class="['pill', activePreset===null?'pill--active':'']" @click="activePreset=null">Custom</button>
          </div>
          <transition name="range-slide">
            <div v-if="activePreset===null" class="date-range">
              <input v-model="customFrom" type="datetime-local" class="date-input" :max="customTo||today()" />
              <span class="range-sep">→</span>
              <input v-model="customTo" type="datetime-local" class="date-input" :min="customFrom" :max="today()" />
              <button class="btn btn-primary btn-sm" @click="applyCustomRange">Apply</button>
              <span v-if="customError" class="range-error">{{ customError }}</span>
            </div>
          </transition>
        </div>
        <button :class="['btn btn-ghost btn-sm', customizing?'btn-active':'']" @click="customizing=!customizing">⚙ Customize</button>
      </div>
    </div>

    <!-- ── Customize panel ─────────────────────────────────────────────────── -->
    <transition name="fade">
      <div v-if="customizing" class="customize-panel card">
        <div class="customize-header">
          <span class="customize-title">Visible widgets</span>
          <div style="display:flex;gap:0.4rem">
            <button class="btn btn-ghost btn-xs" @click="toggleAll(true)">Show all</button>
            <button class="btn btn-ghost btn-xs" @click="toggleAll(false)">Hide all</button>
          </div>
        </div>
        <div class="widget-grid">
          <label v-for="w in WIDGETS" :key="w.key" class="widget-toggle">
            <input type="checkbox" v-model="vis[w.key]" class="widget-cb" />
            <span class="widget-label">{{ w.label }}</span>
          </label>
        </div>
      </div>
    </transition>

    <!-- ── Runtime strip ───────────────────────────────────────────────────── -->
    <div v-if="vis.runtime" class="runtime-strip">
      <div class="runtime-card runtime-card--accent">
        <div class="runtime-card-label">Runtime</div>
        <div class="runtime-card-value">
          <span :class="['status-dot', appStore.llamaStatus==='ok'?'online':'offline']"></span>
          {{ appStore.llamaStatus==='ok' ? 'llama.cpp online' : 'llama.cpp offline' }}
        </div>
        <p class="runtime-card-sub">Gateway forwards to {{ appStore.connection.host }}:{{ appStore.connection.port }}</p>
      </div>
      <div class="runtime-card">
        <div class="runtime-card-label">Launch Readiness</div>
        <div class="runtime-card-value">{{ appStore.launchReady ? 'Ready to launch' : 'Needs attention' }}</div>
        <p class="runtime-card-sub">{{ appStore.launchIssues.length ? appStore.launchIssues[0] : 'Binary path and active model are configured.' }}</p>
      </div>
      <div class="runtime-card">
        <div class="runtime-card-label">Active Model</div>
        <div class="runtime-card-value mono">{{ appStore.activeModel || 'No model selected' }}</div>
        <p class="runtime-card-sub">Switch models on the Models page or relaunch from Control Center.</p>
      </div>
    </div>

    <!-- ── Stat cards ───────────────────────────────────────────────────────── -->
    <div v-if="vis.stats" class="stats-grid">
      <StatCard label="Total Requests"  :value="fmtNum(analytics.overview?.total_requests??0)"      :sub="`${analytics.overview?.requests_today??0} today`" :loading="!analytics.overview" accent />
      <StatCard label="Input Tokens"    :value="fmtNum(analytics.overview?.total_input_tokens??0)"  :loading="!analytics.overview" />
      <StatCard label="Output Tokens"   :value="fmtNum(analytics.overview?.total_output_tokens??0)" :loading="!analytics.overview" />
      <StatCard label="Avg Latency"     :value="fmtMs(analytics.overview?.avg_latency_ms??0)"       :sub="`${fmtNum(analytics.overview?.tokens_today??0)} tokens today`" :loading="!analytics.overview" />
    </div>

    <!-- ── Pricing calculator ───────────────────────────────────────────────── -->
    <div v-if="vis.pricing" class="card pricing-card">
      <div class="chart-header">
        <h3>Pricing Calculator</h3>
        <span class="badge badge-muted">Estimated cost for selected period</span>
      </div>
      <div class="pricing-body">
        <div class="pricing-inputs">
          <div class="pricing-field">
            <label class="pricing-label">Input price <span class="pricing-unit">($ / 1M tokens)</span></label>
            <input v-model.number="priceIn" type="number" min="0" step="0.0001" class="pricing-input" placeholder="0.0000" />
          </div>
          <div class="pricing-field">
            <label class="pricing-label">Output price <span class="pricing-unit">($ / 1M tokens)</span></label>
            <input v-model.number="priceOut" type="number" min="0" step="0.0001" class="pricing-input" placeholder="0.0000" />
          </div>
        </div>
        <div class="pricing-summary">
          <div class="pricing-stat">
            <span class="pricing-stat-label">Period total</span>
            <span class="pricing-stat-value accent">{{ fmtUSD(totalCostPeriod) }}</span>
          </div>
          <div class="pricing-stat">
            <span class="pricing-stat-label">Input cost</span>
            <span class="pricing-stat-value">{{ fmtUSD(totalInputCost) }}</span>
          </div>
          <div class="pricing-stat">
            <span class="pricing-stat-label">Output cost</span>
            <span class="pricing-stat-value">{{ fmtUSD(totalOutputCost) }}</span>
          </div>
          <div class="pricing-stat">
            <span class="pricing-stat-label">Cost / request</span>
            <span class="pricing-stat-value">{{ analytics.overview?.total_requests ? fmtUSD(totalCostPeriod / analytics.overview.total_requests) : '—' }}</span>
          </div>
        </div>
      </div>
      <p v-if="!priceIn && !priceOut" class="pricing-hint">Enter prices above to see cost estimates in the charts below.</p>
    </div>

    <!-- ── Row 1: Token usage + Model distribution ─────────────────────────── -->
    <div v-if="vis.tokens || vis.modelDist" class="charts-row">
      <div v-show="vis.tokens" class="card chart-card chart-card--wide">
        <div class="chart-header"><h3>Token Usage</h3><span class="badge badge-muted">Daily breakdown</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="tokenChartOpt" autoresize />
      </div>
      <div v-show="vis.modelDist" class="card chart-card">
        <div class="chart-header"><h3>Model Distribution</h3><span class="badge badge-muted">By requests</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="modelPieOpt" autoresize />
      </div>
    </div>

    <!-- ── Row 2: Requests per hour + Error rate ───────────────────────────── -->
    <div v-if="vis.reqPerHour || vis.errorRate" class="charts-row charts-row--equal">
      <div v-show="vis.reqPerHour" class="card chart-card">
        <div class="chart-header"><h3>Requests per Hour</h3><span class="badge badge-muted">Activity by hour of day</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="reqPerHourOpt" autoresize />
      </div>
      <div v-show="vis.errorRate" class="card chart-card">
        <div class="chart-header"><h3>Error Rate</h3><span class="badge badge-muted">Success vs errors per day</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="errorRateOpt" autoresize />
      </div>
    </div>

    <!-- ── Row 3: Latency + Token efficiency ───────────────────────────────── -->
    <div v-if="vis.latency || vis.tokenEff" class="charts-row charts-row--equal">
      <div v-show="vis.latency" class="card chart-card">
        <div class="chart-header"><h3>Latency Trend</h3><span class="badge badge-green">ms</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="latencyChartOpt" autoresize />
      </div>
      <div v-show="vis.tokenEff" class="card chart-card">
        <div class="chart-header"><h3>Token Efficiency</h3><span class="badge badge-muted">Output / Input ratio</span></div>
        <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
        <VChart v-else class="echart" :key="chartKey" :option="tokenEffOpt" autoresize />
      </div>
    </div>

    <!-- ── Cost over time ──────────────────────────────────────────────────── -->
    <div v-if="vis.costChart" class="card chart-card">
      <div class="chart-header"><h3>Cost Over Time</h3><span class="badge badge-muted">$ per day · configure prices above</span></div>
      <div v-if="analytics.loading" class="skeleton chart-skeleton"></div>
      <VChart v-else class="echart" :key="chartKey" :option="costChartOpt" autoresize />
    </div>

    <!-- ── Cost per model ──────────────────────────────────────────────────── -->
    <div v-if="vis.costByModel" class="card">
      <div class="chart-header" style="margin-bottom:0.75rem"><h3>Cost per Model</h3><span class="badge badge-muted">Estimated total · configure prices above</span></div>
      <div v-if="analytics.loading" class="skeleton" style="height:140px"></div>
      <VChart v-else class="echart echart--model" :key="chartKey" :option="costByModelOpt" :style="{ height: Math.max(140, analytics.modelUsage.length * 52) + 'px' }" autoresize />
    </div>

    <!-- ── Model breakdown table ───────────────────────────────────────────── -->
    <div v-if="vis.modelTable" class="card">
      <div class="chart-header" style="margin-bottom:1rem"><h3>Model Breakdown</h3></div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Model</th><th>Requests</th><th>Input Tokens</th><th>Output Tokens</th><th>Avg Latency</th><th>Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!analytics.modelUsage.length">
            <td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No data yet</td>
          </tr>
          <tr v-for="m in analytics.modelUsage" :key="m.model">
            <td><span class="mono-cell">{{ m.model }}</span></td>
            <td>{{ fmtNum(m.requests) }}</td>
            <td>{{ fmtNum(m.input_tokens) }}</td>
            <td>{{ fmtNum(m.output_tokens) }}</td>
            <td>{{ fmtMs(m.avg_duration_ms) }}</td>
            <td class="mono-cell">{{ fmtUSD((m.input_tokens/1e6)*priceIn + (m.output_tokens/1e6)*priceOut) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1.5rem; }

/* ── Header ──────────────────────────────────────────────────────────────── */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
.header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.6rem; }

.filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; }
.filter-label { font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.period-pills { display: flex; gap: 0.35rem; }
.pill { padding: 0.3rem 0.75rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-size: 0.78rem; font-family: var(--font-mono); cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s; }
.pill:hover { border-color: var(--accent); color: var(--text-primary); }
.pill--active { border-color: var(--accent); background: rgba(0,255,157,0.1); color: var(--accent); }
.date-range { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.date-input { padding: 0.3rem 0.6rem; border-radius: var(--radius); border: 1px solid var(--border); background: rgba(8,12,20,0.78); color: var(--text-primary); font-size: 0.8rem; font-family: var(--font-mono); outline: none; color-scheme: dark; }
.date-input:focus { border-color: var(--accent); }
.range-sep { color: var(--text-muted); font-size: 0.85rem; }
.range-error { font-size: 0.75rem; color: #ff4d6a; font-family: var(--font-mono); }
.btn-sm { padding: 0.3rem 0.75rem; font-size: 0.8rem; }
.btn-xs { padding: 0.2rem 0.55rem; font-size: 0.72rem; }
.btn-active { border-color: var(--accent); color: var(--accent); }
.range-slide-enter-active, .range-slide-leave-active { transition: opacity 0.2s, transform 0.2s; }
.range-slide-enter-from, .range-slide-leave-to { opacity: 0; transform: translateY(-4px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Customize panel ─────────────────────────────────────────────────────── */
.customize-panel { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 1rem; }
.customize-header { display: flex; align-items: center; justify-content: space-between; }
.customize-title { font-size: 0.8rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.widget-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem 1.2rem; }
.widget-toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.widget-cb { accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; }
.widget-label { font-size: 0.83rem; color: var(--text-secondary); }

/* ── Runtime strip ───────────────────────────────────────────────────────── */
.runtime-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.runtime-card { padding: 1rem 1.1rem; border-radius: var(--radius-lg); border: 1px solid var(--border); background: linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0)); }

/* ── Light mode overrides ─────────────────────────────────────────────────── */
body.light-mode .runtime-card--accent {
  border-color: var(--border-accent);
  background: linear-gradient(135deg, rgba(27,122,52,0.06), rgba(45,106,79,0.04));
}
.runtime-card--accent { border-color: var(--border-accent); background: linear-gradient(135deg, rgba(0,255,157,0.08), rgba(61,126,255,0.06)); }
.runtime-card-label { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.runtime-card-value { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.6rem; font-size: 1rem; font-weight: 600; color: var(--text-primary); }
.runtime-card-sub { margin-top: 0.45rem; color: var(--text-secondary); font-size: 0.8rem; }

/* ── Stat cards ──────────────────────────────────────────────────────────── */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }

/* ── Pricing calculator ──────────────────────────────────────────────────── */
.pricing-card { display: flex; flex-direction: column; gap: 1rem; }
.pricing-body { display: grid; grid-template-columns: auto 1fr; gap: 1.5rem; align-items: start; }
.pricing-inputs { display: flex; gap: 1rem; flex-wrap: wrap; }
.pricing-field { display: flex; flex-direction: column; gap: 0.4rem; }
.pricing-label { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.pricing-unit { text-transform: none; letter-spacing: 0; font-size: 0.65rem; }
.pricing-input { padding: 0.45rem 0.65rem; border-radius: var(--radius); border: 1px solid var(--border); background: rgba(8,12,20,0.78); color: var(--text-primary); font-family: var(--font-mono); font-size: 0.88rem; width: 160px; outline: none; }
.pricing-input:focus { border-color: var(--accent); }
.pricing-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
.pricing-stat { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.7rem 0.85rem; border-radius: var(--radius); border: 1px solid var(--border); background: rgba(8,12,20,0.5); }
.pricing-stat-label { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.pricing-stat-value { font-family: var(--font-mono); font-size: 1rem; font-weight: 600; color: var(--text-primary); }
.pricing-stat-value.accent { color: var(--accent); }
.pricing-hint { font-size: 0.78rem; color: var(--text-muted); font-style: italic; margin: 0; }

body.light-mode .pricing-stat {
  background: var(--bg-elevated);
}

body.light-mode .pricing-card {
  box-shadow: var(--shadow-sm);
}

body.light-mode .customize-panel {
  box-shadow: var(--shadow-sm);
}

body.light-mode .data-table tr:hover td {
  background: var(--bg-hover);
}

body.light-mode .chart-card {
  box-shadow: var(--shadow-sm);
}

/* ── Charts ──────────────────────────────────────────────────────────────── */
.charts-row         { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
.charts-row--equal  { grid-template-columns: 1fr 1fr; }
/* Collapse to 1 column when one of the pair is hidden via v-show */
.charts-row:has(> .chart-card[style*="display"])         { grid-template-columns: 1fr; }
.charts-row--equal:has(> .chart-card[style*="display"])  { grid-template-columns: 1fr; }
.chart-card         { min-height: 320px; min-width: 0; overflow: hidden; }
.chart-card--wide   { min-width: 0; }
.chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.echart       { height: 260px; width: 100%; }
.echart--model { width: 100%; }
.chart-skeleton { height: 260px; }

/* ── Model breakdown table ───────────────────────────────────────────────── */
.data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.data-table th { padding: 0.55rem 0.75rem; text-align: left; font-size: 0.7rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.data-table td { padding: 0.6rem 0.75rem; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.04); }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: rgba(255,255,255,0.02); }
.mono-cell { font-family: var(--font-mono); font-size: 0.82rem; }

@media (max-width: 1100px) {
  .runtime-strip { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-row, .charts-row--equal, .charts-row:has(> .chart-card[style*="display"]), .charts-row--equal:has(> .chart-card[style*="display"]) { grid-template-columns: 1fr; }
  .pricing-body { grid-template-columns: 1fr; }
  .pricing-summary { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .stats-grid { grid-template-columns: 1fr; }
  .pricing-summary { grid-template-columns: 1fr; }
}
</style>