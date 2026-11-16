import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';
const demo = (file: string) => fileURLToPath(new URL(`./demo/${file}`, import.meta.url));

export default defineConfig(({ mode }) => (mode === 'demo'
  ? {
    plugins: [react()],
    define: { 'process.env': '{}' },
    build: { outDir: 'dist-demo' },
    resolve: {
      alias: [
        { find: /^\.\/(db|llm|hub|nodes|offices)\.js$/, replacement: demo('$1.ts') },
        { find: /^\.{1,2}\/transport$/, replacement: demo('transport.ts') },
        { find: 'node:crypto', replacement: demo('crypto.ts') },
      ],
    },
  }
  : {
    plugins: [react()],
    server: {
      proxy: {
        '/api': backend,
        '/o': { target: backend, ws: true },
      },
    },
  }));
