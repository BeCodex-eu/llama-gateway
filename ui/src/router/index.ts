import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/quick-start',
      component: () => import('../pages/QuickStartPage.vue'),
      meta: { title: 'Quick Start', chromeless: true, allowWithoutSetup: true },
    },
    {
      path: '/dashboard',
      component: () => import('../pages/DashboardPage.vue'),
      meta: { title: 'Dashboard' },
    },
    {
      path: '/models',
      component: () => import('../pages/ModelsPage.vue'),
      meta: { title: 'Models' },
    },
    {
      path: '/logs',
      component: () => import('../pages/LogsPage.vue'),
      meta: { title: 'Request Logs' },
    },
    {
      path: '/settings',
      component: () => import('../pages/SettingsPage.vue'),
      meta: { title: 'Settings' },
    },
    {
      path: '/setup',
      component: () => import('../pages/SetupWizard.vue'),
      meta: { title: 'Setup' },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} — Llama Gateway` : 'Llama Gateway';
});

export { router };
