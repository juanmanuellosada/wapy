import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Sin este alias, los *.test.ts que importan módulos vía '@/...' (la misma
// convención que usa toda la app) no resuelven bajo vitest — no hay bundler
// de Next de por medio para aplicar el path mapping de tsconfig.json.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
