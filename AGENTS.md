# AGENTS.md — AI Coding Agent Guide

This document provides architecture context, design system rules, and workflow commands for AI coding agents working on `agent-plaza`.

---

## 1. Project Overview

**Agents Animated Workspace** is a real-time **Hi-Bit Pixel Art** visualizer and multi-account subscription telemetry dashboard for AI coding agents (Claude Code, Codex, Grok, OpenCode, Antigravity, Gemini, Cursor, Devin, and Aider).

It combines:
- **Hexagonal (Ports & Adapters) Go Backend** (`cmd/server`, `internal/core`, `internal/adapters`) that polls active agent sessions and multi-account subscription limits (via local Herdr CLI + session transcripts/quota caches or a remote HTTP endpoint) and streams diffs over WebSockets.
- **React 19 + HTML5 Canvas 2D Hi-Bit Pixel Art Frontend** (`web/src`) that renders an interactive, 60 FPS animated scene with pathfinding characters, thematic workstations, hangout lounges, and live context/quota telemetry.

---

## 2. Repository Structure & Hexagonal Architecture

```text
├── cmd/server/main.go                  # Composition root & CLI entrypoint
├── config.yaml                         # Default server, data source, and scene configuration
├── Dockerfile                          # Multi-stage Docker build (Node 22 + Go + Alpine)
├── internal/
│   ├── config/config.go                # YAML & environment variable configuration loader
│   ├── core/
│   │   ├── domain/models.go            # Pure domain entities (WorkspaceSnapshot, AgentSession, QuotaAccount, SceneTemplate)
│   │   ├── ports/ports.go              # Inbound/Outbound interfaces (DataSourcePort, TemplateRepositoryPort, EventPublisherPort)
│   │   └── services/workspace_service.go # Core orchestration loop, simulation controls, template hot-swapping
│   └── adapters/
│       ├── inbound/http/               # REST API + Gorilla WebSocket hub + static SPA server
│       └── outbound/
│           ├── sources/local/          # Local Herdr CLI + ~/.claude, ~/.codex, ~/.local/share/opencode, ~/.gemini parser
│           ├── sources/remote/         # Remote HTTP snapshot polling adapter
│           └── templates/fs/           # YAML template manifest loader from ./templates/<id>/template.yaml
├── templates/                          # Self-contained scene template plugins
│   ├── office/template.yaml            # Retro Startup HQ
│   ├── cowboys/template.yaml           # Wild West Saloon & Forge
│   ├── cyberpunk/template.yaml         # Neon Netrunner Deck
│   ├── japanese/template.yaml          # Edo Samurai Dojo & Zen Garden
│   ├── medieval/template.yaml          # Arcane Guild Hall & Archery Yard
│   └── ww2/template.yaml               # Allied Command Bunker
├── skills/template-generator/          # Agent skill & scaffold script for new templates
└── web/                                # React 19 + TypeScript + Tailwind v4 + HTML5 Canvas 2D SPA
    └── src/
        ├── App.tsx                     # Main dashboard layout & WebSocket state hook
        ├── components/                 # PixelCanvas, AgentContextTable, SubscriptionLimitsTable, TopBar
        └── engine/
            ├── hibitPalette.ts         # Hi-Bit Color Palette & Contrast Design System (hue-shifted ramps, dither, backdrop)
            └── pixelEngine.ts          # 60 FPS Canvas 2D renderer (workstations, props, characters, companions, particles)
```

### Architectural Rules
1. **Strict Port Boundaries**: `internal/core/domain` and `internal/core/services` must **never** import `internal/adapters/*`. All external I/O (CLI execution, filesystem reads, HTTP requests, WebSockets) belongs in `internal/adapters`.
2. **No Hardcoded Local Paths or Secrets**: Never hardcode user-specific paths (e.g., `/Users/<username>/...`), API keys, or personal emails in code, tests, or `config.yaml`. Use environment variables (`HERDR_USAGE_PLUGIN_DIR`, `PORT`, `HOST`, `ACTIVE_TEMPLATE`, `SOURCE_TYPE`, `REMOTE_ENDPOINT`, `AUTH_TOKEN`) or dynamic `os.UserHomeDir()` resolution.

---

## 3. Hi-Bit Pixel Art Engine & Design System Rules

The frontend canvas (`web/src/engine/hibitPalette.ts` and `web/src/engine/pixelEngine.ts`) implements a strict **4-Layer Hi-Bit Color Palette & Contrast Design System** inspired by D-Pad Studio's Hi-Bit aesthetic (*Owlboy*, *Sea of Stars*, *Octopath Traveler*).

When adding or modifying templates, props, workstations, or characters, you **must** follow these rules:

