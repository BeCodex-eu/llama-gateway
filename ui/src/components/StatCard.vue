<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
  loading?: boolean;
}>();
</script>

<template>
  <div class="stat-card" :class="{ 'stat-card--accent': accent, 'stat-card--danger': danger }">
    <div v-if="loading" class="skeleton" style="height: 2.5rem; margin-bottom: 0.4rem;"></div>
    <template v-else>
      <div class="stat-value">{{ value }}</div>
    </template>
    <div class="stat-label">{{ label }}</div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  transition: border-color 0.15s;
}

.stat-card--accent {
  border-color: var(--border-accent);
  background: linear-gradient(135deg, var(--bg-surface) 60%, rgba(0,255,157,0.04));
}

.stat-card--danger {
  border-color: rgba(255,77,106,0.3);
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stat-card--accent .stat-value { color: var(--accent); }
.stat-card--danger .stat-value  { color: var(--danger); }

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-top: 0.4rem;
}

.stat-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
</style>
