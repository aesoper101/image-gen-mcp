---
'@inferai/image-gen-mcp': patch
---

Fix the CI-published tarball missing the build output (`dist/`), which made `npx @inferai/image-gen-mcp` unusable (MCP clients reported `-32000`):

`changesets/action/publish` ignores the pack artifact when a custom `script` input is set and runs that script from a checkout that never contains `dist/` (gitignored, never built there) — so `changeset publish` packed a tarball without the build output. Removed the custom `script` from the publish job so the action publishes the pack job's tarballs via `--from-pack-dir`.
