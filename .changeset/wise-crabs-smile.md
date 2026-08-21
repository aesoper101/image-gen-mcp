---
'@inferai/image-gen-mcp': patch
---

Fix duplicate shebang in the built bundle (`src/index.ts` shebang + rslib banner both emitted) that made the published package crash on load:

```
SyntaxError: Invalid or unexpected token
```

when installed and run via `npx @inferai/image-gen-mcp`. Removed the redundant banner; the entry shebang is preserved by rslib.