### Rule 1: 4-Layer Value & Saturation Hierarchy
1. **Layer 1 — Architecture & Floor (`getFloorPalette` in `hibitPalette.ts`)**:
   - **Low Saturation (`15%–25%`), Controlled Dark-Mid Value (`L = 13%–22%`)**.
   - Floor tile A and B (`tileA` / `tileB`) must have a subtle delta (`ΔL ≤ 4%`) and muted mortar lines (`mortar`, `ΔL ≤ 6%`).
   - **Never** render raw high-saturation colors (e.g., bright orange terracotta or neon magenta) directly on the floor grid, as it creates visual noise that obscures characters and nameplates.
2. **Layer 2 — Thematic Workstations & Environment Props**:
   - **Medium Saturation (`35%–55%`), Mid Value (`L = 25%–55%`)** with `1px` dark outlines (`#090d16`) and top-edge specular bevel highlights (`drawBevelBox`).
3. **Layer 3 — Characters & Companions**:
   - **High Saturation (`70%–95%`), High Value (`L = 55%–85%`)** anchored by a dark `36%` alpha ground shadow ellipse (`drawDropShadow`) + `1px` dark outer contour (`#090d16`) + bright top-left rim highlight.
4. **Layer 4 — Emissive FX & Floating HUD Badges**:
   - **Peak Value (`L = 85%–100%`)** with additive radial `screen` glow (`drawPointLight`) and high-contrast `rgba(9, 13, 22, 0.88)` pill containers.

### Rule 2: Strict Scene-Specific Prop Isolation
- Generic office props (`server_rack`, `whiteboard`, `holo_table`, `plant`, `coffee_station`, `water_cooler`, `arcade`) must **only** appear in scenes where they belong (e.g. `office`).
- Every template must use its own thematic prop equivalents in `templates/<id>/template.yaml` and `drawSingleProp()` in `web/src/engine/pixelEngine.ts`:
  - **`office`**: `server_rack`, `whiteboard`, `coffee_station`, `water_cooler`, `arcade`, `plant`, `holo_table`, `sofa`
  - **`cowboys`**: `saloon_bar`, `wanted_board`, `water_trough`, `barrel`, `cactus`, `campfire`, `hitching_post`, `gold_safe`, `saddle_rack`
  - **`cyberpunk`**: `cyber_mainframe`, `cyber_screen`, `neon_vending`, `holo_pillar`, `server_pod`, `synth_bar`, `arcade`
  - **`japanese`**: `scroll_rack`, `katana_rack`, `shodo_banner`, `dojo_bamboo`, `tea_table`, `bonsai`, `lantern`, `torii`, `tatami_bench`, `koi_pond`, `zen_garden`
  - **`medieval`**: `mana_obelisk`, `grimoire_shelf`, `royal_banner`, `alchemy_table`, `hearth`, `bookshelf`, `banner`, `torch`, `weapon_rack`, `archery_target`, `training_dummy`
  - **`ww2`**: `colossus_rack`, `ordnance_rack`, `bunker_map_board`, `war_map_table`, `ammo_crate`, `sandbags`, `radar_console`, `radio_tower`, `field_cot`, `oil_drum`
- Unknown prop types in `drawSingleProp()` intentionally render nothing rather than falling back to an office prop.

### Rule 3: Thematic Workstations & Hangout Zones
- Each template defines diverse `workstation_styles` across its desks (`layout.desks[].style`) so agents perform theme-authentic activities when `working` (e.g., `horse_care`, `blacksmith_forge`, `bounty_desk`, `telegraph_desk`, `assay_scale`, `netrunner_chair`, `holo_rig`, `katana_forge`, `calligraphy_desk`, `alchemy_lab`, `runic_altar`, `enigma_machine`, `radar_station`).
- Idle agents walk to `layout.lounge_zone` (the hangout area) and animate idle behaviors (`sipping`, `chatting`, `stretching`, `reading`, `nodding`).

---

## 4. Development & Verification Commands

### Build & Test Backend (Go)
```bash
go build -o bin/agent-plaza ./cmd/server
go test ./...
```

### Build & Typecheck Frontend (React / TypeScript)
```bash
cd web && npm install && npm run build
```

### Scaffold or Validate Scene Templates
```bash
# Scaffold a new template plugin in ./templates/<id>/template.yaml
bash skills/template-generator/scripts/scaffold_template.sh <template-id> "<Display Name>"

# Validate all templates in ./templates/
for f in templates/*/template.yaml; do
  bash skills/template-generator/scripts/validate_template.sh "$f"
done
```

### Security & Clean-Repo Pre-Commit Check
Before committing or publishing, verify no local machine paths or credentials exist:
```bash
grep -rnE "(/Users/|PRIVATE KEY|api_key|secret)" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=bin
```
