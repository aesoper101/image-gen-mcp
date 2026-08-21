import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      syntax: ['node 22'],
      dts: true,
      // shebang comes from src/index.ts:1, preserved by rslib; a banner here would duplicate it
    },
  ],
});
