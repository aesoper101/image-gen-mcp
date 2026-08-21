---
'@inferai/image-gen-mcp': patch
---

Replace `devEngines.packageManager` (which made npm refuse to install the package with `EBADDEVENGINES`) with the standard `packageManager` field; keep `devEngines.runtime` for Node version selection. npm/npx consumers can now install and run the server again.
