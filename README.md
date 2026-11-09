# Agents Animated Workspace

A **Hi-Bit Pixel Art** real-time visualizer and multi-account subscription telemetry dashboard for AI coding agents (**Claude Code**, **Codex**, **Grok**, **OpenCode**, **Antigravity**, **Gemini**, **Cursor**, **Devin**, and **Aider**).

Inspired by [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) and D-Pad Studio's **Hi-Bit** aesthetic (*Owlboy*, *Sea of Stars*, *Octopath Traveler*), paired with live agent context & multi-account quota tracking from `herdr` and `herdr-agent-usage`.

---

## ✨ Key Features

- **Hi-Bit Pixel Art Canvas Engine (60 FPS)**:
  - Hue-shifted 5-stop shading ramps (cool shadows, warm highlights), Bayer 2×2 ordered dithering, specular furniture bevels, additive dynamic lighting, and footstep dust particles.
  - **4-Layer Color Palette & Contrast System**: Guarantees high character readability against desaturated, atmospheric architectural floors across all themes.
- **6 Self-Contained Scene Templates** (hot-swappable from the UI or `config.yaml`):
  - 🏢 **Retro Startup HQ (`office`)** — Dual/triple monitors, ultrawides, standing desks, server racks, espresso bar, and lounge.
  - 🤠 **Wild West Saloon & Forge (`cowboys`)** — Horse grooming stalls, blacksmith anvil forges, bounty desks, telegraph machines, assay scales, and campfire corral.
  - 🌆 **Neon Netrunner Deck (`cyberpunk`)** — Neural dive chairs, holographic rigs, cyberdeck arrays, Arasaka mainframes, and synth-ramen neon lounge.
  - ⛩️ **Edo Samurai Dojo (`japanese`)** — Shodo calligraphy tables, katana sword-polishing benches, bonsai tables, bamboo scroll racks, and raked Zen rock garden with koi pond.
  - 🏰 **Arcane Guild Hall (`medieval`)** — Illuminated manuscript desks, bubbling alchemy labs, runic scrying altars, mana obelisks, and outdoor archery practice yard.
  - 🎖️ **Allied Command Bunker (`ww2`)** — Enigma cipher desks, radar oscilloscopes, Morse telegraph stations, Colossus vacuum-tube computers, and sandbagged war room.
- **Live Agent Context Breakdown**:
  - Automatically detects active and idle AI agent sessions, current task descriptions, working directories, and live context window token usage (`%` + token count).
  - Working agents walk to their assigned thematic workstation and animate; idle agents gather in the scene's hangout zone.
- **Multi-Account Subscription Limits (`SUBSCRIPTION LIMITS`)**:
  - Tracks multi-account rate limits, 5-hour/7-day rolling windows, credits, and reset timestamps across Claude (`default`, named accounts), Codex, and OpenCode.
- **Interactive Simulation Mode**:
  - Spawn simulated agents (`+ Sim Agent`), click any character or table row to inspect and toggle `working` ↔ `idle` states, or switch scene templates in real time.

---

## 🏗️ Architecture (Hexagonal / Ports & Adapters)

```text
cmd/server/main.go               # Composition Root
internal/
  config/                        # YAML + Environment Variable Configuration
  core/
    domain/                      # Pure Domain Entities (AgentSession, QuotaAccount, SceneTemplate, WorkspaceSnapshot)
    ports/                       # Inbound & Outbound Interfaces (DataSourcePort, TemplateRepositoryPort, EventPublisherPort)
    services/                    # Core Application Logic (WorkspaceService polling, simulation, template switching)
  adapters/
    inbound/http/                # Gorilla WebSocket Hub + REST API + Static SPA Handler
    outbound/
      sources/local/             # Herdr CLI + Local Session Transcripts (~/.claude, ~/.codex, ~/.local/share/opencode, ~/.gemini)
      sources/remote/            # Remote HTTP Endpoint Polling Adapter
      templates/fs/              # Filesystem YAML Scene Template Loader (./templates/<id>/template.yaml)
web/                             # React 19 + TypeScript + Tailwind CSS v4 + HTML5 Canvas 2D Hi-Bit Pixel Engine
templates/                       # Pluggable YAML Scene Templates (office, cowboys, cyberpunk, japanese, medieval, ww2)
```

