import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['web-ifc', 'web-ifc-three']
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', 'web-ifc-three'],
            'web-ifc': ['web-ifc'],
            xlsx: ['xlsx'],
            vendor: ['react', 'react-dom', 'react-hot-toast', 'lucide-react', 'motion'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
