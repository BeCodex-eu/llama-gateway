# Contributing to Llama Gateway

Thank you for your interest in contributing. This document covers how to get
the project running locally and the conventions used in the codebase.

## Project layout

```
proxy/   Node.js / Fastify backend (TypeScript)
ui/      Vue 3 frontend (TypeScript + Vite)
start.*  Platform launchers (Windows CMD, PowerShell, Linux/macOS bash)
```

## Prerequisites

- Node.js 18 or later
- npm
- A `llama-server` binary and a `.gguf` model file if you want to test
  end-to-end LLM proxying

## Local development setup

Install dependencies once:

```bash
cd proxy && npm install
cd ../ui  && npm install
```

Run both services with the launcher for your platform from the repository root:

```bash
# Windows CMD
start.bat

# Windows PowerShell
./start.ps1

# Linux / macOS
chmod +x ./start.sh
./start.sh
```

Or start each service manually in separate terminals:

```bash
# proxy with hot reload
cd proxy
npm run dev:watch

# Vite UI dev server
cd ui
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` requests
to the gateway on `http://localhost:11435`.

## Building for production

```bash
cd proxy && npm run build
cd ../ui  && npm run build
cd ../proxy && node dist/server.js
```

The gateway then serves the built UI from `http://localhost:11435`.

## Codebase conventions

| Area | Convention |
|---|---|
| Backend | Fastify plugins, one file per route group, `better-sqlite3` for all DB access |
| Settings | Schema-driven: add new flags in `proxy/src/lib/llama-settings.ts` |
| Analytics | All writes go through `logRequestAsync` — never block the response path |
| Proxy | `reply.hijack()` + raw `http.request` — do **not** buffer stream bodies |
| UI | Pinia stores own all API calls; pages only read from stores |
| Styling | Single `assets/style.css`; no CSS framework |

## Making a change

1. Fork the repository and create a feature branch.
2. Make your changes. Keep commits focused; one logical change per commit.
3. Test manually with `npm run dev:watch` (proxy) and `npm run dev` (UI).
4. If you change the settings schema, verify the Settings page still renders
   and the launch command preview reflects the change.
5. Open a pull request with a clear description of what the change does and
   why.

## Reporting bugs

Open a GitHub issue and include:

- your operating system and Node.js version
- the steps to reproduce the problem
- any relevant error output from the terminal

## Feature requests

Open a GitHub issue describing the use case. Pull requests are welcome, but
for significant new features it is worth opening an issue first to discuss
the design.

## License

By contributing you agree that your contributions will be licensed under the
[MIT License](LICENSE).