---

## 🚀 Quick Start

### 1. Local Build & Run

**Prerequisites:** Go 1.24+ and Node.js 20+.

```bash
# 1. Build the frontend SPA
cd web
npm install
npm run build
cd ..

# 2. Build and run the Go server
go build -o bin/agents-workspace ./cmd/server
./bin/agents-workspace -config config.yaml
```

Open **`http://localhost:8080`** in your browser.

### 2. Docker Build & Run

```bash
# Build the multi-stage container image
docker build -t agents-animated-workspace:latest .

# Run the container on port 8080
docker run --rm -p 8080:8080 \
  -e ACTIVE_TEMPLATE=office \
  agents-animated-workspace:latest
```

---

## ⚙️ Configuration (`config.yaml` & Environment Variables)

All settings are controlled via [`config.yaml`](config.yaml) and can be overridden via environment variables:

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  poll_interval_ms: 2000
  static_dir: "./web/dist"
  auth:
    enabled: false
    token: "YOUR_API_KEY"

source:
  # "local" (Herdr + local session transcripts/quota caches) or "remote" (HTTP endpoint)
  type: "local"
  local:
    herdr_bin: "herdr"
    # Optional path to herdr-agent-usage plugin directory; auto-discovered if empty
    usage_plugin_dir: ""
    quota_ttl_seconds: 300
  remote:
    endpoint: "http://localhost:8080/api/snapshot"
    token: "YOUR_API_KEY"
    timeout_seconds: 10

scene:
  # Built-in templates: "office", "cowboys", "cyberpunk", "japanese", "medieval", "ww2"
  active_template: "office"
  templates_dir: "./templates"
```

### Supported Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HOST` | Bind address for HTTP/WebSocket server | `0.0.0.0` |
| `PORT` | HTTP/WebSocket server port | `8080` |
| `ACTIVE_TEMPLATE` | Initial scene template ID (`office`, `cowboys`, `cyberpunk`, `japanese`, `medieval`, `ww2`) | `office` |
| `SOURCE_TYPE` | Data source adapter (`local` or `remote`) | `local` |
| `HERDR_USAGE_PLUGIN_DIR` | Optional path to `herdr-agent-usage` plugin for background quota refresh | Auto-discovered |
| `REMOTE_ENDPOINT` | Snapshot URL when `SOURCE_TYPE=remote` | `http://localhost:8080/api/snapshot` |
| `AUTH_TOKEN` | Bearer token when `server.auth.enabled=true` | `""` |

---

## 🔌 REST & WebSocket API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ws` | Real-time WebSocket stream of `WorkspaceSnapshot` payloads |
| `GET` | `/api/snapshot` | Current snapshot (`summary`, `agents`, `quotas`, `template`, `available_templates`) |
| `POST` | `/api/refresh` | Force immediate data source poll and broadcast |
| `GET` | `/api/templates` | List all installed scene templates |
| `POST` | `/api/templates/active` | Switch active scene template (`{"template_id": "cyberpunk"}`) |
| `POST` | `/api/sim/spawn` | Spawn a simulated agent (`{"agent": "claude", "status": "working", "task": "..."}`) |
| `POST` | `/api/sim/toggle` | Toggle an agent between `working` and `idle` (`{"id": "..."}`) |
| `POST` | `/api/sim/clear` | Remove simulated agents (`{"id": "all"}`) |

---

## 🎨 Creating Custom Scene Templates

Templates live in `templates/<template-id>/template.yaml`. You can scaffold and validate a new template using the included helper scripts:

```bash
# Scaffold a new template
bash skills/template-generator/scripts/scaffold_template.sh space-station "Orbital Command Station"

# Validate the template manifest
bash skills/template-generator/scripts/validate_template.sh templates/space-station/template.yaml
```

See [`AGENTS.md`](AGENTS.md) for details on the **4-Layer Hi-Bit Color Palette & Contrast Design System** and adding custom workstation/prop renderers.
