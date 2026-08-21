---
'@inferai/image-gen-mcp': patch
---

Fix the published package being unusable (`npx @inferai/image-gen-mcp` failed to start, MCP clients reported `-32000`):

- Removed `devEngines.packageManager` (with `onFail: download`): npm refuses to install packages requiring pnpm with `EBADDEVENGINES`, so `npx`/`npm` consumers could never run the server. Replaced with the standard `packageManager: "pnpm@11.21.0"` field, which pins the version for CI/corepack without blocking npm installs.
- The CI `pack` job produced tarballs missing `dist/` (gitignored output was filtered by the unpinned pnpm version in `pnpm/setup`): the `packageManager` pin makes CI use pnpm 11.21.0, whose pack includes `dist/`.
