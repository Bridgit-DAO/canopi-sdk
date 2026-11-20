import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@canopi-sdk/shared': pkg('shared'),
      '@canopi-sdk/manifest': pkg('manifest'),
      '@canopi-sdk/tab-bridge': pkg('tab-bridge'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'tests/**/*.test.ts', '.claude/skills/*/scripts/**/*.test.ts'],
  },
});
