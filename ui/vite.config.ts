import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

function manualChunkName(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (
    normalizedId.includes('/vue-echarts/')
  ) {
    return 'charts-view';
  }

  if (normalizedId.includes('/zrender/')) {
    return 'charts-runtime';
  }

  if (normalizedId.includes('/echarts/')) {
    return 'charts-core';
  }

  if (normalizedId.includes('/vue/') || normalizedId.includes('/@vue/')) {
    return 'vue-core';
  }

  if (
    normalizedId.includes('/vue-router/') ||
    normalizedId.includes('/pinia/') ||
    normalizedId.includes('/@vueuse/')
  ) {
    return 'app-vendor';
  }

  return 'vendor';
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:11435',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: manualChunkName,
      },
    },
  },
});
