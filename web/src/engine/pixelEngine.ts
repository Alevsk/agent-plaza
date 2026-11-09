import type {
  AgentSession,
  CharacterStyle,
  TemplateManifest,
  TemplateProp,
  TemplateWorkstation,
} from '../types';
import {
  drawBevelBox,
  drawDitherRect,
  drawDropShadow,
  getOrBuildHiBitBackdrop,
  getRamp,
  type PointLight,
  type PxFn,
} from './hibitPalette';

export const TILE_SIZE = 16;

export interface GridPos {
  col: number;
  row: number;
}

export interface SceneCharacter {
  id: string;
  session: AgentSession;
  col: number;
  row: number;
  x: number; // logical pixel X (center of tile)
  y: number; // logical pixel Y (center of tile)
  dir: 'down' | 'up' | 'left' | 'right';
  animState: 'walk' | 'type' | 'idle';
  frame: number;
  frameTimer: number;
  path: GridPos[];
  assignedStationId: string | null;
  targetWaypointId: string | null;
  idleBubble: string | null;
  wanderTimer: number;
  spawnEffect: 'spawn' | 'despawn' | null;
  spawnProgress: number; // 0..1
  spawnSeeds: number[];
  hueOffset: number;
}

export interface SceneCompanion {
  id: string;
  name: string;
  type: string;
  color: string;
  sprite?: string;
  x: number;
  y: number;
  col: number;
  row: number;
  dir: 'left' | 'right';
  path: GridPos[];
  frame: number;
  frameTimer: number;
  waitTimer: number;
  heartTimer: number;
}

export interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  phase: number;
}

export interface FootstepPuff {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: string;
}

export function resolveTemplateSpriteUrl(templateId: string, spritePath: string): string {
  if (!spritePath) return '';
  if (spritePath.startsWith('http://') || spritePath.startsWith('https://') || spritePath.startsWith('/')) {
    return spritePath;
  }
  const clean = spritePath.replace(/^sprites\//, '');
  return `/template-assets/${templateId}/sprites/${clean}`;
}

export class PixelSceneWorld {
  template: TemplateManifest | null = null;
  characters = new Map<string, SceneCharacter>();
  companions: SceneCompanion[] = [];
  particles: AmbientParticle[] = [];
  footsteps: FootstepPuff[] = [];
  stationOccupancy = new Map<string, string>(); // stationId -> charId
  spriteImages = new Map<string, HTMLImageElement>(); // url -> loaded HTMLImageElement
  blockedTiles = new Set<string>();
  walkableTiles: GridPos[] = [];
  globalTime = 0;

  setTemplate(tpl: TemplateManifest) {
    const prevTemplateId = this.template?.id;
    this.template = tpl;
    this.rebuildGrid();
    this.preloadTemplateSprites(tpl);

    if (prevTemplateId && prevTemplateId !== tpl.id) {
      this.stationOccupancy.clear();
      for (const ch of this.characters.values()) {
        ch.assignedStationId = null;
        ch.spawnEffect = 'spawn';
        ch.spawnProgress = 0;
      }
      this.reassignAllAgents();
    }

    this.companions = (tpl.companions || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      sprite: c.sprite,
      col: c.home_col,
      row: c.home_row,
      x: c.home_col * TILE_SIZE + TILE_SIZE / 2,
      y: c.home_row * TILE_SIZE + TILE_SIZE / 2,
      dir: 'right',
      path: [],
      frame: 0,
      frameTimer: 0,
      waitTimer: 1 + Math.random() * 3,
      heartTimer: 0,
    }));

    this.initParticles();
  }

  preloadTemplateSprites(tpl: TemplateManifest) {
    const urls = new Set<string>();
    for (const ws of tpl.workstations || []) {
      if (ws.sprite) urls.add(resolveTemplateSpriteUrl(tpl.id, ws.sprite));
    }
    for (const p of tpl.props || []) {
      if (p.sprite) urls.add(resolveTemplateSpriteUrl(tpl.id, p.sprite));
    }
    for (const style of Object.values(tpl.characters || {})) {
      if (style.sprite) urls.add(resolveTemplateSpriteUrl(tpl.id, style.sprite));
    }
    for (const c of tpl.companions || []) {
      if (c.sprite) urls.add(resolveTemplateSpriteUrl(tpl.id, c.sprite));
    }

    for (const url of urls) {
      if (!url || this.spriteImages.has(url)) continue;
      if (typeof Image !== 'undefined') {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          this.spriteImages.set(url, img);
        };
        img.src = url;
      }
    }
  }

  getSpriteImage(spritePath?: string): HTMLImageElement | undefined {
    if (!spritePath || !this.template) return undefined;
    const url = resolveTemplateSpriteUrl(this.template.id, spritePath);
    return this.spriteImages.get(url);
  }

  private rebuildGrid() {
    this.blockedTiles.clear();
    this.walkableTiles = [];
    if (!this.template) return;

    const { cols, rows, layout } = this.template.grid;
    for (let r = 0; r < rows; r++) {
      const line = layout[r] || '';
      for (let c = 0; c < cols; c++) {
        const ch = line[c] || 'W';
        if (ch === 'W' || ch === 'V') {
          this.blockedTiles.add(`${c},${r}`);
        }
      }
    }

    for (const ws of this.template.workstations || []) {
      this.blockedTiles.add(`${ws.col},${ws.row}`);
      this.blockedTiles.add(`${ws.col + 1},${ws.row}`);
    }

    for (const p of this.template.props || []) {
      for (let dr = 0; dr < (p.h || 1); dr++) {
        for (let dc = 0; dc < (p.w || 1); dc++) {
          this.blockedTiles.add(`${p.col + dc},${p.row + dr}`);
        }
      }
    }

    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (!this.blockedTiles.has(`${c},${r}`)) {
          this.walkableTiles.push({ col: c, row: r });
        }
      }
    }
  }

  private initParticles() {
    this.particles = [];
    if (!this.template) return;
    const W = this.template.grid.cols * TILE_SIZE;
    const H = this.template.grid.rows * TILE_SIZE;
    const mode = this.template.theme.particles || 'dust';
    const count = 34;

    for (let i = 0; i < count; i++) {
      let color = '#fef9c3';
      let vy = -3 - Math.random() * 4;
      let vx = (Math.random() - 0.5) * 4;
      if (mode === 'neon') {
        color = i % 2 === 0 ? '#00f0ff' : '#ff007f';
        vy = 10 + Math.random() * 14;
        vx = 0;
      } else if (mode === 'embers') {
        color = i % 3 === 0 ? '#fef08a' : i % 2 === 0 ? '#f59e0b' : '#ef4444';
        vy = -8 - Math.random() * 8;
      } else if (mode === 'leaves') {
        color = i % 2 === 0 ? '#fbcfe8' : '#f472b6';
        vy = 5 + Math.random() * 5;
        vx = 4 + Math.random() * 4;
      }
      this.particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx,
        vy,
        size: i % 5 === 0 ? 2 : 1,
        alpha: 0.25 + Math.random() * 0.5,
        color,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  syncAgents(
    agents: AgentSession[],
    joinedIds: Set<string> = new Set(),
    leftIds: Set<string> = new Set(),
  ) {
    const incomingIds = new Set(agents.map((a) => a.id));

    for (const [id, ch] of this.characters.entries()) {
      if (!incomingIds.has(id) || leftIds.has(id)) {
        if (ch.assignedStationId) {
          this.stationOccupancy.delete(ch.assignedStationId);
          ch.assignedStationId = null;
        }
        if (ch.spawnEffect !== 'despawn') {
          ch.spawnEffect = 'despawn';
          ch.spawnProgress = 0;
        }
      }
    }

    agents.forEach((ag, index) => {
      const existing = this.characters.get(ag.id);
      if (!existing) {
        const isLiveJoin = joinedIds.size > 0 && joinedIds.has(ag.id);
        const startPos = this.pickInitialPosition(ag, index, isLiveJoin);
        const seeds = Array.from({ length: 16 }, () => Math.random() * 0.45);
        const ch: SceneCharacter = {
          id: ag.id,
          session: ag,
          col: startPos.col,
          row: startPos.row,
          x: startPos.col * TILE_SIZE + TILE_SIZE / 2,
          y: startPos.row * TILE_SIZE + TILE_SIZE / 2,
          dir: 'down',
          animState: ag.status === 'working' ? 'type' : 'idle',
          frame: 0,
          frameTimer: 0,
          path: [],
          assignedStationId: null,
          targetWaypointId: null,
          idleBubble: null,
          wanderTimer: 0.5 + (index % 5) * 0.6,
          spawnEffect: 'spawn',
          spawnProgress: isLiveJoin ? 0 : 0.25,
          spawnSeeds: seeds,
          hueOffset: (index * 37) % 360,
        };
        this.characters.set(ag.id, ch);
        this.assignDestination(ch, !isLiveJoin);
      } else {
        const prevStatus = existing.session.status;
        existing.session = ag;
        if (existing.spawnEffect === 'despawn') {
          existing.spawnEffect = 'spawn';
          existing.spawnProgress = 0;
        }
        if (prevStatus !== ag.status) {
          this.assignDestination(existing, false);
        }
      }
    });
  }

  private reassignAllAgents() {
    let idx = 0;
    for (const ch of this.characters.values()) {
      if (ch.spawnEffect === 'despawn') continue;
      this.assignDestination(ch, idx < 20);
      idx++;
    }
  }

  private pickInitialPosition(ag: AgentSession, index: number, isLiveJoin: boolean): GridPos {
    if (!this.template) return { col: 13, row: 8 };
    if (isLiveJoin) {
      return { col: 12 + (index % 3), row: 8 + (index % 2) };
    }
    if (ag.status === 'working') {
      const ws = this.findFreeStation();
      if (ws) {
        return { col: ws.seat_col, row: ws.seat_row };
      }
    }
    const wps = this.template.waypoints || [];
    if (wps.length > 0) {
      const wp = wps[index % wps.length];
      return { col: wp.col, row: wp.row };
    }
    return { col: 13, row: 8 };
  }

  private findFreeStation(): TemplateWorkstation | null {
    if (!this.template) return null;
    for (const ws of this.template.workstations || []) {
      if (!this.stationOccupancy.has(ws.id)) {
        return ws;
      }
    }
    return null;
  }

  private assignDestination(ch: SceneCharacter, teleportIfInitial: boolean) {
    if (!this.template) return;

    if (ch.session.status === 'working') {
      ch.idleBubble = null;
      let ws: TemplateWorkstation | undefined;
      if (ch.assignedStationId) {
        ws = this.template.workstations.find((w) => w.id === ch.assignedStationId);
      }
      if (!ws) {
        const free = this.findFreeStation();
        if (free) {
          ws = free;
          this.stationOccupancy.set(free.id, ch.id);
          ch.assignedStationId = free.id;
        }
      }
      if (ws) {
        if (teleportIfInitial) {
          ch.col = ws.seat_col;
          ch.row = ws.seat_row;
          ch.x = ws.seat_col * TILE_SIZE + TILE_SIZE / 2;
          ch.y = ws.seat_row * TILE_SIZE + TILE_SIZE / 2;
          ch.path = [];
          ch.animState = 'type';
          ch.dir = (ws.facing as SceneCharacter['dir']) || 'up';
        } else {
          ch.path = this.findPath({ col: ch.col, row: ch.row }, { col: ws.seat_col, row: ws.seat_row });
          ch.animState = ch.path.length > 0 ? 'walk' : 'type';
        }
      }
    } else {
      if (ch.assignedStationId) {
        this.stationOccupancy.delete(ch.assignedStationId);
        ch.assignedStationId = null;
      }
      const wps = this.template.waypoints || [];
      if (wps.length > 0) {
        const wp = wps[Math.floor(Math.random() * wps.length)];
        ch.targetWaypointId = wp.id;
        ch.idleBubble = wp.bubble;
        if (teleportIfInitial) {
          const spot = this.pickSpreadIdleTile(ch.id, wp);
          ch.col = spot.col;
          ch.row = spot.row;
          ch.x = spot.col * TILE_SIZE + TILE_SIZE / 2;
          ch.y = spot.row * TILE_SIZE + TILE_SIZE / 2;
          ch.path = [];
          ch.animState = 'idle';
          ch.dir = 'down';
          ch.wanderTimer = 2 + Math.random() * 5;
        } else {
          const spot = this.pickSpreadIdleTile(ch.id, wp);
          ch.path = this.findPath({ col: ch.col, row: ch.row }, spot);
          ch.animState = ch.path.length > 0 ? 'walk' : 'idle';
          ch.wanderTimer = 4 + Math.random() * 6;
        }
      }
    }
  }

  private pickSpreadIdleTile(charId: string, preferred: GridPos): GridPos {
    const occupied = new Set<string>();
    for (const [id, other] of this.characters.entries()) {
      if (id !== charId) {
        occupied.add(`${other.col},${other.row}`);
      }
    }
    if (!occupied.has(`${preferred.col},${preferred.row}`) && !this.blockedTiles.has(`${preferred.col},${preferred.row}`)) {
      return { col: preferred.col, row: preferred.row };
    }
    const candidates = this.walkableTiles.filter(
      (t) => !occupied.has(`${t.col},${t.row}`) && (t.col >= 12 || (t.row >= 7 && t.row <= 9)),
    );
    if (candidates.length > 0) {
      candidates.sort(
        (a, b) =>
          Math.hypot(a.col - preferred.col, a.row - preferred.row) -
          Math.hypot(b.col - preferred.col, b.row - preferred.row),
      );
      return candidates[0];
    }
    return { col: preferred.col, row: preferred.row };
  }

  findPath(start: GridPos, goal: GridPos): GridPos[] {
    if (start.col === goal.col && start.row === goal.row) return [];
    if (!this.template) return [goal];
    const { cols, rows } = this.template.grid;

    const queue: GridPos[] = [start];
    const cameFrom = new Map<string, string>();
    const startKey = `${start.col},${start.row}`;
    const goalKey = `${goal.col},${goal.row}`;
    cameFrom.set(startKey, '');

    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 },
    ];

    let found = false;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currKey = `${curr.col},${curr.row}`;
      if (currKey === goalKey) {
        found = true;
        break;
      }
      for (const d of dirs) {
        const nc = curr.col + d.dc;
        const nr = curr.row + d.dr;
        if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1) continue;
        const nKey = `${nc},${nr}`;
        if (cameFrom.has(nKey)) continue;
        if (this.blockedTiles.has(nKey) && nKey !== goalKey) continue;
        cameFrom.set(nKey, currKey);
        queue.push({ col: nc, row: nr });
      }
    }

    if (!found) return [goal];

    const path: GridPos[] = [];
    let cur = goalKey;
    while (cur && cur !== startKey) {
      const [c, r] = cur.split(',').map(Number);
      path.unshift({ col: c, row: r });
      cur = cameFrom.get(cur) || '';
    }
    return path;
  }

  update(dt: number) {
    this.globalTime += dt;
    const walkSpeed = 46;

    // Update footstep dust puffs
    for (let i = this.footsteps.length - 1; i >= 0; i--) {
      this.footsteps[i].age += dt;
      if (this.footsteps[i].age >= this.footsteps[i].maxAge) {
        this.footsteps.splice(i, 1);
      }
    }

    for (const [id, ch] of this.characters.entries()) {
      if (ch.spawnEffect) {
        ch.spawnProgress += dt / 1.05;
        if (ch.spawnProgress >= 1) {
          if (ch.spawnEffect === 'despawn') {
            this.characters.delete(id);
            continue;
          }
          ch.spawnEffect = null;
          ch.spawnProgress = 1;
        }
      }

      ch.frameTimer += dt;
      if (ch.path.length > 0) {
        ch.animState = 'walk';
        if (ch.frameTimer >= 0.14) {
          ch.frameTimer = 0;
          ch.frame = (ch.frame + 1) % 4;
          if (ch.frame % 2 === 1 && this.footsteps.length < 32) {
            this.footsteps.push({
              x: ch.x + (Math.random() - 0.5) * 4,
              y: ch.y + 1,
              age: 0,
              maxAge: 0.45,
              color: 'rgba(226, 232, 240, 0.35)',
            });
          }
        }
        const target = ch.path[0];
        const tx = target.col * TILE_SIZE + TILE_SIZE / 2;
        const ty = target.row * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - ch.x;
        const dy = ty - ch.y;
        const dist = Math.hypot(dx, dy);

        if (Math.abs(dx) > Math.abs(dy)) {
          ch.dir = dx > 0 ? 'right' : 'left';
        } else {
          ch.dir = dy > 0 ? 'down' : 'up';
        }

        if (dist <= walkSpeed * dt) {
          ch.x = tx;
          ch.y = ty;
          ch.col = target.col;
          ch.row = target.row;
          ch.path.shift();
          if (ch.path.length === 0) {
            if (ch.session.status === 'working') {
              ch.animState = 'type';
              ch.dir = 'up';
            } else {
              ch.animState = 'idle';
              ch.dir = 'down';
              ch.wanderTimer = 4 + Math.random() * 6;
            }
          }
        } else {
          ch.x += (dx / dist) * walkSpeed * dt;
          ch.y += (dy / dist) * walkSpeed * dt;
        }
      } else if (ch.session.status === 'working') {
        ch.animState = 'type';
        ch.dir = 'up';
        if (ch.frameTimer >= 0.22) {
          ch.frameTimer = 0;
          ch.frame = (ch.frame + 1) % 2;
        }
      } else {
        ch.animState = 'idle';
        if (ch.frameTimer >= 0.5) {
          ch.frameTimer = 0;
          ch.frame = (ch.frame + 1) % 2;
        }
        ch.wanderTimer -= dt;
        if (ch.wanderTimer <= 0 && this.template) {
          const wps = this.template.waypoints || [];
          if (wps.length > 0) {
            const wp = wps[Math.floor(Math.random() * wps.length)];
            ch.idleBubble = wp.bubble;
            const dest = this.pickSpreadIdleTile(ch.id, wp);
            ch.path = this.findPath({ col: ch.col, row: ch.row }, dest);
          }
          ch.wanderTimer = 5 + Math.random() * 7;
        }
      }
    }

    for (const pet of this.companions) {
      if (pet.heartTimer > 0) pet.heartTimer = Math.max(0, pet.heartTimer - dt);
      pet.frameTimer += dt;
      if (pet.frameTimer >= 0.2) {
        pet.frameTimer = 0;
        pet.frame = (pet.frame + 1) % 2;
      }
      if (pet.path.length > 0) {
        const target = pet.path[0];
        const tx = target.col * TILE_SIZE + TILE_SIZE / 2;
        const ty = target.row * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - pet.x;
        const dy = ty - pet.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.1) pet.dir = dx > 0 ? 'right' : 'left';
        const speed = 26;
        if (dist <= speed * dt) {
          pet.x = tx;
          pet.y = ty;
          pet.col = target.col;
          pet.row = target.row;
          pet.path.shift();
          pet.waitTimer = 2 + Math.random() * 4;
        } else {
          pet.x += (dx / dist) * speed * dt;
          pet.y += (dy / dist) * speed * dt;
        }
      } else {
        pet.waitTimer -= dt;
        if (pet.waitTimer <= 0 && this.walkableTiles.length > 0) {
          const near = this.walkableTiles.filter(
            (t) => Math.hypot(t.col - pet.col, t.row - pet.row) <= 5,
          );
          if (near.length > 0) {
            const pick = near[Math.floor(Math.random() * near.length)];
            pet.path = this.findPath({ col: pet.col, row: pet.row }, pick);
          }
          pet.waitTimer = 3 + Math.random() * 5;
        }
      }
    }

    if (this.template) {
      const W = this.template.grid.cols * TILE_SIZE;
      const H = this.template.grid.rows * TILE_SIZE;
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
      }
    }
  }
}

