# Llama Gateway

Llama Gateway is a local-first control plane for llama.cpp that unifies API access, model management, and usage analytics behind a single transparent proxy.

## Why this project exists

Running llama.cpp locally usually means stitching together several moving parts by hand:

- the `llama-server` process itself
- a stable API endpoint for clients
- model selection and launch flags
- visibility into latency, token usage, and request history

Llama Gateway combines those concerns into one local stack:

- a Fastify proxy that forwards requests to llama.cpp with minimal overhead
- a Vue dashboard for setup, model management, logs, and runtime settings
- a schema-driven settings system for `llama-server` launch flags
- a quick-start page for launching llama.cpp without opening the full dashboard
- SQLite-backed analytics and local configuration storage

## Highlights

- Transparent streaming proxy for `/v1/*` and native llama.cpp routes
- Local analytics with request history, token counters, model usage, and latency trends
- Guided setup wizard for first-time configuration
- Quick-start page for launching llama.cpp only when it is not already running
- Settings UI that maps directly to structured `llama-server` launch options
- Model catalog with scan, import, activate, and delete workflows
- Windows, PowerShell, and Linux launcher scripts for starting UI + proxy together
- Support for either an already running llama.cpp instance or gateway-managed local launch

## How it works

```text
Client / SDK / Tooling
        |
        |  OpenAI-compatible: http://localhost:11435/v1
        |  Native llama.cpp:  http://localhost:11435
        v
Llama Gateway (Fastify)
        |
        |-- passthrough proxy to llama.cpp
        |-- launch/status/model/settings services
        |-- SQLite analytics + local settings
        v
llama.cpp / llama-server
```

The UI can run in two ways:

- development mode on `http://localhost:5173` with `/api` proxied to the gateway
- production mode served by the gateway itself on `http://localhost:11435`

## Runtime modes

Llama Gateway supports two operating models:

### 1. Proxy an existing llama.cpp server

Point the gateway at an already running `llama-server` instance by setting the host and port in the UI.

### 2. Launch llama.cpp from the gateway

Configure `llama_bin`, select an active model, set launch flags in the Settings page, then launch `llama-server` from:

- the Quick Start page
- the Setup Wizard
- the Settings control center

On Windows, the gateway opens llama.cpp in a visible terminal window that stays open for logs even if the process exits immediately.

## Quick start

### Prerequisites

- Node.js 18+
- npm
- a `.gguf` model file
- a `llama-server` binary if you want the gateway to launch llama.cpp for you

### Recommended local development flow

Install dependencies once:

```bash
cd proxy
npm install

cd ../ui
npm install
```

Run the launcher for your platform from the repository root:

```bash
# Windows CMD
start.bat

# Windows PowerShell
./start.ps1

# Linux
chmod +x ./start.sh
./start.sh
```

What these scripts do:

- start the proxy on `http://localhost:11435`
- start the Vite UI on `http://localhost:5173`
- avoid launching duplicate processes if those ports are already active
- stream service output into the terminal you started from
- keep the launcher attached so you can read output and stop the services with `Ctrl+C`
- open `http://localhost:5173/quick-start`

### First-run flow

1. Open the setup wizard if the gateway is not configured yet.
2. Scan or add your `.gguf` models.
3. Select an active model.
4. Set `llama-server` binary and connection settings.
5. Launch llama.cpp from Quick Start or the Settings page.

### Production-style local run

If you want the gateway to serve the built UI directly:

```bash
cd proxy
npm install
npm run build

cd ../ui
npm install
npm run build

cd ../proxy
node dist/server.js
```

Open:

- `http://localhost:11435` for the full app
- `http://localhost:11435/quick-start` for the focused launch page

## Client usage

### OpenAI-compatible clients

Use the gateway with `/v1` as the base URL.

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11435/v1",
    api_key="not-needed",
)

response = client.chat.completions.create(
    model="my-local-model",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
)

