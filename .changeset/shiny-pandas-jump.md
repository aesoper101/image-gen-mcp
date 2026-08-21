---
'@inferai/image-gen-mcp': minor
---

Remove `IMAGE_MCP_PROVIDERS` / `--providers`: providers are now auto-discovered from configured API keys only — a provider is enabled iff `IMAGE_MCP_<ID>_API_KEY` (or `--<id>-api-key`) is set, no provider list to maintain. Default priority is the registry order (overridable per provider with `IMAGE_MCP_<ID>_PRIORITY`).

README: configuration examples are now stdio MCP client setups (Claude Code / Claude Desktop) with separate Windows and Linux/macOS snippets.
