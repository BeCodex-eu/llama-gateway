# Changelog

## v1.0.0 — 2026-05-15

### Added

- Fastify proxy with transparent passthrough for OpenAI-compatible (`/v1/*`) and native llama.cpp routes
- Vue 3 dashboard with Dashboard, Models, Logs, Settings, and Quick Start pages
- Guided setup wizard for first-time configuration
- Schema-driven settings system for `llama-server` launch flags
- SQLite-backed analytics (request history, token counters, model usage, latency trends)
- Model catalog with scan, import, activate, and delete workflows
- Launch, stop, and health-check controls for `llama-server`
- Platform launcher scripts (Windows CMD, PowerShell, Linux/macOS bash)
- Production mode serving the built UI directly from the gateway
- Graceful shutdown and first-run browser open
