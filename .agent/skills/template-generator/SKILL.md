---
name: template-generator
description: Generate, scaffold, and validate self-contained pixel-art scene templates (e.g. office, cowboys, medieval, japanese, ww2, cyberpunk) for Agents Animated Workspace. Use whenever the user asks to create or customize a scene template, character palette, workstation style, or environment prop.
---

# Scene Template Generator Skill

Use this skill to create self-contained scene templates in `templates/<template-id>/template.yaml`.
Every template is a drop-in plugin discovered automatically by the backend `TemplateRepositoryPort` adapter without code changes.

## Directory Structure of a Template Plugin

```text
templates/<template-id>/
├── template.yaml     # Required: Complete theme, ASCII tile map, zones, workstations, waypoints, props, characters, companions
└── sprites/          # Optional: Custom PNG/SVG sprite overrides served under /template-assets/<template-id>/sprites/
```

## Quick Scaffold Command

Run the helper script to scaffold a new template immediately:
```bash
bash skills/template-generator/scripts/scaffold_template.sh <template-id> "<Display Name>" "<Emoji Badge>"
```

## `template.yaml` Contract

1. **Metadata**:
   - `id`: lowercase slug matching the folder name (`office`, `cowboys`, `japanese`, `ww2`, `cyberpunk`, `medieval`)
   - `name`: human-readable title
   - `description`: 1-sentence summary of the environment
   - `theme_badge`: emoji + short name (e.g., `"🤠 Wild West"`, `"⛩️ Edo Dojo"`)

2. **Theme (`theme`)**:
   - `background`, `wall_color`, `wall_trim`, `floor_primary`, `floor_secondary`, `floor_accent`, `grid_line`, `accent_color`, `secondary_color`
   - `spawn_effect`: `"matrix"` | `"beam"` | `"portal"` | `"smoke"`
   - `spawn_color`: hex color for the materialization animation when new agents join via WebSocket
   - `particles`: `"dust"` | `"neon"` | `"embers"` | `"leaves"`
   - `working_verb`: activity text shown when an agent is working at a workstation
   - `idle_verb`: activity text shown when an agent is wandering

3. **Grid (`grid`)**:
   - `cols`: `28`, `rows`: `18`, `tile_size`: `16`
   - `layout`: 18 strings of 28 characters:
     - `W`: Wall tile (non-walkable, rendered with 3D pixel wall trim)
     - `C`: Workstation bay floor/carpet
     - `L`: Lounge/break area floor/rug
     - `.`: Primary corridor/floor