// ── Hi-Bit Rendering Pipeline ───────────────────────────────────────────────

export function renderPixelWorld(
  ctx: CanvasRenderingContext2D,
  world: PixelSceneWorld,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  selectedId: string | null,
  hoveredId: string | null,
): { offsetX: number; offsetY: number } {
  const tpl = world.template;
  if (!tpl) return { offsetX: 0, offsetY: 0 };

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = tpl.theme.background || '#080b11';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const mapW = tpl.grid.cols * TILE_SIZE * zoom;
  const mapH = tpl.grid.rows * TILE_SIZE * zoom;
  const offsetX = Math.round((canvasWidth - mapW) / 2 + panX);
  const offsetY = Math.round((canvasHeight - mapH) / 2 + panY);

  const px: PxFn = (lx: number, ly: number, lw = 1, lh = 1, color?: string) => {
    if (color) ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(offsetX + lx * zoom),
      Math.round(offsetY + ly * zoom),
      Math.ceil(lw * zoom),
      Math.ceil(lh * zoom),
    );
  };

  // 1. Blit Cached Hi-Bit Architectural Tilemap (Floors, 2.5D Walls, Baseboards, Wall AO Shadows)
  const backdrop = getOrBuildHiBitBackdrop(tpl, TILE_SIZE);
  if (backdrop) {
    ctx.drawImage(
      backdrop,
      0,
      0,
      backdrop.width,
      backdrop.height,
      offsetX,
      offsetY,
      Math.round(backdrop.width * zoom),
      Math.round(backdrop.height * zoom),
    );
  }

  // 2. Collect Dynamic Emissive Point Lights (Hyper Light Drifter / Dungeon of the Endless lighting)
  const lights: PointLight[] = [];
  const flicker = Math.sin(world.globalTime * 9) * 0.08 + Math.cos(world.globalTime * 5) * 0.05;

  for (const ws of tpl.workstations || []) {
    const occupantId = world.stationOccupancy.get(ws.id);
    const occupant = occupantId ? world.characters.get(occupantId) : undefined;
    const isWorking =
      !!occupant &&
      occupant.session.status === 'working' &&
      occupant.animState === 'type' &&
      occupant.path.length === 0;

    const wx = (ws.col + 1) * TILE_SIZE;
    const wy = (ws.row + 0.5) * TILE_SIZE;

    if (ws.style === 'cowboy_blacksmith' || ws.style === 'medieval_blacksmith' || ws.style === 'dojo_katana_forge') {
      lights.push({
        x: wx - 8,
        y: wy,
        radius: isWorking ? 34 : 24,
        color: '#f97316',
        intensity: (isWorking ? 0.34 : 0.22) + flicker,
      });
    } else if (ws.style === 'medieval_alchemy' || ws.style === 'medieval_enchanting') {
      lights.push({
        x: wx,
        y: wy,
        radius: isWorking ? 32 : 22,
        color: ws.glow_color || '#a855f7',
        intensity: (isWorking ? 0.32 : 0.18) + flicker * 0.5,
      });
    } else if (isWorking || ws.style.startsWith('cyber_')) {
      lights.push({
        x: wx,
        y: wy,
        radius: isWorking ? 28 : 18,
        color: ws.glow_color || tpl.theme.accent_color || '#38bdf8',
        intensity: isWorking ? 0.24 : 0.11,
      });
    }
  }

  for (const prop of tpl.props || []) {
    const cx = (prop.col + (prop.w || 1) / 2) * TILE_SIZE;
    const cy = (prop.row + (prop.h || 1) / 2) * TILE_SIZE;
    if (prop.type === 'campfire') {
      lights.push({ x: cx, y: cy, radius: 42, color: '#f97316', intensity: 0.34 + flicker });
    } else if (prop.type === 'holo_table' || prop.type === 'cryo_tank' || prop.type === 'holo_pod' || prop.type === 'cyber_mainframe') {
      lights.push({ x: cx, y: cy, radius: 34, color: '#00f0ff', intensity: 0.24 + flicker * 0.4 });
    } else if (prop.type === 'ramen_stall' || prop.type === 'arcade') {
      lights.push({ x: cx, y: cy, radius: 32, color: '#ff007f', intensity: 0.22 });
    } else if (prop.type === 'mana_obelisk') {
      lights.push({ x: cx, y: cy, radius: 32, color: '#a855f7', intensity: 0.26 + flicker * 0.4 });
    } else if (prop.type === 'war_map_table') {
      lights.push({ x: cx, y: cy, radius: 30, color: '#84cc16', intensity: 0.18 });
    } else if (prop.type === 'torii_gate') {
      lights.push({ x: cx, y: cy, radius: 26, color: '#ef4444', intensity: 0.14 });
    } else if (prop.type === 'koi_pond') {
      lights.push({ x: cx, y: cy, radius: 30, color: '#38bdf8', intensity: 0.14 });
    }
  }

  // Render Pixelated Floor Light Pools BEFORE characters/furniture so objects sit inside the glow
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const l of lights) {
    const [r, g, b] = getRamp(l.color).rgb;
    const steps = 3;
    for (let s = steps; s >= 1; s--) {
      const rad = Math.round((l.radius * s) / steps);
      const alpha = Math.max(0.02, (l.intensity / steps) * (steps - s + 1) * 0.55);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      px(l.x - rad, l.y - Math.round(rad * 0.65), rad * 2, Math.round(rad * 1.3));
    }
  }
  ctx.restore();

  // 3. Zone Overlays & Corner Ticks
  for (const z of tpl.zones || []) {
    const zx = z.col * TILE_SIZE;
    const zy = z.row * TILE_SIZE;
    const zw = z.w * TILE_SIZE;
    const zh = z.h * TILE_SIZE;

    ctx.save();
    ctx.globalAlpha = 0.05;
    px(zx, zy, zw, zh, z.color);
    ctx.globalAlpha = 0.55;
    // Double-beveled pixel corner brackets
    px(zx, zy, 7, 1, z.color);
    px(zx, zy, 1, 7, z.color);
    px(zx + zw - 7, zy, 7, 1, z.color);
    px(zx + zw - 1, zy, 1, 7, z.color);
    px(zx, zy + zh - 1, 7, 1, z.color);
    px(zx, zy + zh - 7, 1, 7, z.color);
    px(zx + zw - 7, zy + zh - 1, 7, 1, z.color);
    px(zx + zw - 1, zy + zh - 7, 1, 7, z.color);
    ctx.restore();

    ctx.save();
    const fontSize = Math.max(9, Math.round(3.1 * zoom));
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(6, 5, 15, 0.8)';
    ctx.fillText(z.label, offsetX + (zx + 4) * zoom + 1, offsetY + (zy + 6) * zoom + 1);
    ctx.fillStyle = getRamp(z.color).spec;
    ctx.globalAlpha = 0.85;
    ctx.fillText(z.label, offsetX + (zx + 4) * zoom, offsetY + (zy + 6) * zoom);
    ctx.restore();
  }

  // 4. Footstep Dust Puffs on Floor
  for (const fp of world.footsteps) {
    const p = 1 - fp.age / fp.maxAge;
    ctx.save();
    ctx.globalAlpha = p * 0.45;
    const sz = fp.age < 0.2 ? 2 : 1;
    px(Math.round(fp.x), Math.round(fp.y - fp.age * 3), sz, sz, '#e2e8f0');
    ctx.restore();
  }

  // 5. Collect Z-Sorted Drawables (Workstations, Chairs, Props, Companions, Characters)
  interface Drawable {
    zY: number;
    draw: () => void;
  }
  const drawables: Drawable[] = [];

  const drawImg = (
    img: HTMLImageElement,
    lx: number,
    ly: number,
    lw: number,
    lh: number,
    sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height,
  ) => {
    ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      Math.round(offsetX + lx * zoom),
      Math.round(offsetY + ly * zoom),
      Math.round(lw * zoom),
      Math.round(lh * zoom),
    );
  };

  for (const ws of tpl.workstations || []) {
    const occupantId = world.stationOccupancy.get(ws.id);
    const occupant = occupantId ? world.characters.get(occupantId) : undefined;
    const isWorkingHere =
      !!occupant &&
      occupant.session.status === 'working' &&
      occupant.animState === 'type' &&
      occupant.path.length === 0;
    const wsSprite = world.getSpriteImage(ws.sprite);

    drawables.push({
      zY: (ws.row + 1) * TILE_SIZE,
      draw: () =>
        drawWorkstation(px, drawImg, wsSprite, ws, isWorkingHere, world.globalTime),
    });

    drawables.push({
      zY: ws.seat_row * TILE_SIZE + 2,
      draw: () =>
        drawChair(px, ws.seat_col * TILE_SIZE, ws.seat_row * TILE_SIZE, ws.glow_color, ws.style),
    });
  }

  for (const prop of tpl.props || []) {
    const propSprite = world.getSpriteImage(prop.sprite);
    drawables.push({
      zY: (prop.row + (prop.h || 1)) * TILE_SIZE,
      draw: () => drawProp(px, drawImg, propSprite, prop, world.globalTime),
    });
  }

  for (const pet of world.companions) {
    const petSprite = world.getSpriteImage(pet.sprite);
    drawables.push({
      zY: pet.y + 6,
      draw: () => drawCompanion(px, drawImg, petSprite, pet, world.globalTime),
    });
  }

  for (const ch of world.characters.values()) {
    const style =
      tpl.characters[ch.session.character_key] ||
      tpl.characters[ch.session.agent] ||
      tpl.characters['default'] || {
        title: 'AI Agent',
        primary: '#6366f1',
        secondary: '#1e293b',
        skin: '#fed7aa',
        hair: '#818cf8',
        accessory: 'headphones',
        badge_color: '#818cf8',
      };
    const charSprite = world.getSpriteImage(style.sprite);

    const isSelected = ch.id === selectedId;
    const isHovered = ch.id === hoveredId;

    drawables.push({
      zY: ch.y + 8,
      draw: () =>
        drawCharacterSprite(
          ctx,
          px,
          drawImg,
          charSprite,
          ch,
          style,
          tpl.theme.spawn_effect,
          tpl.theme.spawn_color,
          isSelected,
          isHovered,
          world.globalTime,
        ),
    });
  }

  drawables.sort((a, b) => a.zY - b.zY);
  for (const d of drawables) {
    d.draw();
  }

  // 6. Post-Scene Hi-Bit Atmospheric Bloom & Light Shafts
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const l of lights) {
    const [r, g, b] = getRamp(l.color).rgb;
    const coreRad = Math.round(l.radius * 0.42);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(l.intensity * 0.28).toFixed(3)})`;
    px(l.x - coreRad, l.y - Math.round(coreRad * 0.7), coreRad * 2, Math.round(coreRad * 1.4));
  }
  ctx.restore();

  // 7. Ambient Particles with Hi-Bit Dual-Pixel Halo
  ctx.save();
  for (const p of world.particles) {
    const pulse = 0.6 + 0.4 * Math.sin(world.globalTime * 2.4 + p.phase);
    ctx.globalAlpha = p.alpha * pulse * 0.35;
    px(p.x - 1, p.y - 1, p.size + 2, p.size + 2, p.color);
    ctx.globalAlpha = p.alpha * pulse;
    px(p.x, p.y, p.size, p.size, getRamp(p.color).spec);
  }
  ctx.restore();

  return { offsetX, offsetY };
}

// ── Hi-Bit Pixel Art Sprite Primitives ──────────────────────────────────────

type DrawImgFn = (
  img: HTMLImageElement,
  lx: number,
  ly: number,
  lw: number,
  lh: number,
  sx?: number,
  sy?: number,
  sw?: number,
  sh?: number,
) => void;

function drawChair(px: PxFn, x: number, y: number, accent: string, style = 'desk_pc') {
  const accRamp = getRamp(accent || '#38bdf8');

  // 1. Standing / Craft Floor Mats (Theme-Adapted — no generic office mat!)
  if (style === 'office_standing') {
    // Sleek dark anti-fatigue walking pad
    drawDropShadow(px, x + 2, y + 8, 12, 5);
    drawBevelBox(px, x + 2, y + 7, 12, 6, '#1e293b');
    px(x + 4, y + 9, 8, 2, '#0f172a');
    return;
  }
  if (style === 'cowboy_horse_stall' || style === 'cowboy_blacksmith' || style === 'cowboy_gold_panning') {
    // Weathered frontier wooden duckboard slats
    px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.25)');
    px(x + 3, y + 8, 10, 1, '#5c3820');
    px(x + 3, y + 10, 10, 1, '#5c3820');
    px(x + 3, y + 12, 10, 1, '#451a03');
    return;
  }
  if (style === 'dojo_katana_forge') {
    // Woven straw goza forge mat
    px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.25)');
    drawBevelBox(px, x + 2, y + 7, 12, 6, '#4d5e3b');
    return;
  }
  if (style === 'medieval_alchemy' || style === 'medieval_blacksmith') {
    // Chiseled stone hearth slab
    px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.28)');
    drawBevelBox(px, x + 2, y + 7, 12, 6, '#44403c');
    return;
  }
  if (style === 'ww2_bombe_drum' || style === 'ww2_field_mechanic') {
    // Olive-drab bunker duckboard grating
    px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.28)');
    drawBevelBox(px, x + 2, y + 7, 12, 6, '#364538');
    return;
  }

  // 2. Edo Dojo Silk Zabuton Floor Cushion with Gold Corner Tassels
  if (style.startsWith('dojo_') || style === 'tatami_desk') {
    drawDropShadow(px, x + 2, y + 7, 12, 6);
    drawBevelBox(px, x + 2, y + 6, 12, 7, '#be123c');
    px(x + 2, y + 6, 2, 1, '#facc15');
    px(x + 12, y + 6, 2, 1, '#facc15');
    px(x + 2, y + 12, 2, 1, '#facc15');
    px(x + 12, y + 12, 2, 1, '#facc15');
    px(x + 6, y + 9, 4, 2, '#fda4af');
    return;
  }

  // 3. Carved Oak Stool (Cowboys / Medieval)
  if (style.startsWith('cowboy_') || style.startsWith('medieval_') || style === 'saloon_table' || style === 'arcane_tome') {
    drawDropShadow(px, x + 3, y + 11, 10, 4);
    const wood = getRamp('#92400e');
    px(x + 4, y + 10, 2, 4, wood.outline);
    px(x + 10, y + 10, 2, 4, wood.outline);
    px(x + 4, y + 9, 8, 1, wood.deepShadow);
    drawBevelBox(px, x + 3, y + 6, 10, 5, '#b45309');
    return;
  }

  // 4. WW2 Bunker Olive-Drab Steel & Canvas Operator Stool
  if (style.startsWith('ww2_') || style === 'radio_station') {
    drawDropShadow(px, x + 3, y + 11, 10, 4);
    px(x + 4, y + 10, 2, 4, '#141a15');
    px(x + 10, y + 10, 2, 4, '#141a15');
    px(x + 4, y + 11, 8, 1, '#263028');
    drawBevelBox(px, x + 3, y + 6, 10, 5, '#3f6212');
    return;
  }

  // 5. Cyberpunk Reclining Netrunner Pod & Neon Bucket Seat
  if (style.startsWith('cyber_')) {
    drawDropShadow(px, x + 1, y + 6, 14, 9);
    drawBevelBox(px, x + 2, y + 5, 12, 9, '#1e1b4b');
    px(x + 3, y + 5, 10, 1, accRamp.spec);
    px(x + 5, y + 7, 6, 5, '#0f172a');
    return;
  }

  // 6. Office Ergonomic Hi-Bit Rolling Task Chair
  drawDropShadow(px, x + 3, y + 11, 10, 4);
  px(x + 4, y + 12, 8, 2, '#0f172a');
  px(x + 3, y + 13, 2, 2, '#475569');
  px(x + 11, y + 13, 2, 2, '#475569');
  px(x + 7, y + 10, 2, 3, '#64748b');
  drawBevelBox(px, x + 3, y + 6, 10, 5, '#334155');
  px(x + 4, y + 6, 8, 1, accRamp.spec);
  px(x + 2, y + 7, 1, 3, '#1e293b');
  px(x + 13, y + 7, 1, 3, '#1e293b');
}

// Helper for drawing a Hi-Bit monitor with bezel, stand, screen gradient, and syntax-highlighted code
function drawHiBitMonitor(
  px: PxFn,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
  glow: string,
  tick: number,
  bezelHex = '#1e293b',
) {
  const bezel = getRamp(bezelHex);
  const glowRamp = getRamp(glow);

  // Stand neck & base
  const cx = x + Math.floor(w / 2);
  px(cx - 2, y + h, 4, 2, bezel.outline);
  px(cx - 1, y + h, 2, 1, bezel.light);
  px(cx - 3, y + h + 1, 6, 1, bezel.shadow);

  // Outer Bezel with Sel-Out
  drawBevelBox(px, x, y, w, h, bezelHex);

  // Screen Canvas
  const sx = x + 2;
  const sy = y + 2;
  const sw = Math.max(2, w - 4);
  const sh = Math.max(2, h - 4);

  if (active) {
    px(sx, sy, sw, sh, '#091526');
    // Subtle top screen reflection
    px(sx, sy, sw, 1, '#162c46');
    // Scrolling syntax-highlighted pixel lines
    const lineCount = Math.max(1, Math.floor(sh / 2));
    for (let ln = 0; ln < lineCount; ln++) {
      const ly = sy + ln * 2;
      if (ly >= sy + sh) break;
      const len = Math.max(2, ((tick + ln * 3) % (sw - 2)) + 2);
      const col =
        ln % 3 === 0 ? glowRamp.spec : ln % 3 === 1 ? '#4ade80' : '#f472b6';
      px(sx + 1, ly, Math.min(sw - 2, len), 1, col);
    }
    // Power LED
    px(x + w - 2, y + h - 1, 1, 1, '#4ade80');
  } else {
    px(sx, sy, sw, sh, '#0f172a');
    px(sx + 1, sy + 1, Math.min(3, sw - 1), 1, '#334155'); // diagonal glass glint
    px(x + w - 2, y + h - 1, 1, 1, '#f59e0b'); // standby amber LED
  }
}

// Helper for drawing a 3D Hi-Bit Desk Base (32x16) with legs, shadow, wood/metal bevel, and surface details
function drawHiBitDeskBase(
  px: PxFn,
  x: number,
  y: number,
  topHex: string,
  frontHex: string,
  trimHex?: string,
) {
  drawDropShadow(px, x + 1, y + 12, 30, 4);
  const legRamp = getRamp(frontHex);
  // Left & Right Legs with sel-out
  px(x + 2, y + 12, 3, 4, legRamp.outline);
  px(x + 3, y + 12, 1, 3, legRamp.shadow);
  px(x + 27, y + 12, 3, 4, legRamp.outline);
  px(x + 28, y + 12, 1, 3, legRamp.shadow);

  // Desk Front Modesty Panel
  drawBevelBox(px, x + 1, y + 5, 30, 8, frontHex);
  // Desk Top Surface Slab
  drawBevelBox(px, x, y + 2, 32, 5, topHex);
  if (trimHex) {
    px(x + 1, y + 6, 30, 1, getRamp(trimHex).spec);
  }
}

function drawWorkstation(
  px: PxFn,
  drawImg: DrawImgFn,
  spriteImg: HTMLImageElement | undefined,
  ws: TemplateWorkstation,
  active: boolean,
  time: number,
) {
  const x = ws.col * TILE_SIZE;
  const y = ws.row * TILE_SIZE;
  const glow = ws.glow_color || '#38bdf8';
  const tick = Math.floor(time * 8);

  if (spriteImg) {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    drawImg(spriteImg, x, y - 4, 32, 20);
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. COWBOYS WORKSTATIONS (Horses, Blacksmith Forge, Gold Panning, Leatherwork, Telegraph, Gunsmith)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'cowboy_horse_stall') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    // Hay strewn stall bedding
    drawDitherRect(px, x + 2, y + 9, 28, 5, '#78350f', '#ca8a04', 0.25);
    // Split-rail cedar hitching corral posts & rails
    drawBevelBox(px, x, y + 1, 3, 14, '#78350f');
    drawBevelBox(px, x + 29, y + 1, 3, 14, '#78350f');
    drawBevelBox(px, x + 2, y + 3, 28, 3, '#92400e');
    px(x + 2, y + 9, 28, 2, getRamp('#78350f').shadow);

    // Golden tied hay bale on left + iron-hooped water bucket on right
    drawBevelBox(px, x + 2, y + 8, 7, 6, '#eab308');
    px(x + 4, y + 8, 1, 6, '#a16207'); // twine tie
    px(x + 6, y + 8, 1, 6, '#a16207');
    drawBevelBox(px, x + 24, y + 9, 6, 5, '#57534e');
    px(x + 25, y + 10, 4, 2, '#38bdf8');
    px(x + 26, y + 10, 2, 1, '#bae6fd'); // water glint

    // Hi-Bit Pixel Horse with 4-tone coat ramp, bridle, stirrups, and swishing tail!
    const coatHex = ws.col % 3 === 0 ? '#9a3412' : ws.col % 3 === 1 ? '#d97706' : '#d6d3d1';
    const coat = getRamp(coatHex);
    const mane = getRamp(ws.col % 3 === 2 ? '#292524' : '#fef3c7');
    const headBob = active ? tick % 2 : 0;
    const tailSwish = active ? (tick % 3) - 1 : 0;

    // Horse hooves & legs with dark sel-out
    for (const lx of [10, 13, 19, 22]) {
      px(x + lx, y + 9, 2, 5, coat.outline);
      px(x + lx, y + 9, 1, 4, coat.shadow);
      px(x + lx, y + 13, 2, 1, '#1c1917'); // hoof
    }
    // Horse barrel torso with sel-out & rump highlight
    drawBevelBox(px, x + 9, y + 4, 15, 6, coatHex);
    // Tooled leather western saddle & brass stirrup
    drawBevelBox(px, x + 14, y + 3, 6, 5, '#451a03');
    px(x + 15, y + 4, 4, 2, '#b45309');
    px(x + 16, y + 8, 2, 2, '#facc15'); // brass stirrup

    // Neck, head, ears, blaze & leather bridle
    drawBevelBox(px, x + 7, y + 0 + headBob, 5, 6, coatHex);
    drawBevelBox(px, x + 5, y + 2 + headBob, 4, 4, coatHex); // muzzle
    px(x + 5, y + 3 + headBob, 1, 2, '#fca5a5'); // soft pink nose
    px(x + 8, y - 2 + headBob, 2, 2, coat.outline); // ears
    px(x + 8, y - 1 + headBob, 1, 1, coat.light);
    px(x + 10, y - 2 + headBob, 2, 2, coat.outline);
    px(x + 10, y + 0 + headBob, 3, 5, mane.base); // flowing mane
    px(x + 11, y + 1 + headBob, 1, 3, mane.spec);
    px(x + 7, y + 2 + headBob, 1, 1, '#090d16'); // expressive eye
    px(x + 6, y + 4 + headBob, 4, 1, '#451a03'); // bridle strap

    // Flowing tail
    px(x + 23, y + 4, 3, 6 + tailSwish, mane.outline);
    px(x + 24, y + 5, 2, 4 + tailSwish, mane.base);
    if (active) {
      // Golden grooming sparkle & heart
      px(x + 15, y - 1 - (tick % 2), 2, 2, '#fef08a');
      px(x + 18, y - 2 - ((tick + 1) % 2), 1, 1, '#f43f5e');
    }
    return;
  }

  if (ws.style === 'cowboy_blacksmith' || ws.style === 'medieval_blacksmith') {
    const isMed = ws.style === 'medieval_blacksmith';
    drawDropShadow(px, x + 1, y + 12, 30, 4);

    // Stone / Brick Hearth Forge on Left (14x13)
    drawBevelBox(px, x + 1, y + 1, 14, 13, isMed ? '#475569' : '#9a3412');
    // Brickwork courses
    px(x + 3, y + 3, 4, 1, 'rgba(0,0,0,0.35)');
    px(x + 9, y + 3, 4, 1, 'rgba(0,0,0,0.35)');
    // Firebox pit & roaring multi-tone coals
    px(x + 3, y + 4, 10, 8, '#1c1917');
    const f = tick % 3;
    px(x + 4, y + 6, 8, 5, '#dc2626');
    px(x + 5, y + 4 - f, 6, 5, '#f97316');
    px(x + 6, y + 5 - (f % 2), 4, 3, '#fef08a');
    px(x + 7, y + 6 - (f % 2), 2, 1, '#ffffff');

    // Heavy Timber Stump & Forged Steel London-Pattern Anvil in Center
    drawBevelBox(px, x + 16, y + 9, 9, 5, '#78350f'); // oak anvil block
    drawBevelBox(px, x + 15, y + 5, 11, 5, '#334155'); // anvil waist
    drawBevelBox(px, x + 13, y + 4, 14, 3, '#64748b'); // polished anvil face & horn

    // Oak Quench Barrel on Right
    drawBevelBox(px, x + 26, y + 5, 6, 9, '#78350f');
    px(x + 26, y + 7, 6, 1, '#94a3b8'); // iron hoop
    px(x + 26, y + 11, 6, 1, '#94a3b8');
    px(x + 27, y + 6, 4, 2, '#38bdf8');

    if (active) {
      // White-hot glowing steel blade/horseshoe on anvil + flying sparks
      px(x + 16, y + 3, 7, 2, '#f97316');
      px(x + 18, y + 3, 4, 1, '#ffffff');
      px(x + 15 + (tick % 8), y + 0 - (tick % 3), 1, 1, '#fef08a');
      px(x + 23 - (tick % 6), y - 1 - ((tick + 1) % 3), 1, 1, '#f97316');
      px(x + 19, y - 2 - (tick % 2), 1, 1, '#ffffff');
    }
    return;
  }

  if (ws.style === 'cowboy_gold_panning') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    // Prospector Timber Sluice Box with Riffle Bars & Flowing Creek Water
    drawBevelBox(px, x, y + 3, 32, 11, '#78350f');
    px(x + 2, y + 5, 28, 7, '#0369a1');
    drawDitherRect(px, x + 2, y + 5, 28, 7, '#0284c7', '#0369a1', 0.5);
    for (let rx = 5; rx < 27; rx += 5) {
      px(x + rx, y + 5, 1, 7, '#451a03'); // riffle cleat
      const wave = (tick + rx) % 4;
      px(x + rx + 1, y + 6 + wave, 3, 1, '#bae6fd'); // foam ripple
    }
    // Iron Gold Pan with glinting paydirt nuggets
    drawBevelBox(px, x + 10, y + 5, 8, 6, '#334155');
    px(x + 12, y + 7, 2, 2, '#facc15');
    if (active) {
      px(x + 13 + (tick % 3), y + 7, 2, 2, '#fef08a');
      px(x + 15, y + 8 - (tick % 2), 1, 1, '#ffffff');
      px(x + 21, y + 7 + (tick % 2), 2, 2, '#facc15');
    }
    return;
  }

  if (ws.style === 'cowboy_leatherwork') {
    drawHiBitDeskBase(px, x, y, '#92400e', '#78350f', '#b45309');
    // Unrolled tan cowhide & stitched saddle on sawhorse
    drawBevelBox(px, x + 3, y, 11, 6, '#d97706');
    drawBevelBox(px, x + 17, y - 1, 10, 7, '#451a03');
    px(x + 19, y + 1, 6, 3, '#b45309');
    if (active) {
      px(x + 6 + (tick % 5), y + 2, 2, 1, '#fef08a'); // brass rivet punch
      px(x + 20, y + 1 + (tick % 2), 4, 1, glow);
    }
    return;
  }

  if (ws.style === 'cowboy_gunsmith') {
    drawHiBitDeskBase(px, x, y, '#78350f', '#5c3820', '#a16207');
    // Spoked Wooden Wagon Wheel & Brass Oil Lamp
    drawBevelBox(px, x + 3, y - 2, 9, 8, '#92400e');
    px(x + 5, y, 5, 4, '#1c1917');
    px(x + 6, y + 1, 3, 2, '#facc15'); // wheel hub
    drawBevelBox(px, x + 14, y + 1, 10, 5, '#1e3a8a'); // blueprint
    px(x + 16, y + 3, 6, 1, '#93c5fd');
    drawBevelBox(px, x + 25, y - 1, 5, 6, active ? '#facc15' : '#ca8a04');
    return;
  }

  if (ws.style === 'cowboy_telegraph' || ws.style === 'saloon_table') {
    drawHiBitDeskBase(px, x, y, '#92400e', '#78350f', '#b45309');
    // Open Parchment Ledger & Brass Western Union Telegraph Key
    drawBevelBox(px, x + 4, y, 12, 6, '#fef3c7');
    px(x + 9, y + 1, 2, 4, '#d97706'); // ledger spine
    if (active) {
      const step = tick % 4;
      px(x + 6, y + 2, 3 + step, 1, '#451a03');
      px(x + 11, y + 3, 3 - (step % 2), 1, glow);
    }
    drawBevelBox(px, x + 18, y + 1, 6, 4, '#facc15'); // brass telegraph sounder
    drawBevelBox(px, x + 25, y - 1, 5, 6, active ? glow : '#d97706'); // hurricane lamp
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CYBERPUNK WORKSTATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'cyber_netrunner_chair') {
    drawHiBitDeskBase(px, x, y, '#1e1b4b', '#0f172a', glow);
    drawHiBitMonitor(px, x + 2, y - 3, 8, 7, active, '#00f0ff', tick, '#1e1b4b');
    drawHiBitMonitor(px, x + 11, y - 4, 10, 8, active, glow, tick + 2, '#1e1b4b');
    drawHiBitMonitor(px, x + 22, y - 3, 8, 7, active, '#ff007f', tick + 4, '#1e1b4b');
    if (active) {
      px(x + 4 + (tick % 22), y + 6, 3, 1, '#00f0ff');
    }
    return;
  }

  if (ws.style === 'cyber_holo_pillar') {
    drawHiBitDeskBase(px, x, y, '#17112e', '#090d16', '#00f0ff');
    drawBevelBox(px, x + 9, y + 1, 14, 6, '#090d16');
    const r = active ? tick % 2 : 0;
    // Volumetric Floating Cyan/Magenta Holo-Orb
    drawBevelBox(px, x + 11, y - 4 - r, 10, 8, '#00f0ff');
    px(x + 13, y - 2 - r, 6, 4, glow);
    px(x + 15, y - 1 - r, 2, 2, '#ffffff');
    return;
  }

  if (ws.style === 'cyber_ripperdoc') {
    drawHiBitDeskBase(px, x, y, '#334155', '#0f172a', '#ff007f');
    // Chrome Cyberware Bionic Arm on calibration cradle
    drawBevelBox(px, x + 5, y + 1, 14, 5, '#cbd5e1');
    px(x + 7, y + 2, 10, 1, '#ffffff');
    drawBevelBox(px, x + 21, y - 3, 8, 8, '#1e293b');
    if (active) {
      const lx = x + 7 + (tick % 10);
      px(lx, y - 2, 1, 6, '#ff007f');
      px(lx - 1, y + 3, 3, 1, '#00f0ff');
    }
    return;
  }

  if (ws.style === 'cyber_synth_rack') {
    drawHiBitDeskBase(px, x, y, '#1e1b4b', '#090d16', '#a855f7');
    drawBevelBox(px, x + 2, y - 3, 28, 9, '#090d16');
    for (let c = 0; c < 8; c++) {
      const bh = active ? 2 + ((tick + c * 3) % 5) : 2;
      const barCol = c % 2 === 0 ? '#00f0ff' : '#ff007f';
      px(x + 4 + c * 3, y + 5 - bh, 2, bh, barCol);
      px(x + 4 + c * 3, y + 5 - bh, 2, 1, '#ffffff');
    }
    return;
  }

  if (ws.style === 'cyber_drone_rig') {
    drawHiBitDeskBase(px, x, y, '#1e1b4b', '#0f172a', glow);
    drawHiBitMonitor(px, x + 3, y - 3, 11, 7, active, '#00f0ff', tick, '#1e1b4b');
    const hover = active ? Math.round(Math.sin(time * 10) * 1.5) : 0;
    drawBevelBox(px, x + 18, y - 1 + hover, 10, 5, '#e2e8f0');
    px(x + 16, y - 1 + hover, 4, 1, '#00f0ff'); // rotor L
    px(x + 26, y - 1 + hover, 4, 1, '#00f0ff'); // rotor R
    px(x + 22, y + 1 + hover, 2, 1, '#ff007f'); // optical sensor
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. EDO DOJO WORKSTATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'dojo_katana_forge') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    // Stone Swordsmith Charcoal Forge + Glowing Tamahagane Steel
    drawBevelBox(px, x + 1, y + 2, 13, 11, '#44403c');
    px(x + 3, y + 4, 9, 6, '#dc2626');
    if (active) {
      px(x + 4, y + 3 - (tick % 2), 7, 4, '#f97316');
      px(x + 6, y + 2 - (tick % 3), 3, 2, '#fef08a');
    }
    // Keyaki wood sword rack & polished Katana with gold Tsuba
    drawBevelBox(px, x + 15, y + 4, 16, 8, '#78350f');
    drawBevelBox(px, x + 17, y + 5, 13, 3, '#e2e8f0');
    px(x + 18, y + 6, 11, 1, '#ffffff'); // hamon temper line
    px(x + 17, y + 4, 2, 5, '#facc15'); // gold tsuba guard
    if (active) {
      px(x + 20 + (tick % 6), y + 3, 2, 2, '#fef08a');
    }
    return;
  }

  if (ws.style === 'dojo_bonsai') {
    drawHiBitDeskBase(px, x, y, '#9a4b18', '#6b3410', '#d97706');
    // Glazed Ceramic Bonsai Pot + Twisted Trunk + Multi-Layered Sakura/Pine Canopy
    drawBevelBox(px, x + 10, y + 1, 11, 4, '#1e3a8a');
    px(x + 14, y - 2, 3, 4, '#5c3a21');
    const canopyHex = ws.col % 2 === 0 ? '#f472b6' : '#22c55e';
    drawBevelBox(px, x + 7, y - 5, 10, 5, canopyHex);
    drawBevelBox(px, x + 14, y - 7, 11, 5, canopyHex);
    if (active) {
      px(x + 11 + (tick % 8), y + 0, 2, 1, '#ffffff');
    }
    return;
  }

  if (ws.style === 'dojo_tea_ceremony') {
    drawHiBitDeskBase(px, x, y, '#4d7c0f', '#365314', '#ca8a04');
    // Sunken Ro Hearth + Cast-Iron Tetsubin Kettle + Green Matcha Chawan
    drawBevelBox(px, x + 5, y + 1, 10, 6, '#292524');
    drawBevelBox(px, x + 7, y - 1, 6, 5, '#475569');
    drawBevelBox(px, x + 19, y + 1, 6, 5, '#15803d');
    px(x + 20, y + 2, 4, 2, '#4ade80');
    if (active) {
      const sy = tick % 3;
      px(x + 9, y - 3 - sy, 2, 2, 'rgba(255,255,255,0.75)');
    }
    return;
  }

  if (ws.style === 'dojo_woodblock') {
    drawHiBitDeskBase(px, x, y, '#92400e', '#78350f', '#b45309');
    // Ukiyo-e Great Wave Print Block & Porcelain Pigment Bowls
    drawBevelBox(px, x + 4, y, 14, 6, '#f8fafc');
    px(x + 6, y + 1, 10, 4, '#1d4ed8');
    px(x + 7, y + 1, 5, 2, '#93c5fd');
    drawBevelBox(px, x + 20, y + 1, 4, 4, '#ef4444');
    drawBevelBox(px, x + 25, y + 1, 4, 4, '#facc15');
    return;
  }

  if (ws.style === 'dojo_calligraphy' || ws.style === 'dojo_scroll_lectern' || ws.style === 'tatami_desk') {
    drawHiBitDeskBase(px, x, y, '#9a4b18', '#6b3410', '#d97706');
    // Unrolled Washi Scroll with Crimson Rollers & Glowing Andon Paper Lantern
    drawBevelBox(px, x + 4, y, 14, 6, '#fef9c3');
    px(x + 4, y, 2, 6, '#dc2626');
    px(x + 16, y, 2, 6, '#dc2626');
    if (active) {
      const step = tick % 4;
      px(x + 7, y + 2, 5 + step, 1, '#1c1917');
      px(x + 7, y + 4, 7 - step, 1, glow);
    }
    drawBevelBox(px, x + 22, y - 2, 6, 7, active ? glow : '#fde68a');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. MEDIEVAL WORKSTATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'medieval_alchemy') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    // Heavy Cast-Iron Alchemy Cauldron over Glowing Logs + Glass Alembic Table
    px(x + 3, y + 11, 10, 3, '#ea580c');
    px(x + 5, y + 12, 6, 2, '#fef08a');
    drawBevelBox(px, x + 2, y + 2, 12, 10, '#334155');
    drawBevelBox(px, x + 1, y + 1, 14, 3, '#475569');
    px(x + 3, y + 2, 10, 2, glow);
    if (active) {
      const b = tick % 4;
      px(x + 4 + b, y - 1 - (b % 2), 2, 2, glow);
      px(x + 9 - (b % 3), y - 2 - (b % 2), 2, 2, '#ffffff');
    }
    drawBevelBox(px, x + 16, y + 3, 15, 10, '#78350f');
    drawBevelBox(px, x + 18, y - 1, 5, 6, '#38bdf8');
    drawBevelBox(px, x + 24, y, 5, 5, '#ec4899');
    return;
  }

  if (ws.style === 'medieval_enchanting') {
    drawHiBitDeskBase(px, x, y, '#475569', '#334155', glow);
    const floatY = active ? Math.round(Math.sin(time * 7) * 2) : 0;
    drawBevelBox(px, x + 12, y - 5 + floatY, 8, 8, glow);
    px(x + 15, y - 3 + floatY, 2, 4, '#ffffff');
    return;
  }

  if (ws.style === 'medieval_astrolabe') {
    drawHiBitDeskBase(px, x, y, '#855836', '#5c3a21', '#facc15');
    drawBevelBox(px, x + 4, y - 3, 9, 8, '#f59e0b');
    px(x + 6, y - 1, 5, 4, active ? glow : '#1e3a8a');
    drawBevelBox(px, x + 18, y - 2, 10, 4, '#facc15');
    return;
  }

  if (ws.style === 'medieval_apothecary') {
    drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#22c55e');
    drawBevelBox(px, x + 4, y - 1, 6, 5, '#d6d3d1');
    drawBevelBox(px, x + 13, y - 2, 4, 6, '#22c55e');
    drawBevelBox(px, x + 18, y - 2, 4, 6, '#ef4444');
    drawBevelBox(px, x + 23, y - 2, 4, 6, '#38bdf8');
    return;
  }

  if (ws.style === 'medieval_scribe' || ws.style === 'arcane_tome') {
    drawHiBitDeskBase(px, x, y, '#855836', '#5c3a21', '#d97706');
    drawBevelBox(px, x + 4, y - 1, 12, 7, '#fef3c7');
    px(x + 9, y, 2, 5, '#92400e');
    if (active) {
      const floatY = Math.round(Math.sin(time * 6));
      px(x + 6, y + 1 + floatY, 3, 1, glow);
      px(x + 11, y + 2 + floatY, 3, 1, glow);
    }
    drawBevelBox(px, x + 20, y - 1, 6, 6, active ? glow : '#475569');
    px(x + 22, y, 2, 2, '#ffffff');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. WW2 BUNKER WORKSTATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'ww2_bombe_drum') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    drawBevelBox(px, x + 1, y - 2, 30, 16, '#44403c');
    const spin = active ? tick % 3 : 0;
    for (let d = 0; d < 4; d++) {
      const dx = x + 4 + d * 6;
      drawBevelBox(px, dx, y, 5, 5, '#991b1b');
      px(dx + 1 + spin, y + 2, 2, 1, '#fef08a');
      drawBevelBox(px, dx, y + 6, 5, 5, '#1e3a8a');
      px(dx + 3 - spin, y + 8, 2, 1, '#fef08a');
    }
    return;
  }

  if (ws.style === 'ww2_radar_scope') {
    drawHiBitDeskBase(px, x, y, '#3f4f41', '#263028', '#84cc16');
    drawBevelBox(px, x + 4, y - 4, 13, 10, '#141a15');
    px(x + 6, y - 2, 9, 6, '#052e16');
    px(x + 10, y, 2, 2, '#22c55e');
    if (active) {
      const bx = (tick % 5) - 2;
      px(x + 10 + bx, y - (tick % 2), 2, 1, '#4ade80');
      px(x + 12, y - 1, 1, 1, '#fef08a');
    }
    drawHiBitMonitor(px, x + 19, y - 2, 10, 7, active, glow, tick, '#263028');
    return;
  }

  if (ws.style === 'ww2_radio_morse') {
    drawHiBitDeskBase(px, x, y, '#3f4f41', '#263028', '#eab308');
    drawBevelBox(px, x + 3, y - 3, 15, 8, '#292524');
    px(x + 5, y - 1, 4, 3, '#fef3c7');
    px(x + 11, y - 1, 4, 3, active ? '#84cc16' : '#3f3f46');
    px(x + 21, y - 5, 2, 9, '#d97706');
    drawBevelBox(px, x + 24, y + 1, 5, 4, '#facc15');
    return;
  }

  if (ws.style === 'ww2_map_plotter') {
    drawHiBitDeskBase(px, x, y, '#3f4f41', '#263028', '#22c55e');
    drawBevelBox(px, x + 2, y + 1, 28, 8, '#064e3b');
    px(x + 6, y + 3, 10, 4, '#15803d');
    px(x + 9 + (active ? tick % 4 : 0), y + 4, 2, 2, '#ef4444');
    px(x + 18, y + 5, 2, 2, '#facc15');
    px(x + 22, y + 3, 2, 2, '#38bdf8');
    return;
  }

  if (ws.style === 'ww2_field_mechanic') {
    drawHiBitDeskBase(px, x, y, '#4b5563', '#374151', '#f59e0b');
    drawBevelBox(px, x + 4, y - 2, 13, 7, '#1f2937');
    px(x + 6, y - 1, 9, 2, '#cbd5e1');
    drawBevelBox(px, x + 20, y - 1, 8, 5, '#dc2626');
    if (active) {
      px(x + 10 + (tick % 4), y - 3, 2, 2, '#fef08a');
    }
    return;
  }

  if (ws.style === 'ww2_enigma' || ws.style === 'radio_station') {
    drawHiBitDeskBase(px, x, y, '#3f4f41', '#263028', '#84cc16');
    drawBevelBox(px, x + 3, y - 3, 13, 8, '#292524');
    px(x + 5, y - 1, 9, 3, '#78716c');
    drawHiBitMonitor(px, x + 18, y - 3, 11, 8, active, '#4ade80', tick, '#141a15');
    if (active) {
      px(x + 6 + (tick % 5), y + 2, 2, 1, '#fef08a');
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. OFFICE WORKSTATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'office_triple' || ws.style === 'cyber_deck_triple') {
    const isCyber = ws.style === 'cyber_deck_triple';
    drawHiBitDeskBase(px, x, y, isCyber ? '#1e1b4b' : '#855836', isCyber ? '#0f172a' : '#5c3e26', isCyber ? glow : '#a16d47');
    drawHiBitMonitor(px, x + 1, y - 3, 8, 7, active, '#38bdf8', tick);
    drawHiBitMonitor(px, x + 10, y - 4, 11, 8, active, glow, tick + 2);
    drawHiBitMonitor(px, x + 22, y - 5, 7, 9, active, '#a855f7', tick + 4);
    return;
  }

  if (ws.style === 'office_ultrawide') {
    drawHiBitDeskBase(px, x, y, '#855836', '#5c3e26', '#a16d47');
    drawHiBitMonitor(px, x + 2, y - 4, 21, 8, active, glow, tick);
    drawBevelBox(px, x + 24, y + 1, 4, 4, '#f97316'); // coffee mug
    px(x + 25, y + 1, 2, 1, '#ffffff');
    return;
  }

  if (ws.style === 'office_standing') {
    drawDropShadow(px, x + 1, y + 12, 30, 4);
    px(x + 3, y + 4, 2, 11, '#1e293b');
    px(x + 27, y + 4, 2, 11, '#1e293b');
    drawBevelBox(px, x, y + 1, 32, 4, '#94a3b8');
    drawHiBitMonitor(px, x + 4, y - 6, 13, 8, active, glow, tick);
    drawHiBitMonitor(px, x + 18, y - 5, 8, 7, active, '#4ade80', tick + 2);
    drawBevelBox(px, x + 27, y - 3, 4, 4, '#22c55e');
    return;
  }

  if (ws.style === 'office_mac_studio') {
    drawHiBitDeskBase(px, x, y, '#cbd5e1', '#475569', '#e2e8f0');
    drawHiBitMonitor(px, x + 4, y - 4, 14, 8, active, glow, tick, '#e2e8f0');
    drawBevelBox(px, x + 20, y, 6, 5, '#cbd5e1');
    px(x + 22, y + 3, 1, 1, '#ffffff');
    return;
  }

  if (ws.style === 'office_server_bench') {
    drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', '#38bdf8');
    drawBevelBox(px, x + 2, y - 3, 10, 8, '#090d16');
    px(x + 4, y - 1, 2, 1, active ? '#22c55e' : '#f59e0b');
    px(x + 4, y + 1, 2, 1, '#38bdf8');
    drawHiBitMonitor(px, x + 14, y - 3, 14, 8, active, '#4ade80', tick, '#0f172a');
    return;
  }

  if (ws.style === 'office_architect') {
    drawHiBitDeskBase(px, x, y, '#855836', '#5c3e26', '#a16d47');
    drawHiBitMonitor(px, x + 3, y - 4, 13, 8, active, glow, tick);
    drawBevelBox(px, x + 17, y - 3, 12, 8, '#f8fafc');
    px(x + 19, y - 1, 2, 2, '#facc15');
    px(x + 22, y - 1, 2, 2, '#f43f5e');
    px(x + 25, y - 1, 2, 2, '#22c55e');
    px(x + 19, y + 2, 2, 2, '#38bdf8');
    return;
  }

  // Default Dual-Monitor PC / Cyber Deck
  const isCyber = ws.style === 'cyber_deck';
  drawHiBitDeskBase(
    px,
    x,
    y,
    isCyber ? '#1e1b4b' : '#855836',
    isCyber ? '#0f172a' : '#5c3e26',
    isCyber ? glow : '#a16d47',
  );
  drawHiBitMonitor(px, x + 3, y - 4, 14, 8, active, glow, tick);
  drawHiBitMonitor(px, x + 18, y - 3, 10, 7, active, '#a855f7', tick + 3);
  // Mechanical keyboard & mouse
  px(x + 7, y + 4, 8, 2, '#1e293b');
  px(x + 8, y + 4, 6, 1, '#94a3b8');
  px(x + 17, y + 4, 2, 2, '#475569');
}

function drawProp(
  px: PxFn,
  drawImg: DrawImgFn,
  spriteImg: HTMLImageElement | undefined,
  prop: TemplateProp,
  time: number,
) {
  const x = prop.col * TILE_SIZE;
  const y = prop.row * TILE_SIZE;
  const w = (prop.w || 1) * TILE_SIZE;
  const h = (prop.h || 1) * TILE_SIZE;
  const tick = Math.floor(time * 6);

  if (spriteImg) {
    drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
    drawImg(spriteImg, x, y, w, h);
    return;
  }

  switch (prop.type) {
    case 'ping_pong': {
      drawDropShadow(px, x + 3, y + h - 4, w - 6, 4);
      drawBevelBox(px, x + 3, y + 3, w - 6, h - 5, '#1d4ed8');
      px(x + 5, y + 5, w - 10, 1, '#ffffff');
      px(x + 5, y + h - 4, w - 10, 1, '#ffffff');
      px(x + 5, y + Math.floor(h / 2), w - 10, 1, 'rgba(255,255,255,0.5)');
      px(x + Math.floor(w / 2), y + 2, 2, h - 3, '#e2e8f0');
      const bx = Math.round((Math.sin(time * 5) * 0.4 + 0.5) * (w - 16)) + 8;
      const by = Math.round(Math.abs(Math.cos(time * 5)) * 5) + 6;
      px(x + bx, y + by, 2, 2, '#ffffff');
      break;
    }
    case 'zen_garden': {
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 3);
      drawBevelBox(px, x + 1, y + 2, w - 2, h - 4, '#5c3a21');
      px(x + 3, y + 4, w - 6, h - 8, '#e7e5e4');
      for (let ry = 6; ry < h - 6; ry += 3) {
        px(x + 5, y + ry, w - 10, 1, '#a8a29e');
      }
      drawBevelBox(px, x + 11, y + 8, 10, 7, '#57534e');
      px(x + 13, y + 9, 5, 2, '#22c55e');
      drawBevelBox(px, x + 45, y + 10, 12, 8, '#44403c');
      px(x + 48, y + 11, 6, 2, '#16a34a');
      break;
    }
    case 'koi_pond': {
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 3);
      drawBevelBox(px, x + 1, y + 1, w - 2, h - 2, '#57534e');
      px(x + 4, y + 4, w - 8, h - 8, '#0c4a6e');
      drawDitherRect(px, x + 6, y + 6, w - 12, h - 12, '#0369a1', '#0284c7', 0.5);
      // Lily pads & blooming pink lotus
      drawBevelBox(px, x + 9, y + 7, 6, 5, '#16a34a');
      px(x + 11, y + 8, 2, 2, '#f472b6');
      drawBevelBox(px, x + w - 19, y + 13, 6, 5, '#15803d');
      const k1 = (tick * 2) % Math.max(8, w - 24);
      const k2 = Math.max(8, w - 24) - k1;
      px(x + 8 + k1, y + 10, 5, 2, '#f97316');
      px(x + 9 + k1, y + 10, 2, 2, '#ffffff');
      px(x + 8 + k2, y + 18, 5, 2, '#ef4444');
      px(x + 10 + k2, y + 18, 2, 1, '#fef08a');
      break;
    }
    case 'torii_gate': {
      drawDropShadow(px, x + 4, y + h - 3, w - 8, 3);
      drawBevelBox(px, x + 1, y - 3, w - 2, 4, '#1c1917');
      drawBevelBox(px, x + 3, y + 1, w - 6, 3, '#dc2626');
      drawBevelBox(px, x + 4, y + 6, w - 8, 3, '#dc2626');
      drawBevelBox(px, x + 6, y + 1, 4, h - 2, '#dc2626');
      drawBevelBox(px, x + w - 10, y + 1, 4, h - 2, '#dc2626');
      break;
    }
    case 'training_dummy':
    case 'sword_dummy': {
      const shake = tick % 4 === 0 ? 1 : 0;
      drawDropShadow(px, x + 8, y + 18, 16, 4);
      drawBevelBox(px, x + 9, y + 17, 14, 5, '#451a03');
      drawBevelBox(px, x + 13 + shake, y + 1, 6, 17, '#78350f');
      drawBevelBox(px, x + 7 + shake, y + 5, 18, 4, '#92400e');
      drawBevelBox(px, x + 11 + shake, y + 3, 10, 10, '#eab308');
      break;
    }
    case 'archery_target': {
      for (let t = 0; t < 3; t++) {
        const tx = x + 6 + t * 28;
        drawDropShadow(px, tx, y + 16, 14, 4);
        px(tx + 2, y + 13, 2, 6, '#451a03');
        px(tx + 10, y + 13, 2, 6, '#451a03');
        drawBevelBox(px, tx, y + 1, 14, 14, '#fef08a');
        px(tx + 2, y + 3, 10, 10, '#2563eb');
        px(tx + 4, y + 5, 6, 6, '#ef4444');
        px(tx + 6, y + 7, 2, 2, '#facc15');
        if ((tick + t) % 3 !== 0) {
          px(tx + 7, y + 8, 5, 1, '#451a03');
          px(tx + 11, y + 7, 2, 3, '#f8fafc');
        }
      }
      break;
    }
    case 'ramen_stall': {
      drawDropShadow(px, x + 1, y + 12, w - 2, 4);
      drawBevelBox(px, x + 1, y - 4, w - 2, 6, '#ff007f');
      px(x + 4, y - 2, 10, 2, '#00f0ff');
      drawBevelBox(px, x + 2, y + 4, w - 4, 10, '#1e1b4b');
      px(x + 3, y + 4, w - 6, 1, '#00f0ff');
      drawBevelBox(px, x + 7, y + 1, 5, 4, '#f43f5e');
      drawBevelBox(px, x + 19, y + 1, 5, 4, '#f43f5e');
      px(x + 9, y - 1 - (tick % 3), 1, 2, 'rgba(255,255,255,0.75)');
      break;
    }
    case 'cryo_tank': {
      drawDropShadow(px, x + 3, y + h - 3, w - 6, 3);
      drawBevelBox(px, x + 3, y, w - 6, h - 1, '#083344');
      drawDitherRect(px, x + 5, y + 3, w - 10, h - 7, '#06b6d4', '#22d3ee', 0.5);
      drawBevelBox(px, x + 3, y, w - 6, 4, '#475569');
      drawBevelBox(px, x + 3, y + h - 4, w - 6, 4, '#475569');
      px(x + 9, y + 7 + (tick % 8), 2, 2, '#ffffff');
      break;
    }
    case 'holo_pod': {
      drawDropShadow(px, x + 2, y + 12, w - 4, 3);
      drawBevelBox(px, x + 2, y + 1, w - 4, 13, '#1e1b4b');
      px(x + 4, y + 4, w - 8, 7, tick % 2 === 0 ? '#a855f7' : '#00f0ff');
      break;
    }
    case 'piano': {
      drawDropShadow(px, x + 1, y + 12, w - 2, 4);
      drawBevelBox(px, x + 2, y - 3, w - 4, 17, '#78350f');
      px(x + 4, y + 5, w - 8, 3, '#f8fafc');
      const keyHit = (tick * 3) % Math.max(4, w - 12);
      px(x + 5 + keyHit, y + 5, 2, 2, '#090d16');
      break;
    }
    case 'water_trough': {
      drawDropShadow(px, x + 1, y + 11, w - 2, 4);
      drawBevelBox(px, x + 2, y + 2, w - 4, 11, '#78350f');
      px(x + 4, y + 4, w - 8, 7, '#0284c7');
      px(x + 6 + (tick % 12), y + 6, 6, 1, '#bae6fd');
      break;
    }
    case 'sandbag_post': {
      drawDropShadow(px, x + 2, y + 14, w - 4, 4);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < w - 8; c += 8) {
          drawBevelBox(px, x + 3 + c + (r % 2) * 2, y + 7 + r * 5, 8, 5, '#a16207');
        }
      }
      drawBevelBox(px, x + 17, y, 5, 9, '#3f4f41');
      px(x + 16, y + 1, 6, 2, '#84cc16');
      break;
    }
    case 'radar_dish': {
      drawDropShadow(px, x + 8, y + 20, 24, 5);
      drawBevelBox(px, x + 13, y + 9, 14, 14, '#475569');
      const sweep = Math.round(Math.sin(time * 3) * 4);
      drawBevelBox(px, x + 7 + sweep, y + 1, 26, 8, '#94a3b8');
      px(x + 19, y - 1, 2, 2, tick % 2 === 0 ? '#ef4444' : '#450a0a');
      break;
    }
    case 'ammo_crates': {
      drawDropShadow(px, x + 1, y + 11, w - 2, 4);
      drawBevelBox(px, x + 2, y + 2, 18, 11, '#3f6212');
      px(x + 5, y + 5, 12, 2, '#eab308');
      drawBevelBox(px, x + 21, y + 4, 17, 9, '#365314');
      break;
    }
    case 'coffee_machine': {
      drawDropShadow(px, x, y + 12, 32, 4);
      drawBevelBox(px, x, y + 3, 32, 12, '#475569');
      drawBevelBox(px, x + 3, y - 5, 14, 9, '#dc2626');
      px(x + 5, y - 3, 10, 2, '#e2e8f0');
      drawBevelBox(px, x + 19, y, 4, 4, '#f8fafc');
      drawBevelBox(px, x + 25, y, 4, 4, '#38bdf8');
      const sy = Math.floor(time * 4) % 4;
      px(x + 8, y - 7 - sy, 1, 2, 'rgba(255,255,255,0.7)');
      break;
    }
    case 'watercooler': {
      drawDropShadow(px, x + 3, y + 13, 10, 3);
      drawBevelBox(px, x + 3, y + 3, 10, 12, '#e2e8f0');
      drawBevelBox(px, x + 4, y - 4, 8, 8, '#38bdf8');
      px(x + 6, y - 2, 2, 4, '#bae6fd');
      break;
    }
    case 'arcade': {
      drawDropShadow(px, x + 1, y + 13, 28, 4);
      drawBevelBox(px, x + 2, y - 5, 26, 21, '#312e81');
      drawBevelBox(px, x + 3, y - 4, 24, 5, '#ec4899');
      const screenCol = Math.floor(time * 5) % 2 === 0 ? '#00f0ff' : '#a855f7';
      px(x + 5, y + 1, 20, 7, '#090d16');
      px(x + 7, y + 2, 16, 5, screenCol);
      px(x + 4, y + 9, 22, 2, '#facc15');
      break;
    }
    case 'bookshelf': {
      const bw = (prop.w || 3) * TILE_SIZE;
      drawDropShadow(px, x + 1, y + 13, bw - 2, 4);
      drawBevelBox(px, x + 1, y - 5, bw - 2, 20, '#78350f');
      px(x + 3, y - 3, bw - 6, 4, '#291709');
      px(x + 3, y + 3, bw - 6, 4, '#291709');
      px(x + 3, y + 9, bw - 6, 4, '#291709');
      const colors = ['#ef4444', '#38bdf8', '#22c55e', '#eab308', '#a855f7', '#f97316'];
      for (let bx = 4; bx < bw - 6; bx += 3) {
        px(x + bx, y - 2, 2, 3, colors[bx % colors.length]);
        px(x + bx, y + 4, 2, 3, colors[(bx + 2) % colors.length]);
        px(x + bx, y + 10, 2, 3, colors[(bx + 4) % colors.length]);
      }
      break;
    }
    case 'sofa': {
      const sw = (prop.w || 4) * TILE_SIZE;
      const col = prop.color || '#be123c';
      drawDropShadow(px, x + 1, y + 12, sw - 2, 4);
      drawBevelBox(px, x + 2, y + 1, sw - 4, 13, col);
      drawBevelBox(px, x + 4, y + 5, sw - 8, 8, getRamp(col).shadow);
      break;
    }
    case 'coffee_table':
    case 'holo_table': {
      const tw = (prop.w || 3) * TILE_SIZE;
      drawDropShadow(px, x + 3, y + 11, tw - 6, 4);
      if (prop.type === 'holo_table') {
        drawBevelBox(px, x + 3, y + 3, tw - 6, 10, '#1e1b4b');
        px(x + 5, y + 5, tw - 10, 6, '#00f0ff');
        const pulse = Math.floor(time * 6) % 3;
        px(x + 10, y + 1 - pulse, tw - 20, 2, '#ffffff');
      } else {
        drawBevelBox(px, x + 3, y + 3, tw - 6, 10, '#855836');
        drawBevelBox(px, x + 13, y + 5, 5, 4, '#f8fafc');
      }
      break;
    }
    case 'server_rack': {
      // Office Only: Data Center Blade Server Rack
      const rw = (prop.w || 2) * TILE_SIZE;
      const rh = (prop.h || 2) * TILE_SIZE;
      drawDropShadow(px, x + 1, y + rh - 3, rw - 2, 4);
      drawBevelBox(px, x + 2, y + 1, rw - 4, rh - 2, '#1e293b');
      const blink = Math.floor(time * 6);
      for (let ry = 4; ry < rh - 5; ry += 4) {
        px(x + 4, y + ry, rw - 8, 3, '#090d16');
        px(x + 6, y + ry + 1, 2, 1, (blink + ry) % 3 === 0 ? '#22c55e' : '#38bdf8');
        px(x + 10, y + ry + 1, 2, 1, (blink + ry) % 2 === 0 ? '#22c55e' : '#f59e0b');
      }
      break;
    }
    case 'cyber_mainframe': {
      // Cyberpunk Equivalent: Liquid-Cooled Neon Neural Core Tower
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#1e1b4b');
      // Glowing vertical plasma coolant tubes
      const pulse = tick % 4;
      drawBevelBox(px, x + 5, y + 4, 8, h - 8, '#083344');
      px(x + 7, y + 5 + pulse, 4, h - 12, '#00f0ff');
      px(x + 8, y + 6 + pulse, 2, 4, '#ffffff');
      drawBevelBox(px, x + 17, y + 4, 8, h - 8, '#4a044e');
      px(x + 19, y + 5 + ((pulse + 2) % 4), 4, h - 12, '#ff007f');
      px(x + 20, y + 6 + ((pulse + 2) % 4), 2, 4, '#ffffff');
      break;
    }
    case 'scroll_rack': {
      // Edo Dojo Equivalent: Cedar Scroll & Bamboo Archive Shelf
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#78350f');
      for (let sy = 5; sy < h - 6; sy += 7) {
        px(x + 4, y + sy, w - 8, 5, '#291709');
        for (let sx = 5; sx < w - 7; sx += 4) {
          px(x + sx, y + sy + 1, 3, 3, '#fef3c7'); // rolled parchment scroll
          px(x + sx + 1, y + sy + 2, 1, 1, '#dc2626'); // red silk ribbon tie
        }
      }
      break;
    }
    case 'katana_rack': {
      // Edo Dojo Equivalent: Lacquered Daisho Katana Stand & Kabuto Display
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 2, w - 4, h - 4, '#450a0a');
      drawBevelBox(px, x + 6, y + 4, 2, h - 8, '#1c1917'); // left upright
      drawBevelBox(px, x + w - 8, y + 4, 2, h - 8, '#1c1917'); // right upright
      // Three mounted katanas (Katana, Wakizashi, Tanto)
      for (let ky = 7; ky <= 21; ky += 7) {
        px(x + 4, y + ky, w - 8, 2, '#e2e8f0');
        px(x + 5, y + ky, 4, 2, '#dc2626'); // tsuka hilt
        px(x + 9, y + ky - 1, 1, 4, '#facc15'); // gold tsuba
      }
      break;
    }
    case 'mana_obelisk': {
      // Medieval Equivalent: Carved Runestone Obelisk with Floating Arcane Crystal
      drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
      drawBevelBox(px, x + 3, y + 14, w - 6, h - 16, '#475569'); // stone pedestal
      const floatY = Math.round(Math.sin(time * 5) * 2);
      drawBevelBox(px, x + 7, y + 3 + floatY, w - 14, 12, '#9333ea');
      px(x + 11, y + 5 + floatY, w - 22, 8, '#e879f9');
      px(x + 13, y + 6 + floatY, 3, 4, '#ffffff');
      break;
    }
    case 'grimoire_shelf': {
      // Medieval Equivalent: Iron-Bound Grimoire & Potion Vault
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#5c3a21');
      for (let sy = 5; sy < h - 6; sy += 8) {
        px(x + 4, y + sy, w - 8, 6, '#1c1917');
        px(x + 6, y + sy + 1, 4, 5, '#991b1b'); // red tome
        px(x + 11, y + sy + 1, 4, 5, '#1e3a8a'); // sapphire tome
        px(x + 17, y + sy + 2, 3, 4, '#22c55e'); // glowing emerald vial
        px(x + 22, y + sy + 1, 4, 5, '#ca8a04'); // gold clasp tome
      }
      break;
    }
    case 'colossus_rack': {
      // WW2 Equivalent: Bletchley Park Colossus Paper-Tape Pulley & Vacuum Tube Frame
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#263028');
      // Spinning yellow paper-tape pulley wheels
      const wheelShift = tick % 2;
      drawBevelBox(px, x + 5, y + 5, 8, 8, '#a16207');
      px(x + 7 + wheelShift, y + 7, 3, 3, '#fef08a');
      drawBevelBox(px, x + 18, y + 5, 8, 8, '#a16207');
      px(x + 20 - wheelShift, y + 7, 3, 3, '#fef08a');
      // Glowing amber vacuum tubes on lower bay
      for (let vx = 6; vx < w - 6; vx += 4) {
        px(x + vx, y + 18, 2, 4, (tick + vx) % 3 === 0 ? '#f97316' : '#facc15');
      }
      break;
    }
    case 'ordnance_rack': {
      // WW2 Equivalent: Olive-Drab Steel Munitions & Field Gear Locker
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#365314');
      drawBevelBox(px, x + 4, y + 4, w - 8, 10, '#141a15');
      for (let rx = 6; rx < w - 6; rx += 4) {
        px(x + rx, y + 5, 2, 8, '#78350f'); // wooden rifle stocks
        px(x + rx, y + 5, 1, 5, '#94a3b8'); // steel barrels
      }
      drawBevelBox(px, x + 4, y + 16, w - 8, 10, '#3f6212');
      px(x + 8, y + 20, w - 16, 2, '#eab308'); // stencil stripe
      break;
    }
    case 'saloon_bar': {
      // Cowboys Equivalent: Mahogany Saloon Bar Counter with Brass Footrail & Whiskey Bottles
      drawDropShadow(px, x + 1, y + 12, w - 2, 4);
      drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#78350f');
      drawBevelBox(px, x, y + 1, w, 4, '#92400e');
      px(x + 2, y + 13, w - 4, 1, '#facc15'); // polished brass footrail
      // Bottles & sarsaparilla mugs on bar top
      px(x + 6, y - 2, 3, 4, '#15803d');
      px(x + 12, y - 3, 3, 5, '#d97706');
      px(x + 22, y - 1, 4, 3, '#fef08a');
      px(x + 36, y - 2, 3, 4, '#dc2626');
      break;
    }
    case 'gold_safe': {
      // Cowboys Equivalent: Cast-Iron Wells Fargo Bullion Safe & Gold Bars
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 2, w - 4, h - 4, '#1c1917');
      px(x + 4, y + 4, w - 8, h - 8, '#292524');
      // Brass combination dial & handle
      drawBevelBox(px, x + 10, y + 10, 8, 8, '#facc15');
      px(x + 13, y + 13, 2, 2, '#78350f');
      // Stacked gold bullion bars on top of safe
      drawBevelBox(px, x + 6, y - 1, 8, 4, '#eab308');
      drawBevelBox(px, x + 16, y - 1, 8, 4, '#facc15');
      break;
    }
    case 'saddle_rack': {
      // Cowboys Equivalent: Timber Saddle & Western Tack Stand
      drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
      drawBevelBox(px, x + 2, y + 2, w - 4, h - 4, '#5c3820');
      drawBevelBox(px, x + 5, y + 5, w - 10, 7, '#92400e'); // upper saddle
      px(x + 8, y + 7, 6, 3, '#facc15'); // brass horn & stirrup
      drawBevelBox(px, x + 5, y + 16, w - 10, 7, '#78350f'); // lower saddle
      px(x + 14, y + 18, 6, 3, '#facc15');
      break;
    }
    case 'wanted_board': {
      // Cowboys Top Wall: Timber Sheriff Bounty Notice Board
      drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#78350f');
      drawBevelBox(px, x + 6, y + 3, 10, 8, '#fef3c7'); // wanted poster 1
      px(x + 9, y + 5, 4, 3, '#92400e');
      drawBevelBox(px, x + 20, y + 4, 9, 7, '#fde68a'); // wanted poster 2
      drawBevelBox(px, x + 34, y + 3, 12, 8, '#fef3c7'); // reward flyer
      break;
    }
    case 'cyber_screen': {
      // Cyberpunk Top Wall: Widescreen Neon Subnet Telemetry Wall Display
      drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#1e1b4b');
      px(x + 4, y + 3, w - 8, 8, '#090d16');
      px(x + 6, y + 5, 16, 1, '#00f0ff');
      px(x + 6, y + 8, 24, 1, '#ff007f');
      px(x + 38, y + 4, 14, 6, '#083344');
      px(x + 40 + (tick % 8), y + 6, 3, 2, '#00f0ff');
      break;
    }
    case 'shodo_banner': {
      // Edo Dojo Top Wall: Framed Black-and-Gold Kanji Calligraphic Banner
      drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#78350f');
      px(x + 4, y + 3, w - 8, 8, '#fef9c3');
      // Bold sumi-e ink strokes & red hanko seal
      px(x + 10, y + 5, 8, 2, '#1c1917');
      px(x + 22, y + 4, 6, 5, '#1c1917');
      px(x + 34, y + 5, 10, 2, '#1c1917');
      px(x + 50, y + 7, 3, 3, '#dc2626'); // hanko seal
      break;
    }
    case 'royal_banner': {
      // Medieval Top Wall: Crimson & Gold Heraldic Tapestry Banner
      drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#991b1b');
      px(x + 4, y + 2, w - 8, 1, '#facc15');
      px(x + 4, y + 10, w - 8, 1, '#facc15');
      // Golden lion/crown emblem in center
      drawBevelBox(px, x + 24, y + 3, 14, 7, '#eab308');
      px(x + 28, y + 5, 6, 3, '#fef08a');
      break;
    }
    case 'bunker_map_board': {
      // WW2 Top Wall: Allied Sector Operations Wall Map
      drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#365314');
      px(x + 4, y + 3, w - 8, 8, '#14532d');
      px(x + 8, y + 5, 16, 4, '#22c55e');
      px(x + 14, y + 6, 4, 2, '#ef4444'); // front line pin
      px(x + 32, y + 4, 18, 5, '#eab308');
      break;
    }
    case 'war_map_table': {
      // WW2 Table Fallback if sprite not yet loaded
      drawDropShadow(px, x + 2, y + 11, w - 4, 4);
      drawBevelBox(px, x + 2, y + 2, w - 4, 11, '#263028');
      px(x + 4, y + 4, w - 8, 7, '#15803d');
      break;
    }
    case 'dojo_bamboo': {
      // Edo Dojo Planter: Black Glazed Ceramic Planter with Tall Green Bamboo Stalks
      drawDropShadow(px, x + 2, y + 12, 12, 3);
      drawBevelBox(px, x + 3, y + 9, 10, 6, '#1c1917');
      px(x + 5, y + 1, 2, 9, '#15803d');
      px(x + 8, y - 1, 2, 11, '#22c55e');
      px(x + 11, y + 2, 2, 8, '#16a34a');
      px(x + 4, y + 2, 4, 2, '#4ade80');
      px(x + 9, y, 5, 2, '#86efac');
      break;
    }
    case 'whiteboard': {
      const ww = (prop.w || 4) * TILE_SIZE;
      drawBevelBox(px, x + 2, y + 1, ww - 4, 12, '#f8fafc');
      px(x + 6, y + 5, 14, 1, '#ef4444');
      px(x + 6, y + 8, 22, 1, '#3b82f6');
      px(x + 34, y + 4, 12, 5, '#10b981');
      break;
    }
    case 'clock': {
      drawBevelBox(px, x + 4, y + 2, 8, 8, '#f8fafc');
      px(x + 7, y + 4, 1, 3, '#0f172a');
      px(x + 7, y + 6, 3, 1, '#ef4444');
      break;
    }
    case 'campfire': {
      drawDropShadow(px, x + 4, y + 12, 24, 4);
      drawBevelBox(px, x + 5, y + 9, 22, 6, '#451a03');
      const f = Math.floor(time * 8) % 3;
      px(x + 8, y + 3 - f, 16, 8, '#dc2626');
      px(x + 10, y + 4 - f, 12, 6, '#f97316');
      px(x + 12, y + 5 - f, 8, 4, '#fef08a');
      px(x + 14, y + 6 - f, 4, 2, '#ffffff');
      break;
    }
    case 'barrel': {
      drawDropShadow(px, x + 3, y + 12, 26, 4);
      drawBevelBox(px, x + 4, y + 1, 24, 13, '#78350f');
      px(x + 4, y + 4, 24, 2, '#94a3b8');
      px(x + 4, y + 9, 24, 2, '#94a3b8');
      break;
    }
    case 'plant':
    default: {
      drawDropShadow(px, x + 3, y + 12, 10, 3);
      drawBevelBox(px, x + 4, y + 8, 8, 7, '#b45309');
      drawBevelBox(px, x + 3, y + 2, 10, 7, '#16a34a');
      px(x + 5, y + 1, 6, 3, '#4ade80');
      break;
    }
  }
}

function drawCompanion(
  px: PxFn,
  drawImg: DrawImgFn,
  spriteImg: HTMLImageElement | undefined,
  pet: SceneCompanion,
  time: number,
) {
  const x = Math.round(pet.x - 6);
  const y = Math.round(pet.y - 8);
  const bob = pet.path.length > 0 ? pet.frame : 0;
  const ramp = getRamp(pet.color);

  drawDropShadow(px, x + 1, y + 9, 10, 3);

  if (spriteImg) {
    drawImg(spriteImg, x, y - bob, 12, 12);
  } else if (pet.type === 'robot') {
    drawBevelBox(px, x + 1, y + 2 - bob, 10, 7, pet.color);
    px(x + 4, y + 4 - bob, 4, 2, '#00f0ff');
    px(x + 5, y + 4 - bob, 2, 1, '#ffffff');
    px(x + 2, y + 9, 2, 2, ramp.outline);
    px(x + 8, y + 9, 2, 2, ramp.outline);
  } else {
    // Hi-Bit Shaded Pixel Cat / Corgi with sel-out contour
    drawBevelBox(px, x + 2, y + 4 - bob, 8, 5, pet.color);
    const hx = pet.dir === 'right' ? x + 6 : x + 1;
    drawBevelBox(px, hx, y + 1 - bob, 5, 5, pet.color);
    px(hx, y - bob, 2, 2, ramp.outline); // ear L
    px(hx + 3, y - bob, 2, 2, ramp.outline); // ear R
    px(hx + (pet.dir === 'right' ? 3 : 1), y + 3 - bob, 1, 1, '#090d16'); // eye
    const tailWag = Math.floor(time * 6) % 2;
    const tx = pet.dir === 'right' ? x : x + 10;
    px(tx, y + 2 - tailWag, 2, 4, ramp.base);
    px(x + 2, y + 9, 2, 2, '#ffffff');
    px(x + 7, y + 9, 2, 2, '#ffffff');
  }

  if (pet.heartTimer > 0) {
    const hy = y - 6 - Math.round((1 - pet.heartTimer) * 4);
    px(x + 3, hy, 2, 2, '#f43f5e');
    px(x + 6, hy, 2, 2, '#f43f5e');
    px(x + 4, hy + 2, 3, 2, '#f43f5e');
  }
}

/**
 * Renders a 16x22 Hi-Bit Chibi Pixel Character (inspired by Enter the Gungeon / Owlboy / Tower 57)
 * with complete 1px selective dark outline (sel-out), 4-tone hue-shifted shading,
 * expressive blinking eyes with sclera & specular glint, volumetric hair, and detailed gear.
 */
function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  px: PxFn,
  drawImg: DrawImgFn,
  spriteImg: HTMLImageElement | undefined,
  ch: SceneCharacter,
  style: CharacterStyle,
  spawnEffectType: string,
  spawnColor: string,
  isSelected: boolean,
  isHovered: boolean,
  time: number,
) {
  const sitOffset = ch.animState === 'type' ? -3 : 0;
  const walkBob = ch.animState === 'walk' && ch.frame % 2 === 1 ? -1 : 0;
  const idleBob = ch.animState === 'idle' && ch.frame === 1 ? 1 : 0;

  const bx = Math.round(ch.x - 8);
  const by = Math.round(ch.y - 16 + sitOffset + walkBob + idleBob);

  if (ch.spawnEffect) {
    const p = ch.spawnEffect === 'spawn' ? ch.spawnProgress : 1 - ch.spawnProgress;
    drawSpawnEffect(ctx, px, bx, by, p, ch.spawnSeeds, spawnEffectType, spawnColor || '#22c55e', time);
    if (p < 0.35) return;
  }

  // Multi-step Hi-Bit Ground Contact Shadow
  drawDropShadow(px, bx + 2, Math.round(ch.y - 2), 12, 3);

  // Selection / Hover Pixel Halo
  if (isSelected || isHovered) {
    const outColor = isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)';
    px(bx + 1, by - 2, 14, 20, outColor);
  }

  if (spriteImg && ch.dir !== 'up') {
    const framesCount = Math.max(1, Math.floor(spriteImg.width / 16));
    const frameW = Math.floor(spriteImg.width / framesCount);
    const frameIdx =
      ch.animState === 'walk'
        ? ch.frame % framesCount
        : ch.animState === 'type'
          ? (framesCount - 1) % framesCount
          : 0;
    drawImg(spriteImg, bx, by - 2, 16, 20, frameIdx * frameW, 0, frameW, spriteImg.height);
    return;
  }

  const coat = getRamp(style.primary || '#6366f1');
  const pants = getRamp(style.secondary || '#1e293b');
  const skin = getRamp(style.skin || '#fed7aa');
  const hair = getRamp(style.hair || '#818cf8');
  const selOut = coat.outline;

  // 1. LEGS & BOOTS (with 1px sel-out & specular boot tips)
  if (ch.animState === 'type') {
    px(bx + 3, by + 12, 10, 4, selOut);
    px(bx + 4, by + 13, 3, 2, pants.base);
    px(bx + 9, by + 13, 3, 2, pants.base);
  } else if (ch.animState === 'walk') {
    const lOff = ch.frame === 1 ? -1 : ch.frame === 3 ? 1 : 0;
    const rOff = -lOff;
    // Left leg
    px(bx + 3, by + 12 + lOff, 5, 5, selOut);
    px(bx + 4, by + 12 + lOff, 3, 3, pants.base);
    px(bx + 4, by + 12 + lOff, 1, 3, pants.light);
    px(bx + 4, by + 15 + lOff, 3, 1, '#1e293b'); // boot
    // Right leg
    px(bx + 8, by + 12 + rOff, 5, 5, selOut);
    px(bx + 9, by + 12 + rOff, 3, 3, pants.shadow);
    px(bx + 9, by + 15 + rOff, 3, 1, '#1e293b');
  } else {
    px(bx + 3, by + 12, 10, 5, selOut);
    px(bx + 4, by + 12, 3, 3, pants.base);
    px(bx + 4, by + 12, 1, 3, pants.light);
    px(bx + 9, by + 12, 3, 3, pants.shadow);
    px(bx + 4, by + 15, 3, 1, '#334155'); // boot highlight
    px(bx + 9, by + 15, 3, 1, '#1e293b');
  }

  // 2. TORSO, COLLAR, BELT & JACKET (with sel-out contour & 3-tone shading)
  px(bx + 2, by + 6, 12, 7, selOut); // torso outer silhouette
  px(bx + 3, by + 7, 10, 5, coat.base);
  px(bx + 3, by + 7, 2, 5, coat.light); // left sunlit shoulder/chest
  px(bx + 11, by + 7, 2, 5, coat.shadow); // right shaded torso
  // Inner shirt / tie / armor breastplate detail
  px(bx + 6, by + 7, 4, 4, coat.spec);
  px(bx + 7, by + 8, 2, 3, coat.deepShadow);
  // Leather belt & gold buckle
  px(bx + 3, by + 11, 10, 1, pants.outline);
  px(bx + 7, by + 11, 2, 1, '#facc15');

  // 3. ARMS & HANDS (with sel-out & cuffed sleeves)
  if (ch.animState === 'type') {
    const tL = ch.frame === 0 ? -1 : 0;
    const tR = ch.frame === 1 ? -1 : 0;
    px(bx + 1, by + 6 + tL, 3, 5, selOut);
    px(bx + 2, by + 7 + tL, 2, 3, coat.light);
    px(bx + 2, by + 6 + tL, 2, 1, skin.base);
    px(bx + 12, by + 6 + tR, 3, 5, selOut);
    px(bx + 12, by + 7 + tR, 2, 3, coat.shadow);
    px(bx + 12, by + 6 + tR, 2, 1, skin.base);
  } else {
    const swing = ch.animState === 'walk' && ch.frame % 2 === 1 ? 1 : 0;
    px(bx + 1, by + 6 + swing, 3, 6, selOut);
    px(bx + 2, by + 7 + swing, 2, 3, coat.light);
    px(bx + 2, by + 10 + swing, 2, 1, skin.base);
    px(bx + 12, by + 6 - swing, 3, 6, selOut);
    px(bx + 12, by + 7 - swing, 2, 3, coat.shadow);
    px(bx + 12, by + 10 - swing, 2, 1, skin.shadow);
  }

  // 4. HEAD, FACE, BLINKING EYES & VOLUMETRIC HAIR
  px(bx + 2, by - 1, 12, 8, selOut); // head silhouette outline
  px(bx + 3, by, 10, 6, skin.base);
  px(bx + 3, by + 5, 10, 1, skin.shadow); // chin shadow
  px(bx + 4, by + 1, 8, 1, skin.light); // forehead warmth

  if (ch.dir === 'up') {
    // Back of head: full shaded hair volume
    px(bx + 3, by, 10, 6, hair.base);
    px(bx + 4, by, 8, 2, hair.light);
    px(bx + 5, by + 1, 4, 1, hair.spec);
    px(bx + 3, by + 4, 10, 2, hair.shadow);
  } else {
    // Hair crown, bangs & sideburns
    px(bx + 3, by - 1, 10, 2, hair.base);
    px(bx + 4, by - 1, 6, 1, hair.spec); // specular hair halo
    px(bx + 3, by + 1, 1, 3, hair.shadow); // left sideburn
    px(bx + 12, by + 1, 1, 3, hair.shadow); // right sideburn

    // Expressive eyes with natural periodic blink
    const isBlinking = (Math.floor(time * 4 + ch.hueOffset) % 19) === 0;
    const eyeShift = ch.dir === 'left' ? -1 : ch.dir === 'right' ? 1 : 0;
    const lx = bx + 5 + eyeShift;
    const rx = bx + 9 + eyeShift;

    // Rosy cheek pixels
    px(bx + 4, by + 4, 1, 1, '#fda4af');
    px(bx + 11, by + 4, 1, 1, '#fda4af');

    if (isBlinking) {
      px(lx, by + 3, 2, 1, selOut);
      px(rx, by + 3, 2, 1, selOut);
    } else {
      // White sclera + dark pupil + top brow
      px(lx, by + 2, 2, 2, '#ffffff');
      px(rx, by + 2, 2, 2, '#ffffff');
      px(lx + (ch.dir === 'left' ? 0 : 1), by + 2, 1, 2, '#090d16');
      px(rx + (ch.dir === 'left' ? 0 : 1), by + 2, 1, 2, '#090d16');
    }
  }

  // 5. HI-BIT ACCESSORIES
  switch (style.accessory) {
    case 'visor':
      if (ch.dir !== 'up') {
        px(bx + 3, by + 2, 10, 2, '#00f0ff');
        px(bx + 4, by + 2, 4, 1, '#ffffff');
      }
      break;
    case 'headphones':
      px(bx + 2, by + 1, 2, 4, '#e2e8f0');
      px(bx + 12, by + 1, 2, 4, '#94a3b8');
      px(bx + 4, by - 2, 8, 1, '#cbd5e1');
      break;
    case 'glasses':
      if (ch.dir !== 'up') {
        px(bx + 4, by + 2, 3, 2, '#38bdf8');
        px(bx + 9, by + 2, 3, 2, '#38bdf8');
        px(bx + 7, by + 2, 2, 1, '#e2e8f0');
      }
      break;
    case 'wizard_hat':
      drawBevelBox(px, bx + 1, by - 1, 14, 2, style.primary);
      drawBevelBox(px, bx + 3, by - 4, 10, 3, style.primary);
      drawBevelBox(px, bx + 5, by - 7, 6, 3, style.primary);
      px(bx + 4, by - 2, 8, 1, '#facc15');
      break;
    case 'crown':
      drawBevelBox(px, bx + 3, by - 3, 10, 3, '#facc15');
      px(bx + 4, by - 4, 2, 1, '#fef08a');
      px(bx + 7, by - 4, 2, 2, '#ef4444');
      px(bx + 10, by - 4, 2, 1, '#fef08a');
      break;
    case 'samurai':
      drawBevelBox(px, bx + 5, by - 3, 6, 3, style.hair);
      px(bx + 3, by, 10, 1, '#ef4444');
      px(bx + 7, by - 1, 2, 2, '#facc15'); // gold maedate crest
      break;
    case 'spiky':
      px(bx + 4, by - 3, 2, 2, hair.spec);
      px(bx + 7, by - 4, 2, 3, hair.light);
      px(bx + 10, by - 3, 2, 2, hair.base);
      break;
    case 'beanie':
      drawBevelBox(px, bx + 3, by - 3, 10, 3, style.primary);
      px(bx + 7, by - 4, 2, 1, '#f8fafc');
      break;
    case 'cowboy_hat':
      drawBevelBox(px, bx, by - 1, 16, 2, '#78350f');
      drawBevelBox(px, bx + 3, by - 4, 10, 3, '#92400e');
      px(bx + 4, by - 2, 8, 1, '#facc15');
      break;
    case 'helmet':
      drawBevelBox(px, bx + 2, by - 3, 12, 4, '#3f6212');
      px(bx + 7, by - 2, 2, 1, '#facc15');
      break;
  }
}

function drawSpawnEffect(
  ctx: CanvasRenderingContext2D,
  px: PxFn,
  bx: number,
  by: number,
  progress: number,
  seeds: number[],
  effectType: string,
  color: string,
  time: number,
) {
  ctx.save();
  if (effectType === 'beam') {
    ctx.globalAlpha = (1 - Math.abs(progress - 0.5) * 1.6) * 0.85;
    px(bx + 2, by - 20, 12, 38, color);
    px(bx + 5, by - 20, 6, 38, '#ffffff');
  } else if (effectType === 'portal') {
    ctx.globalAlpha = 0.85;
    const r = Math.round(4 + progress * 8);
    px(bx + 8 - r, by + 14, r * 2, 3, color);
    px(bx + 4, by + 2 + Math.round(Math.sin(time * 12) * 3), 8, 2, '#fef08a');
  } else {
    for (let col = 0; col < 14; col++) {
      const seed = seeds[col % seeds.length] || 0;
      const headY = Math.floor((progress + seed) * 24) - 4;
      for (let trail = 0; trail < 7; trail++) {
        const py = by + headY - trail * 2;
        if (py < by - 6 || py > by + 18) continue;
        if (trail === 0) {
          ctx.globalAlpha = 0.95;
          px(bx + 1 + col, py, 1, 2, '#ffffff');
        } else {
          ctx.globalAlpha = Math.max(0.15, 0.85 - trail * 0.12);
          px(bx + 1 + col, py, 1, 2, color);
        }
      }
    }
  }
  ctx.restore();
}
