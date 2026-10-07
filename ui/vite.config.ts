import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Univer includes React packages whose client directive has no effect in this Vue bundle.
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          warning.message.includes('"use client"') &&
          /node_modules\/(?:@radix-ui\/|cmdk\/|sonner\/)/.test(warning.id ?? '')
        ) return;
        defaultHandler(warning);
      },
    },
  },
  server: {
    host: 'localhost',
    port: 4200,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  preview: { host: 'localhost', port: 4200 },
});