4. **Workstations (`workstations`)**:
   - Provide **at least 16–18 workstations** with diverse `style` and descriptive `label` values so every agent has a distinct thematic station:
   - **Office**: `"desk_pc"` (Dual Monitor + Vert IDE), `"office_triple"` (Triple-Monitor Command Rig), `"office_ultrawide"` (49" Curved Ultrawide), `"office_standing"` (Standing Desk + Treadmill), `"office_mac_studio"` (Pro Display XDR + Mac Studio), `"office_server_bench"` (Hardware Oscilloscope & Logic Probe), `"office_architect"` (Kanban & Blueprint Drafting Desk)
   - **Cowboys**: `"cowboy_horse_stall"` (Mustang Grooming & Shoeing Stall), `"cowboy_blacksmith"` (Anvil & Coal Forge), `"cowboy_gold_panning"` (Sluice Trough & Gold Panning), `"cowboy_leatherwork"` (Saddle & Leather Tooling Bench), `"cowboy_gunsmith"` (Revolver & Lever-Action Vise), `"cowboy_telegraph"` (Frontier Brass Morse Telegraph), `"saloon_table"`
   - **Cyberpunk**: `"cyber_netrunner_chair"` (Sub-Zero Ice Bath Netrunner Rig), `"cyber_holo_pillar"` (360° Volumetric Holo-Pillar), `"cyber_ripperdoc"` (Cyberware Calibration Bench), `"cyber_synth_rack"` (Neural Synth & Oscilloscope Rack), `"cyber_drone_rig"` (FPV Micro-Drone Assembly Bench), `"cyber_deck_triple"`, `"cyber_deck"`
   - **Japanese (Edo Dojo)**: `"dojo_calligraphy"` (Shodo Sumi-e Scroll Desk), `"dojo_bonsai"` (Ancient Pine Bonsai Sculpting), `"dojo_katana_forge"` (Tamahagane Katana Forge & Quench), `"dojo_woodblock"` (Ukiyo-e Woodblock Carving), `"dojo_tea_ceremony"` (Chashitsu Matcha Ceremony), `"dojo_scroll_lectern"` (Strategist War Scroll Table), `"tatami_desk"`
   - **Medieval**: `"medieval_alchemy"` (Bubbling Emerald Alchemy Cauldron), `"medieval_apothecary"` (Herb & Potion Distillation Rack), `"medieval_enchanting"` (Floating Arcane Crystal Altar), `"medieval_blacksmith"` (Dwarven Runeblade Anvil & Hearth), `"medieval_astrolabe"` (Celestial Brass Astrolabe), `"medieval_scribe"` (Illuminated Parchment Scriptorium), `"arcane_tome"`
   - **WW2 Bunker**: `"ww2_enigma"` (Captured M4 Shark Enigma Rotor Desk), `"ww2_bombe_drum"` (Turing Bombe Electromechanical Drum Bank), `"ww2_radar_scope"` (Chain Home PPI Radar Oscilloscope), `"ww2_radio_morse"` (Shortwave Morse Intercept Rig), `"ww2_field_mechanic"` (Spitfire Merlin V12 Engine Bench), `"ww2_map_plotter"` (Atlantic Convoy Tactical Plotter), `"radio_station"`
   - `seat_col`, `seat_row`: tile coordinates where the character sits/stands (`row + 1` for `facing: "up"`).

5. **Waypoints (`waypoints`)**:
   - 6–10 coordinates in thematic hangout areas (e.g., Zen Rock Garden & Koi Pond in `japanese`, Archery & Sword Practice Square in `medieval`, Campfire & Saloon Piano in `cowboys`, Ramen Stall & Cryo Lounge in `cyberpunk`, Sandbag Watch Post in `ww2`, Ping-Pong & Arcade Lounge in `office`) where `idle` agents walk, pause, and display thematic speech bubbles (`bubble`).

6. **Props (`props`) — Scene-Specific Isolation Rule**:
   - **Never reuse `office`-specific props (`server_rack`, `whiteboard`, `coffee_machine`, `watercooler`) in non-office scenes.** Every scene must use its own thematic equivalents:
     - **Office**: `"coffee_machine"`, `"watercooler"`, `"arcade"`, `"ping_pong"`, `"bookshelf"`, `"sofa"`, `"coffee_table"`, `"whiteboard"`, `"clock"`, `"server_rack"`, `"plant"`
     - **Cowboys**: `"saloon_bar"`, `"piano"`, `"campfire"`, `"water_trough"`, `"gold_safe"`, `"saddle_rack"`, `"wanted_board"`, `"barrel"`, `"plant"` (with `sprite: "cactus.png"`), `"clock"` (with `sprite: "sheriff_star.png"`)
     - **Cyberpunk**: `"ramen_stall"`, `"cryo_tank"`, `"holo_pod"`, `"holo_table"`, `"cyber_mainframe"`, `"cyber_screen"`, `"sofa"`
     - **Japanese (Edo Dojo)**: `"zen_garden"`, `"koi_pond"`, `"torii_gate"`, `"training_dummy"`, `"scroll_rack"`, `"katana_rack"`, `"shodo_banner"`, `"dojo_bamboo"`
     - **Medieval**: `"archery_target"`, `"sword_dummy"`, `"campfire"`, `"barrel"`, `"mana_obelisk"`, `"grimoire_shelf"`, `"royal_banner"`
     - **WW2 Bunker**: `"sandbag_post"`, `"radar_dish"`, `"war_map_table"` (with `sprite: "war_map.png"`), `"ammo_crates"`, `"colossus_rack"`, `"ordnance_rack"`, `"bunker_map_board"`
   - **Zone Header Clearance**: Keep `row: 1` clear of wide props near `col: 1..6` and `col: 14..20` so props never overlap the zone title text; place top-row lounge props at `row: 2`.

## Hi-Bit Color Palette & Contrast Design System

All current and future templates must obey the **4-Layer Value (Luminance `L`) & Saturation (`S`) Hierarchy** enforced by `web/src/engine/hibitPalette.ts` (`getFloorPalette` & `getRamp`):

| Layer | Target Elements | HSL Lightness (`L`) | HSL Saturation (`S`) | Local Contrast (`ΔL`) | Rules |
|---|---|---|---|---|---|
| **Layer 0: Void / Backdrop** | `theme.background` | `5% – 9%` | `<= 22%` | `<= 2%` | Deepest dark frame around the building |
| **Layer 1: Walkable Floors** | `floor_primary`, `floor_secondary`, `floor_accent` | **`11% – 18%`** | **`<= 26%` (Muted)** | **`<= 3.5%` (Strict Cap)** | Floors are a calm, quiet stage. Never put bright dots, high-contrast 16x16 borders, or saturated colors on floor tiles. |
| **Layer 2: Walls & Workstations** | `wall_color`, `wall_trim`, desks, props | `22% – 65%` | `30% – 75%` | `15% – 35%` | Grounded by `1px` dark selective outline (`sel-out`, `L ~ 7%`) and soft floor drop shadow |
| **Layer 3: Characters & Active FX** | `characters.*`, companions, active screens | **`45% – 95%`** | **`65% – 95%` (Vibrant)** | **`40% – 80%`** | Highest contrast in the scene; 1px dark `sel-out` silhouette + bright specular highlights |

7. **Characters (`characters`)**:
   - Keyed by agent name (`claude`, `agy`, `codex`, `grok`, `opencode`, `kimi`, `devin`, `default`).
   - Fields: `title`, `primary`, `secondary`, `skin`, `hair`, `BadgeColor`, and `accessory` (`"headphones"`, `"visor"`, `"glasses"`, `"spiky"`, `"beanie"`, `"wizard_hat"`, `"cowboy_hat"`, `"crown"`, `"samurai"`, `"helmet"`).
   - Optional `sprite_sheet`: custom 16x16 ASCII pixel matrix rows if overriding the procedural pixel character renderer.

8. **Companions (`companions`)**:
   - Autonomous pets/NPCs (`type: "cat" | "dog" | "robot"`) that roam the scene.

## Theme Presets Reference

- **Cowboys (`cowboys`)**: Warm desert saloon (`#2b1b12` wood floors, `saloon_table` workstations, `cowboy_hat` accessories, `smoke` spawn effect, `"🤠 Saloon"` badge).
- **Japanese (`japanese`)**: Edo Dojo / Zen Garden (`#2d3328` tatami floors, `tatami_desk` workstations, `samurai` accessories, `leaves` sakura particles, `"⛩️ Edo Dojo"` badge).
- **WW2 Command (`ww2`)**: Allied Cipher Bunker (`#1f2421` concrete/olive floors, `radio_station` Enigma desks, `helmet` accessories, `"🎖️ Bunker"` badge).
