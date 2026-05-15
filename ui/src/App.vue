<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppNav from './components/AppNav.vue';
import { useAppStore } from './stores';

const appStore = useAppStore();
const router = useRouter();
const route = useRoute();

const showChrome = computed(() => route.meta.chromeless !== true && appStore.setupComplete);
const isFullPage = computed(() => route.meta.chromeless === true || !appStore.setupComplete);

let pollTimer: ReturnType<typeof setInterval>;

function enforceSetupRoute() {
  if (!appStore.setupComplete && route.meta.allowWithoutSetup !== true) {
    router.push('/setup');
  }
}

onMounted(async () => {
  await appStore.refreshStatus();
  enforceSetupRoute();
  // Poll status every 15 seconds
  pollTimer = setInterval(() => appStore.refreshStatus(), 15_000);
});

onUnmounted(() => clearInterval(pollTimer));

watch(() => [route.fullPath, appStore.setupComplete], () => {
  enforceSetupRoute();
});
</script>

<template>
  <div class="app-shell">
    <AppNav v-if="showChrome" />
    <main class="app-main" :class="{ 'full-page': isFullPage }">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  position: relative;
}

.app-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 15% 20%, rgba(0, 255, 157, 0.08), transparent 28%),
    radial-gradient(circle at 85% 10%, rgba(61, 126, 255, 0.1), transparent 26%),
    linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0));
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.3s ease;
}

body.light-mode .app-shell::before {
  background:
    radial-gradient(circle at 15% 20%, rgba(27, 122, 52, 0.06), transparent 30%),
    radial-gradient(circle at 85% 10%, rgba(45, 106, 79, 0.05), transparent 28%),
    linear-gradient(180deg, rgba(27, 122, 52, 0.03), rgba(27, 122, 52, 0));
  opacity: 0.6;
}

.app-main {
  flex: 1;
  padding: 2.25rem 2.5rem 2rem;
  overflow-x: hidden;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.app-main.full-page {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .app-shell { flex-direction: column; }
  .app-main  { padding: 1.25rem; }
}
</style>
