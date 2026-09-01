import { rm } from 'node:fs/promises';

await Promise.all([
  rm(new URL('../dist', import.meta.url), { recursive: true, force: true }),
  rm(new URL('../node_modules/.vite', import.meta.url), { recursive: true, force: true }),
]);
console.log('Vite build artifacts removed.');
