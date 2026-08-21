import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      syntax: ['node 22'],
      dts: true,
      banner: { js: '#!/usr/bin/env node' },
    },
  ],
});
