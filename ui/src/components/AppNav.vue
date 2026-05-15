<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores';
import { ref, watch } from 'vue';

const route = useRoute();
const appStore = useAppStore();

const lightMode = ref(false);

// Initialize from localStorage
if (localStorage.getItem('llama-theme') === 'light') {
  lightMode.value = true;
  document.body.classList.add('light-mode');
}

function toggleTheme() {
  document.body.classList.add('theme-transitioning');
  lightMode.value = !lightMode.value;
  if (lightMode.value) {
    document.body.classList.add('light-mode');
    localStorage.setItem('llama-theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('llama-theme', 'dark');
  }
  window.dispatchEvent(new Event('theme-changed'));
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 350);
}

const navItems = [
  { path: '/dashboard', icon: '▣', label: 'Dashboard'  },
  { path: '/models',    icon: '◈', label: 'Models'     },
  { path: '/logs',      icon: '≡', label: 'Logs'       },
  { path: '/settings',  icon: '⚙', label: 'Settings'   },
];
</script>

<template>
  <nav class="sidebar">
    <!-- Logo -->
    <div class="sidebar-logo">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" class="logo-svg">
        <rect width="32" height="32" rx="6" fill="rgba(0,255,157,0.1)"/>
        <path d="M6 24 L16 8 L26 24" stroke="#00ff9d" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M10 18 L22 18" stroke="#00ff9d" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="logo-text">LLAMA<span class="logo-accent">GW</span></span>
    </div>

    <!-- Status bar -->
    <div class="sidebar-status">
      <span :class="['status-dot', appStore.llamaStatus === 'ok' ? 'online' : 'offline']"></span>
      <span class="status-label">
        {{ appStore.llamaStatus === 'ok' ? 'llama.cpp online' : 'llama.cpp offline' }}
      </span>
    </div>

    <div class="sidebar-meta">
      <div class="meta-row">
        <span class="meta-label">Route</span>
        <span class="meta-value mono">{{ appStore.connection.host }}:{{ appStore.connection.port }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Launch</span>
        <span :class="['meta-value', appStore.launchReady ? 'text-accent' : 'text-warning']">
          {{ appStore.launchReady ? 'Ready' : 'Needs setup' }}
        </span>
      </div>
    </div>

    <!-- Active model pill -->
    <div v-if="appStore.activeModel" class="active-model-pill">
      <span class="pill-icon">◈</span>
      <span class="pill-text">{{ appStore.activeModel }}</span>
    </div>

    <!-- Nav links -->
    <ul class="nav-list">
      <li v-for="item in navItems" :key="item.path">
        <RouterLink :to="item.path" class="nav-link" :class="{ active: route.path.startsWith(item.path) }">
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>

    <!-- Bottom: setup link -->
    <div class="sidebar-bottom">
      <RouterLink to="/setup" class="nav-link nav-link-sm">
        <span class="nav-icon">✦</span>
        <span class="nav-label">Setup</span>
      </RouterLink>
    </div>

    <!-- Theme toggle -->
    <button class="theme-toggle" @click="toggleTheme" :title="lightMode ? 'Switch to dark mode' : 'Switch to light mode'">
      <span class="theme-toggle-icon">
        <span class="sun">☀</span>
        <span class="moon">☽</span>
      </span>
      <span class="theme-toggle-label">{{ lightMode ? 'Light' : 'Dark' }}</span>
    </button>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 210px;
  min-height: 100vh;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
  gap: 0.5rem;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0.5rem 1.25rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
}

.logo-text {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
}

.logo-accent { color: var(--accent); }

.logo-svg {
  transition: filter 0.3s ease;
}
body.light-mode .logo-svg {
  filter: brightness(0.6) saturate(1.5);
}

.sidebar-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 0.25rem;
}

.status-label {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.sidebar-meta {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0));
  margin-bottom: 0.75rem;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.meta-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.meta-value {
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.active-model-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  background: var(--accent-muted);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius);
  margin-bottom: 0.75rem;
  overflow: hidden;
  transition: background 0.3s ease, border-color 0.3s ease;
}

body.light-mode .active-model-pill {
  background: linear-gradient(135deg, rgba(27,122,52,0.06), rgba(45,106,79,0.06));
  border-color: rgba(27,122,52,0.2);
}

.pill-icon { color: var(--accent); font-size: 0.8rem; flex-shrink: 0; }
.pill-text {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-muted);
  font-size: 0.88rem;
  font-weight: 500;
  transition: all 0.12s ease;
  letter-spacing: 0.01em;
}

.nav-link:hover {
  background: var(--bg-overlay);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--border-accent);
}

.nav-icon {
  font-size: 0.95rem;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label { font-family: var(--font-sans); }

.sidebar-bottom {
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
  margin-top: auto;
}

.nav-link-sm {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.4rem 0.65rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: transparent;
  transition: all 0.2s ease;
  user-select: none;
  flex-shrink: 0;
  width: 100%;
  justify-content: center;
}
.theme-toggle:hover {
  background: var(--bg-overlay);
  border-color: var(--border-accent);
}
.theme-toggle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  position: relative;
}
.theme-toggle-icon .sun,
.theme-toggle-icon .moon {
  position: absolute;
  font-size: 13px;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.theme-toggle-icon .sun {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}
.theme-toggle-icon .moon {
  opacity: 1;
  transform: rotate(0) scale(1);
}
.theme-toggle-icon .moon {
  color: var(--accent);
}
body.light-mode .theme-toggle-icon .sun {
  opacity: 1;
  transform: rotate(0) scale(1);
}
body.light-mode .theme-toggle-icon .moon {
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}
.theme-toggle-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  transition: color 0.2s;
}
body.light-mode .theme-toggle-label {
  color: var(--text-secondary);
}

/* ── Light mode sidebar ────────────────────────────────────────────── */
body.light-mode .sidebar {
  background: var(--bg-surface);
  border-right-color: var(--border);
}

body.light-mode .logo-text {
  color: var(--text-primary);
}

body.light-mode .nav-link .nav-label {
  color: var(--text-secondary);
}

body.light-mode .nav-link.active .nav-label {
  color: var(--accent);
}

body.light-mode .sidebar-status {
  border-top-color: var(--border);
  color: var(--text-muted);
}

body.light-mode .sidebar-status .status-dot {
  box-shadow: 0 0 6px var(--accent-glow);
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    min-height: unset;
    height: auto;
    flex-direction: row;
    padding: 0.75rem 1rem;
    align-items: center;
    border-right: none;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .sidebar-logo { padding-bottom: 0; border-bottom: none; margin-bottom: 0; }
  .sidebar-status, .sidebar-meta, .active-model-pill { display: none; }
  .nav-list { flex-direction: row; flex: unset; }
  .sidebar-bottom { border-top: none; padding-top: 0; margin-top: 0; }
}
</style>
