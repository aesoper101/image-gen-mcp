import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRslibConfig(),
  coverage: {
    provider: 'v8',
    thresholds: {
      lines: 80,
      functions: 80,
      statements: 80,
      branches: 70,
    },
  },
});
