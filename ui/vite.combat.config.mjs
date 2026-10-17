import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  build: {
    outDir: fileURLToPath(new URL('../assets/ui', import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/combat-main.js', import.meta.url)),
      name: 'CombatLoadoutBundle',
      formats: ['iife'],
      fileName: () => 'combat-loadout.js',
    },
    target: 'es2022',
  },
});
