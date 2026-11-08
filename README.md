# Herdr Pixel Agents — Animated Workspace

A real-time pixel-art visual workspace and subscription quota dashboard for your active AI coding agents, inspired by [`pixel-agents-hq/pixel-agents`](https://github.com/pixel-agents-hq/pixel-agents) and powered by the discovery and quota engine of `herdr-agent-usage`.

## Architecture (Hexagonal / Ports & Adapters)

```text
├── cmd/server/main.go                              # Dependency injection & server bootstrap
├── config.yaml                                     # Root YAML configuration (source, auth, scene, custom elements)
├── internal/
│   ├── config/config.go                            # YAML configuration loader
│   ├── core/
│   │   ├── domain/models.go                        # Domain entities (AgentSession, AccountSubscription, TemplateManifest)
│   │   ├── ports/ports.go                          # Inbound & Outbound interfaces (DataSourcePort, TemplateRepositoryPort, EventPublisherPort)
│   │   └── services/workspace_service.go           # Snapshot diffing (Joined/Left/Updated), polling & template orchestration
│   └── adapters/
│       ├── inbound/httpws/server.go                # Real-time WebSocket hub (/ws) + REST API + optional token auth
│       └── outbound/
│           ├── sources/local/adapter.go            # Local Herdr CLI + live session transcripts + quota caches
│           ├── sources/remote/adapter.go           # Remote HTTP endpoint adapter
│           └── templates/repository.go             # Self-contained template plugin loader
├── templates/                                      # Self-contained scene template plugins
│   ├── office/template.yaml                        # 🏢 Pixel HQ Office (default)
│   ├── cyberpunk/template.yaml                     # 🌃 Neo-Tokyo Netrunner Deck
│   ├── medieval/template.yaml                      # 🏰 Arcane Citadel Sanctum
│   └── japanese/template.yaml                      # ⛩️ Edo Sakura Dojo
├── skills/template-generator/SKILL.md              # Agent skill & scaffold script for generating new templates
└── web/                                            # React 19 + TypeScript + Vite + Framer Motion + 2D Pixel Art Engine
```

## Quick Start

```bash
# Build frontend + Go binary and start on http://localhost:8080
make run
```

Open `http://localhost:8080` in full screen.

## Generating New Scene Templates

Use the included `template-generator` skill or scaffold script:

```bash
bash skills/template-generator/scripts/scaffold_template.sh cowboys "Wild West Saloon" "🤠 Saloon"
```