for chunk in response:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)
```

### Native llama.cpp endpoints

Use the gateway root URL without `/v1` when calling llama.cpp-native routes such as `/completion`, `/tokenize`, `/embedding`, or `/health`.

## Features in more detail

### UI surface

- `Quick Start` for lightweight status + launch
- `Setup` for first-run onboarding
- `Dashboard` for analytics and runtime health
- `Models` for scan/import/default model management
- `Logs` for request history inspection
- `Settings` for connection details, launch flags, maintenance, and reset actions

### Runtime controls

The settings system is schema-driven and currently covers these categories:

- runtime identity
- performance tuning
- cache and memory behavior
- server behavior
- reasoning and speculative decoding
- sampling defaults
- advanced passthrough arguments

This allows the UI and backend to stay aligned when building `llama-server` launch arguments.

### Analytics design

The proxy logs requests after response completion so analytics do not block the request path. The implementation is designed around:

- no stream buffering for proxy behavior
- no response mutation
- asynchronous request logging
- metadata-based usage extraction where possible

## API surface

### Gateway management API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Gateway status, llama health, launch readiness, connection info, active model, and command preview |
| `GET` | `/api/models` | List saved models |
| `POST` | `/api/models` | Add or update a model |
| `DELETE` | `/api/models/:id` | Remove a saved model |
| `POST` | `/api/models/:id/activate` | Mark a model as the active/default model |
| `GET` | `/api/models/scan?dir=...` | Scan a directory for `.gguf` files |
| `POST` | `/api/models/scan-import` | Scan and import all discovered models |
| `GET` | `/api/analytics/overview` | Aggregate request counters and averages |
| `GET` | `/api/analytics/tokens-per-day` | Daily token chart data |
| `GET` | `/api/analytics/model-usage` | Per-model usage breakdown |
| `GET` | `/api/analytics/requests-per-hour` | Hourly request distribution |
| `GET` | `/api/analytics/status-stats` | Daily success/error counts |
| `GET` | `/api/analytics/latency` | Latency trend data |
| `GET` | `/api/analytics/requests` | Paginated request log rows |
| `GET` | `/api/settings` | Fetch persisted settings |
| `GET` | `/api/settings/schema` | Fetch the UI/runtime settings schema |
| `PUT` | `/api/settings` | Update persisted settings |
| `POST` | `/api/settings/cleanup` | Delete old or all request logs |
| `POST` | `/api/settings/vacuum` | Run SQLite `VACUUM` |
| `POST` | `/api/settings/reset` | Reset stored settings and logs |
| `GET` | `/api/llama/preview` | Preview the `llama-server` launch command without executing |
| `POST` | `/api/llama/launch` | Launch `llama-server` using saved settings |
| `POST` | `/api/llama/stop` | Stop the tracked local `llama-server` process |

### Forwarded llama.cpp routes

The gateway forwards:

- any `/v1/*` OpenAI-compatible route
- `/completion`
- `/tokenize`
- `/detokenize`
- `/embedding`
- `/health`
- `/props`
- `/slots`
- `/metrics`
- `/infill`
- `/lora-adapters`
- `/rerank`

## Configuration

### Gateway bootstrap environment variables

These control the gateway process itself and are read at startup:

| Variable | Default | Description |
|---|---|---|
| `GATEWAY_PORT` | `11435` | Port the gateway listens on |
| `GATEWAY_HOST` | `0.0.0.0` | Bind host |
| `LLAMA_HOST` | `127.0.0.1` | Default llama.cpp host fallback |
| `LLAMA_PORT` | `8080` | Default llama.cpp port fallback |
| `DB_PATH` | `./data/gateway.db` | SQLite database path |
| `UI_DIST` | `../ui/dist` | Built UI directory served by the gateway |
| `OPEN_BROWSER` | `true` | Open the browser automatically on first run |
| `LOG_LEVEL` | `info` | Fastify/Pino log level |

### Runtime settings stored by the app

Most runtime behavior is stored in SQLite and managed from the UI, including:

- `llama_bin`
- active model selection
- launch host and port
- performance flags such as context size, GPU layers, threads, batching, and parallelism
- server flags such as metrics, slots, timeout, API prefix, and priority
- sampling and reasoning-related flags
- extra passthrough arguments

## Development

### Manual development commands

```bash
# proxy with hot reload
cd proxy
npm run dev:watch

# UI dev server
cd ../ui
npm run dev
```

The Vite UI runs on `http://localhost:5173` and proxies `/api` requests to the gateway on `http://localhost:11435`.

### Build commands

```bash
cd proxy
npm run build

cd ../ui
npm run build
```

## Troubleshooting

### Quick Start says launch is blocked

Check the blockers list on the Quick Start or Settings page. The most common causes are:

- `llama_bin` is not configured or does not resolve on your machine
- no active model is selected
- the selected model file no longer exists at the saved path

### The gateway starts but llama.cpp does not

Use the Quick Start or Settings page launch action. On Windows, the gateway opens a terminal window that stays open so you can read the actual `llama-server` error output.

### The UI does not open automatically from a launcher script

Open the quick-start page manually:

- development: `http://localhost:5173/quick-start`
- production: `http://localhost:11435/quick-start`

## Project structure

```text
.
├── proxy/
│   ├── src/
│   │   ├── config.ts
│   │   ├── server.ts
│   │   ├── db/
│   │   │   ├── database.ts
│   │   │   └── queries.ts
│   │   ├── lib/
│   │   │   └── llama-settings.ts
│   │   ├── routes/
│   │   │   ├── analytics.ts
│   │   │   ├── models.ts
│   │   │   ├── proxy.ts
│   │   │   └── settings.ts
│   │   └── services/
│   │       ├── llama-process.ts
│   │       ├── llama-status.ts
│   │       ├── llama-upstream.ts
│   │       ├── logger.ts
│   │       ├── models.ts
│   │       └── runtime-config.ts
│   └── package.json
├── ui/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── DashboardPage.vue
│   │   │   ├── LogsPage.vue
│   │   │   ├── ModelsPage.vue
│   │   │   ├── QuickStartPage.vue
│   │   │   ├── SettingsPage.vue
│   │   │   └── SetupWizard.vue
│   │   ├── router/
│   │   ├── stores/
│   │   └── lib/
│   └── package.json
├── start.bat
├── start.ps1
├── start.sh
└── README.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and contribution guidelines.

## License

[MIT](LICENSE)
