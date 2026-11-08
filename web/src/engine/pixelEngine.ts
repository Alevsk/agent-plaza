import type {
  AgentSession,
  CharacterStyle,
  TemplateManifest,
  TemplateProp,
  TemplateWorkstation,
} from '../types';

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
      // Trigger brief spawn effect on template switch & re-bind workstations
      this.stationOccupancy.clear();
      for (const ch of this.characters.values()) {
        ch.assignedStationId = null;
        ch.spawnEffect = 'spawn';
        ch.spawnProgress = 0;
      }
      this.reassignAllAgents();
    }

    // Initialize companions
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

    // Initialize ambient particles
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

    // Mark workstation desks (not seats) as blocked
    for (const ws of this.template.workstations || []) {
      this.blockedTiles.add(`${ws.col},${ws.row}`);
      this.blockedTiles.add(`${ws.col + 1},${ws.row}`);
    }

    // Mark props as blocked
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
    const count = 28;

    for (let i = 0; i < count; i++) {
      let color = '#ffffff';
      let vy = -3 - Math.random() * 4;
      let vx = (Math.random() - 0.5) * 4;
      if (mode === 'neon') {
        color = i % 2 === 0 ? '#00f0ff' : '#ff007f';
        vy = 10 + Math.random() * 14;
        vx = 0;
      } else if (mode === 'embers') {
        color = i % 2 === 0 ? '#f59e0b' : '#ef4444';
        vy = -8 - Math.random() * 8;
      } else if (mode === 'leaves') {
        color = '#f472b6';
        vy = 5 + Math.random() * 5;
        vx = 4 + Math.random() * 4;
      }
      this.particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx,
        vy,
        size: 1,
        alpha: 0.2 + Math.random() * 0.45,
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

    // Mark removed agents for despawn effect
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

    // Add or update active agents
    agents.forEach((ag, index) => {
      const existing = this.characters.get(ag.id);
      if (!existing) {
        // New character joining
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
    // Live-joining agents spawn in the central entrance corridor and walk to their spot
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
      // Idle: release workstation and walk to a waypoint or lounge tile
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
          // Spread initial idle characters across walkable lounge/corridor tiles
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
    // Search nearby walkable tiles
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
    const walkSpeed = 46; // logical px per sec

    // Update characters
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

    // Update companions
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

    // Update ambient particles
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

// ── Rendering Pipeline ──────────────────────────────────────────────────────

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

  const px = (lx: number, ly: number, lw = 1, lh = 1, color?: string) => {
    if (color) ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(offsetX + lx * zoom),
      Math.round(offsetY + ly * zoom),
      Math.ceil(lw * zoom),
      Math.ceil(lh * zoom),
    );
  };

  // 1. Floor & Wall Tiles
  const { cols, rows, layout } = tpl.grid;
  for (let r = 0; r < rows; r++) {
    const line = layout[r] || '';
    for (let c = 0; c < cols; c++) {
      const ch = line[c] || 'W';
      const tx = c * TILE_SIZE;
      const ty = r * TILE_SIZE;

      if (ch === 'W') {
        // 3D Pixel Wall
        px(tx, ty, TILE_SIZE, TILE_SIZE, tpl.theme.wall_color);
        px(tx, ty, TILE_SIZE, 3, tpl.theme.wall_trim);
        px(tx, ty + TILE_SIZE - 2, TILE_SIZE, 2, '#111622');
        if ((c + r) % 2 === 0) {
          px(tx + 3, ty + 6, 4, 2, 'rgba(255,255,255,0.04)');
        }
      } else {
        // Floor tile with plank/checker pattern
        const isAlt = (c + r) % 2 === 0;
        let baseColor = isAlt ? tpl.theme.floor_primary : tpl.theme.floor_secondary;
        if (ch === 'C') {
          baseColor = tpl.theme.floor_accent;
        } else if (ch === 'L') {
          baseColor = isAlt ? tpl.theme.floor_secondary : tpl.theme.floor_primary;
        }
        px(tx, ty, TILE_SIZE, TILE_SIZE, baseColor);

        // Subtle pixel floor texture
        if (ch === 'C') {
          px(tx + 1, ty + 1, 14, 14, 'rgba(255,255,255,0.025)');
          if (isAlt) px(tx + 7, ty + 7, 2, 2, 'rgba(255,255,255,0.04)');
        } else if (ch === 'L') {
          px(tx, ty + 15, TILE_SIZE, 1, 'rgba(0,0,0,0.18)');
          px(tx + 15, ty, 1, TILE_SIZE, 'rgba(0,0,0,0.12)');
        } else {
          px(tx, ty + 7, TILE_SIZE, 1, 'rgba(0,0,0,0.15)');
          px(tx, ty + 15, TILE_SIZE, 1, 'rgba(0,0,0,0.15)');
        }
      }
    }
  }

  // 2. Zone Overlays & Corner Ticks
  for (const z of tpl.zones || []) {
    const zx = z.col * TILE_SIZE;
    const zy = z.row * TILE_SIZE;
    const zw = z.w * TILE_SIZE;
    const zh = z.h * TILE_SIZE;

    ctx.save();
    ctx.globalAlpha = 0.08;
    px(zx, zy, zw, zh, z.color);
    ctx.globalAlpha = 0.45;
    // Pixel corner brackets
    px(zx, zy, 6, 1, z.color);
    px(zx, zy, 1, 6, z.color);
    px(zx + zw - 6, zy, 6, 1, z.color);
    px(zx + zw - 1, zy, 1, 6, z.color);
    px(zx, zy + zh - 1, 6, 1, z.color);
    px(zx, zy + zh - 6, 1, 6, z.color);
    px(zx + zw - 6, zy + zh - 1, 6, 1, z.color);
    px(zx + zw - 1, zy + zh - 6, 1, 6, z.color);
    ctx.restore();

    // Zone Header Label
    ctx.save();
    const fontSize = Math.max(9, Math.round(3.2 * zoom));
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(z.label, offsetX + (zx + 4) * zoom + 1, offsetY + (zy + 6) * zoom + 1);
    ctx.fillStyle = z.color;
    ctx.globalAlpha = 0.75;
    ctx.fillText(z.label, offsetX + (zx + 4) * zoom, offsetY + (zy + 6) * zoom);
    ctx.restore();
  }

  // 3. Collect Z-Sorted Drawables (Workstations, Props, Companions, Characters)
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

  // Workstations
  for (const ws of tpl.workstations || []) {
    const occupantId = world.stationOccupancy.get(ws.id);
    const occupant = occupantId ? world.characters.get(occupantId) : undefined;
    const isWorkingHere =
      !!occupant &&
      occupant.session.status === 'working' &&
      occupant.animState === 'type' &&
      occupant.path.length === 0;
    const wsSprite = world.getSpriteImage(ws.sprite);

    // Desk draws at ws.row, chair draws behind/in-front appropriately
    drawables.push({
      zY: (ws.row + 1) * TILE_SIZE,
      draw: () =>
        drawWorkstation(px, drawImg, wsSprite, ws, isWorkingHere, world.globalTime),
    });

    // Chair at seat_col, seat_row
    drawables.push({
      zY: ws.seat_row * TILE_SIZE + 2,
      draw: () =>
        drawChair(px, ws.seat_col * TILE_SIZE, ws.seat_row * TILE_SIZE, ws.glow_color, ws.style),
    });
  }

  // Props
  for (const prop of tpl.props || []) {
    const propSprite = world.getSpriteImage(prop.sprite);
    drawables.push({
      zY: (prop.row + (prop.h || 1)) * TILE_SIZE,
      draw: () => drawProp(px, drawImg, propSprite, prop, world.globalTime),
    });
  }

  // Companions
  for (const pet of world.companions) {
    const petSprite = world.getSpriteImage(pet.sprite);
    drawables.push({
      zY: pet.y + 6,
      draw: () => drawCompanion(px, drawImg, petSprite, pet, world.globalTime),
    });
  }

  // Characters
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

  // 4. Ambient Particles
  ctx.save();
  for (const p of world.particles) {
    ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(world.globalTime * 2 + p.phase));
    px(p.x, p.y, p.size, p.size, p.color);
  }
  ctx.restore();

  return { offsetX, offsetY };
}

// ── Pixel Art Sprite Primitives ─────────────────────────────────────────────

type PxFn = (lx: number, ly: number, lw?: number, lh?: number, color?: string) => void;
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
  // Standing / floor mat stations (no chair blocking the craft)
  if (
    style === 'office_standing' ||
    style === 'cowboy_horse_stall' ||
    style === 'cowboy_blacksmith' ||
    style === 'cowboy_gold_panning' ||
    style === 'dojo_katana_forge' ||
    style === 'medieval_alchemy' ||
    style === 'medieval_blacksmith' ||
    style === 'ww2_bombe_drum' ||
    style === 'ww2_field_mechanic'
  ) {
    // Subtle anti-fatigue / stone / hay standing mat
    px(x + 3, y + 8, 10, 5, 'rgba(0,0,0,0.28)');
    px(x + 4, y + 9, 8, 3, accent);
    px(x + 5, y + 9, 6, 3, 'rgba(0,0,0,0.55)');
    return;
  }

  // Edo Dojo Zabuton Floor Cushion
  if (style.startsWith('dojo_') || style === 'tatami_desk') {
    px(x + 2, y + 7, 12, 6, '#9f1239');
    px(x + 3, y + 8, 10, 4, '#be123c');
    px(x + 6, y + 9, 4, 2, '#facc15');
    return;
  }

  // Cowboy / Medieval Wooden Stool
  if (style.startsWith('cowboy_') || style.startsWith('medieval_') || style === 'saloon_table' || style === 'arcane_tome') {
    px(x + 4, y + 10, 2, 4, '#451a03');
    px(x + 10, y + 10, 2, 4, '#451a03');
    px(x + 3, y + 7, 10, 3, '#78350f');
    px(x + 4, y + 7, 8, 1, '#92400e');
    return;
  }

  // Cyberpunk Reclining Netrunner Pod Seat
  if (style === 'cyber_netrunner_chair') {
    px(x + 2, y + 5, 12, 9, '#0f172a');
    px(x + 3, y + 6, 10, 7, '#1e1b4b');
    px(x + 2, y + 5, 12, 1, accent);
    px(x + 2, y + 13, 12, 1, accent);
    return;
  }

  // Default Rolling Office / Bunker Chair (16x16)
  px(x + 4, y + 11, 8, 2, '#111827'); // wheel base
  px(x + 3, y + 13, 2, 2, '#374151');
  px(x + 11, y + 13, 2, 2, '#374151');
  px(x + 7, y + 9, 2, 3, '#4b5563'); // stem
  px(x + 3, y + 6, 10, 4, '#1f2937'); // cushion
  px(x + 4, y + 6, 8, 1, accent); // accent trim
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
    drawImg(spriteImg, x, y - 4, 32, 20);
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. COWBOYS WORKSTATIONS (Horses, Blacksmith Forge, Gold Panning, Leatherwork, Telegraph, Gunsmith)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'cowboy_horse_stall') {
    // Wooden Hitching Post & Corral Rails
    px(x, y + 2, 2, 13, '#451a03');
    px(x + 30, y + 2, 2, 13, '#451a03');
    px(x, y + 4, 32, 2, '#78350f');
    px(x, y + 9, 32, 1, '#5c3820');
    // Hay bale on left + water bucket on right
    px(x + 2, y + 9, 6, 5, '#eab308');
    px(x + 3, y + 10, 4, 1, '#ca8a04');
    px(x + 25, y + 10, 5, 4, '#57534e');
    px(x + 26, y + 10, 3, 2, '#38bdf8');
    // Pixel Horse in stall! Coat color varies by column
    const coat = ws.col % 3 === 0 ? '#92400e' : ws.col % 3 === 1 ? '#d97706' : '#e7e5e4';
    const mane = ws.col % 3 === 2 ? '#1c1917' : '#fef3c7';
    const headBob = active ? (tick % 2) : 0;
    const tailSwish = active ? (tick % 3) - 1 : 0;
    // Horse legs
    px(x + 11, y + 10, 2, 5, coat);
    px(x + 14, y + 10, 2, 5, coat);
    px(x + 19, y + 10, 2, 5, coat);
    px(x + 22, y + 10, 2, 5, coat);
    // Horse body & saddle
    px(x + 11, y + 5, 13, 5, coat);
    px(x + 15, y + 4, 5, 4, '#451a03'); // western saddle
    px(x + 16, y + 5, 3, 2, '#b45309');
    // Horse neck, head & ears
    px(x + 9, y + 2 + headBob, 4, 5, coat);
    px(x + 7, y + 3 + headBob, 3, 3, coat); // muzzle
    px(x + 9, y + 0 + headBob, 1, 2, coat); // ear
    px(x + 11, y + 0 + headBob, 1, 2, coat);
    px(x + 10, y + 1 + headBob, 3, 4, mane); // mane
    px(x + 8, y + 3 + headBob, 1, 1, '#090d16'); // eye
    // Horse tail
    px(x + 24, y + 5, 2, 5 + tailSwish, mane);
    if (active) {
      // Grooming brush / heart sparkle
      px(x + 16, y + 1 - (tick % 2), 2, 2, '#facc15');
    }
    return;
  }

  if (ws.style === 'cowboy_blacksmith' || ws.style === 'medieval_blacksmith') {
    const isMed = ws.style === 'medieval_blacksmith';
    // Brick / Stone Coal Forge on Left (14px wide)
    px(x + 1, y + 1, 13, 13, isMed ? '#374151' : '#7c2d12');
    px(x + 2, y + 2, 11, 11, '#1c1917');
    // Glowing coal bed & animated flames
    const f = tick % 3;
    px(x + 3, y + 5, 9, 5, '#dc2626');
    px(x + 4, y + 4 - f, 7, 5, '#f97316');
    px(x + 5, y + 5 - (f % 2), 5, 3, '#facc15');
    // Heavy Iron Anvil in Center-Right
    px(x + 17, y + 10, 8, 4, '#4b5563'); // wooden block base
    px(x + 16, y + 7, 10, 3, '#1f2937'); // anvil body
    px(x + 14, y + 6, 13, 2, '#374151'); // anvil face & horn
    // Quenching water barrel on far right
    px(x + 27, y + 6, 4, 8, '#78350f');
    px(x + 28, y + 6, 2, 2, '#38bdf8');
    if (active) {
      // Glowing red-hot blade/horseshoe on anvil + flying golden sparks!
      px(x + 17, y + 5, 6, 1, '#f97316');
      px(x + 19, y + 5, 3, 1, '#fef08a');
      // Flying sparks
      px(x + 16 + (tick % 7), y + 2 - (tick % 3), 1, 1, '#fef08a');
      px(x + 22 - (tick % 5), y + 1 - ((tick + 1) % 3), 1, 1, '#f97316');
    }
    return;
  }

  if (ws.style === 'cowboy_gold_panning') {
    // Wooden Prospector Sluice Trough with Flowing Water & Gold Nuggets
    px(x + 1, y + 4, 30, 10, '#78350f');
    px(x + 2, y + 5, 28, 7, '#0284c7'); // flowing creek water
    // Riffle bars & water ripples
    for (let rx = 5; rx < 27; rx += 5) {
      px(x + rx, y + 5, 1, 7, '#451a03');
      const wave = (tick + rx) % 4;
      px(x + rx + 1, y + 6 + wave, 3, 1, '#7dd3fc');
    }
    // Gold pan & glinting nuggets
    px(x + 11, y + 6, 6, 5, '#334155');
    if (active) {
      px(x + 12 + (tick % 3), y + 7, 2, 2, '#facc15');
      px(x + 15, y + 9 - (tick % 2), 2, 1, '#fef08a');
      px(x + 21, y + 7 + (tick % 2), 2, 2, '#facc15');
    }
    return;
  }

  if (ws.style === 'cowboy_leatherwork') {
    // Saddlery Workbench + Western Saddle on Sawhorse
    px(x + 1, y + 4, 30, 9, '#78350f');
    px(x + 1, y + 3, 30, 2, '#92400e');
    // Leather hide roll & saddle being stitched
    px(x + 4, y + 1, 10, 6, '#b45309');
    px(x + 6, y + 2, 6, 4, '#d97706');
    px(x + 18, y + 1, 9, 5, '#451a03'); // saddle tree
    if (active) {
      px(x + 8 + (tick % 4), y + 3, 2, 1, '#facc15'); // brass rivets glinting
      px(x + 20, y + 2 + (tick % 2), 4, 1, glow);
    }
    return;
  }

  if (ws.style === 'cowboy_gunsmith') {
    // Wheelwright & Frontier Tinker Bench with Spoked Wagon Wheel
    px(x + 1, y + 4, 30, 9, '#5c3820');
    px(x + 1, y + 3, 30, 2, '#78350f');
    // Wagon wheel on left
    px(x + 4, y - 1, 8, 8, '#92400e');
    px(x + 6, y + 1, 4, 4, '#1c1917');
    px(x + 7, y + 2, 2, 2, '#facc15');
    // Blueprint & oil lamp on right
    px(x + 15, y + 2, 9, 5, '#1e3a8a');
    px(x + 26, y + 0, 3, 5, active ? '#facc15' : '#ca8a04');
    if (active) {
      px(x + 17, y + 4, 5, 1, '#93c5fd');
    }
    return;
  }

  if (ws.style === 'cowboy_telegraph' || ws.style === 'saloon_table') {
    // Wild West Saloon Frontier Desk + Brass Telegraph + Ledger
    px(x + 1, y + 4, 30, 9, '#78350f');
    px(x + 1, y + 3, 30, 2, '#92400e');
    px(x + 2, y + 13, 3, 3, '#451a03');
    px(x + 27, y + 13, 3, 3, '#451a03');
    px(x + 5, y + 2, 11, 6, '#fef3c7');
    if (active) {
      const step = tick % 4;
      px(x + 7, y + 4, 5 + step, 1, '#451a03');
      px(x + 7, y + 6, 7 - (step % 3), 1, glow);
    }
    px(x + 20, y + 3, 5, 3, '#facc15');
    px(x + 25, y + 0, 4, 5, active ? glow : '#d97706');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CYBERPUNK WORKSTATIONS (Netrunner Chair, Holo Pillar, Ripperdoc, Synth Rack, Drone Rig, Triple Deck)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'cyber_netrunner_chair') {
    // Overhead Cyber-Dive Arch + Triple Visor Screens + Glowing Neural Cables
    px(x + 2, y + 2, 28, 11, '#0f172a');
    px(x + 2, y + 1, 28, 2, glow);
    // Overhead curved holo-screens
    px(x + 4, y - 2, 7, 6, '#1e1b4b');
    px(x + 12, y - 3, 8, 7, '#1e1b4b');
    px(x + 21, y - 2, 7, 6, '#1e1b4b');
    if (active) {
      px(x + 5, y - 1, 5, 4, '#00f0ff');
      px(x + 13, y - 2, 6, 5, glow);
      px(x + 22, y - 1, 5, 4, '#ff007f');
      // Neural data pulses along cables
      px(x + 3 + (tick % 24), y + 8, 3, 1, '#00f0ff');
    }
    return;
  }

  if (ws.style === 'cyber_holo_pillar') {
    // Cylindrical 3D Holographic Globe Projector
    px(x + 4, y + 4, 24, 10, '#17112e');
    px(x + 4, y + 3, 24, 2, '#00f0ff');
    // Glowing holo-emitter ring in center
    px(x + 10, y + 5, 12, 5, '#090d16');
    const r = active ? (tick % 3) : 0;
    px(x + 11, y - 2 - r, 10, 8, 'rgba(0, 240, 255, 0.25)');
    px(x + 13, y - 1 - r, 6, 6, glow);
    px(x + 15, y + 1 - r, 2, 2, '#ffffff');
    return;
  }

  if (ws.style === 'cyber_ripperdoc') {
    // Surgical Cyberware Workbench + Chrome Bionic Arm + Laser Scanner
    px(x + 1, y + 4, 30, 9, '#0f172a');
    px(x + 1, y + 3, 30, 2, '#334155');
    // Chrome prosthetic arm on bench
    px(x + 6, y + 3, 12, 3, '#cbd5e1');
    px(x + 16, y + 2, 4, 4, '#94a3b8');
    // Overhead surgical laser arm
    px(x + 22, y - 2, 6, 7, '#1e293b');
    if (active) {
      const lx = x + 7 + (tick % 10);
      px(lx, y - 1, 1, 6, '#ff007f'); // scanning laser beam
      px(lx - 1, y + 4, 3, 1, '#00f0ff');
    }
    return;
  }

  if (ws.style === 'cyber_synth_rack') {
    // Modular Synth & Signal Frequency Wall with Animated EQ Bars
    px(x + 1, y + 2, 30, 12, '#090d16');
    px(x + 2, y + 0, 28, 10, '#1e1b4b');
    for (let c = 0; c < 8; c++) {
      const bh = active ? 2 + ((tick + c * 3) % 6) : 2;
      const barCol = c % 2 === 0 ? '#00f0ff' : '#ff007f';
      px(x + 4 + c * 3, y + 8 - bh, 2, bh, barCol);
    }
    return;
  }

  if (ws.style === 'cyber_drone_rig') {
    // Drone Assembly & Telemetry Rig with Hovering Micro-Drone
    px(x + 1, y + 4, 30, 9, '#181030');
    px(x + 1, y + 3, 30, 2, glow);
    // Telemetry monitor on left
    px(x + 4, y - 1, 9, 6, '#090d16');
    px(x + 5, y, 7, 4, active ? '#00f0ff' : '#1e293b');
    // Hovering quad-drone on right
    const hover = active ? Math.round(Math.sin(time * 10) * 2) : 0;
    px(x + 19, y + 1 + hover, 8, 3, '#e2e8f0');
    px(x + 17, y + hover, 3, 1, glow); // rotor L
    px(x + 26, y + hover, 3, 1, glow); // rotor R
    px(x + 22, y + 2 + hover, 2, 1, '#ff007f'); // drone eye
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. EDO DOJO WORKSTATIONS (Calligraphy, Katana Forge, Bonsai, Tea Ceremony, Woodblock, Strategy)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'dojo_katana_forge') {
    // Swordsmithing Charcoal Brazier + Katana on Rack + Whetstone
    px(x + 1, y + 3, 12, 10, '#292524');
    px(x + 3, y + 4, 8, 6, '#dc2626');
    if (active) {
      px(x + 4, y + 3 - (tick % 2), 6, 4, '#f97316');
      px(x + 6, y + 2 - (tick % 3), 2, 2, '#fef08a');
    }
    // Low forging anvil & shining katana blade
    px(x + 15, y + 5, 15, 7, '#5c3a21');
    px(x + 17, y + 6, 11, 2, '#e2e8f0'); // steel blade
    px(x + 16, y + 5, 2, 4, '#facc15'); // tsuba guard
    if (active) {
      px(x + 20 + (tick % 5), y + 4, 1, 2, '#fef08a'); // polishing glint
    }
    return;
  }

  if (ws.style === 'dojo_bonsai') {
    // Low Artisan Table + Sculpted Sakura/Pine Bonsai Tree
    px(x + 1, y + 5, 30, 8, '#6b3410');
    px(x + 1, y + 4, 30, 2, '#9a4b18');
    // Ceramic bonsai pot & twisted trunk
    px(x + 10, y + 4, 10, 3, '#1e3a8a');
    px(x + 14, y + 0, 3, 4, '#5c3a21');
    // Canopy (sakura pink or emerald pine)
    const canopy = ws.col % 2 === 0 ? '#f472b6' : '#22c55e';
    px(x + 8, y - 2, 8, 4, canopy);
    px(x + 14, y - 4, 9, 4, canopy);
    if (active) {
      // Falling petal / shear snip sparkle
      px(x + 11 + (tick % 8), y + 2, 1, 1, '#fbcfe8');
    }
    return;
  }

  if (ws.style === 'dojo_tea_ceremony') {
    // Chashitsu Tatami Mat + Iron Tetsubin Kettle + Matcha Bowl
    px(x + 1, y + 4, 30, 9, '#3f6212');
    px(x + 1, y + 4, 30, 1, '#b45309');
    // sunken hearth & iron kettle
    px(x + 6, y + 5, 8, 6, '#1c1917');
    px(x + 8, y + 4, 4, 5, '#334155');
    // Matcha bowl (chawan) & whisk
    px(x + 19, y + 6, 5, 4, '#15803d');
    px(x + 20, y + 7, 3, 2, '#4ade80');
    if (active) {
      const sy = tick % 3;
      px(x + 9, y + 1 - sy, 2, 2, 'rgba(255,255,255,0.65)'); // kettle steam
    }
    return;
  }

  if (ws.style === 'dojo_woodblock') {
    // Ukiyo-e Woodblock Carving & Great Wave Print Table
    px(x + 1, y + 5, 30, 8, '#78350f');
    px(x + 1, y + 4, 30, 2, '#92400e');
    // Indigo wave print block
    px(x + 5, y + 3, 12, 6, '#f8fafc');
    px(x + 6, y + 4, 10, 4, '#1d4ed8');
    px(x + 7, y + 4, 5, 2, '#93c5fd');
    // Pigment bowls on right
    px(x + 20, y + 4, 3, 3, '#ef4444');
    px(x + 25, y + 4, 3, 3, '#facc15');
    return;
  }

  if (ws.style === 'dojo_calligraphy' || ws.style === 'dojo_scroll_lectern' || ws.style === 'tatami_desk') {
    // Japanese Low Keyaki Wood Desk + Washi Scroll + Paper Lantern
    px(x + 1, y + 5, 30, 8, '#6b3410');
    px(x + 1, y + 4, 30, 2, '#9a4b18');
    px(x + 3, y + 12, 3, 3, '#422006');
    px(x + 26, y + 12, 3, 3, '#422006');
    px(x + 5, y + 2, 12, 6, '#fef9c3');
    px(x + 4, y + 2, 1, 6, '#dc2626');
    px(x + 17, y + 2, 1, 6, '#dc2626');
    if (active) {
      const step = tick % 3;
      px(x + 7, y + 3, 6 + step, 1, '#1c1917');
      px(x + 7, y + 5, 8 - step, 1, glow);
    }
    px(x + 22, y + 1, 5, 6, active ? glow : '#fde68a');
    px(x + 23, y + 0, 3, 1, '#292524');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. MEDIEVAL WORKSTATIONS (Alchemy Cauldron, Enchanting Altar, Astrolabe, Apothecary, Scribe)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'medieval_alchemy') {
    // Bubbling Iron Cauldron + Glass Distillation Alembic Table
    px(x + 2, y + 4, 12, 9, '#1f2937'); // cauldron belly
    px(x + 1, y + 3, 14, 2, '#374151'); // cauldron rim
    px(x + 3, y + 12, 10, 2, '#ea580c'); // fire underneath
    px(x + 3, y + 3, 10, 2, glow); // glowing brew surface
    if (active) {
      const b = tick % 4;
      px(x + 5 + b, y + 1 - (b % 2), 2, 2, glow);
      px(x + 9 - (b % 3), y - (b % 3), 2, 2, '#f0abfc');
    }
    // Alembic flasks table on right
    px(x + 16, y + 5, 14, 8, '#5c3a21');
    px(x + 18, y + 1, 4, 5, '#38bdf8');
    px(x + 24, y + 2, 4, 4, '#ec4899');
    return;
  }

  if (ws.style === 'medieval_enchanting') {
    // Stone Runic Altar + Levitating Mana Crystal
    px(x + 2, y + 5, 28, 9, '#334155');
    px(x + 1, y + 4, 30, 2, '#475569');
    px(x + 5, y + 4, 22, 1, glow);
    const floatY = active ? Math.round(Math.sin(time * 7) * 2) : 0;
    // Levitating crystal prism
    px(x + 13, y - 3 + floatY, 6, 7, glow);
    px(x + 15, y - 2 + floatY, 2, 5, '#ffffff');
    if (active) {
      px(x + 8 + (tick % 14), y - 1, 2, 1, '#facc15');
    }
    return;
  }

  if (ws.style === 'medieval_astrolabe') {
    // Brass Celestial Armillary Sphere & Star-Chart Telescope Desk
    px(x + 1, y + 4, 30, 9, '#5c3a21');
    px(x + 1, y + 3, 30, 2, '#855836');
    // Rotating brass astrolabe rings
    px(x + 5, y - 2, 8, 7, '#f59e0b');
    px(x + 7, y, 4, 3, active ? glow : '#1e3a8a');
    // Brass telescope pointing up-right
    px(x + 19, y - 1, 9, 3, '#facc15');
    px(x + 21, y + 2, 3, 4, '#78350f');
    return;
  }

  if (ws.style === 'medieval_apothecary') {
    // Herbalist Mortar & Pestle + Potion Vial Rack
    px(x + 1, y + 4, 30, 9, '#451a03');
    px(x + 1, y + 3, 30, 2, '#78350f');
    px(x + 5, y + 1, 5, 4, '#d6d3d1'); // stone mortar
    px(x + 14, y, 3, 5, '#22c55e'); // green vial
    px(x + 19, y, 3, 5, '#ef4444'); // red vial
    px(x + 24, y, 3, 5, '#38bdf8'); // mana vial
    return;
  }

  if (ws.style === 'medieval_scribe' || ws.style === 'arcane_tome') {
    // Medieval Enchanted Lectern & Crystal Orb (32x16)
    px(x + 1, y + 4, 30, 10, '#5c3a21');
    px(x + 1, y + 3, 30, 2, '#855836');
    px(x + 2, y + 13, 4, 3, '#3b2313');
    px(x + 26, y + 13, 4, 3, '#3b2313');
    px(x + 5, y + 1, 10, 6, '#fef3c7');
    px(x + 9, y + 1, 2, 6, '#92400e');
    if (active) {
      const floatY = Math.round(Math.sin(time * 6));
      px(x + 6, y + 2 + floatY, 3, 1, glow);
      px(x + 11, y + 3 + floatY, 3, 1, glow);
    }
    px(x + 20, y + 1, 5, 5, active ? glow : '#475569');
    px(x + 21, y + 2, 2, 2, '#ffffff');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. WW2 BUNKER WORKSTATIONS (Enigma, Turing Bombe Drums, PPI Radar, Shortwave Morse, Map Plotter, Mechanic)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'ww2_bombe_drum') {
    // Bletchley Park Electro-Mechanical Turing Bombe Cabinet with Spinning Rotor Drums
    px(x + 1, y - 2, 30, 16, '#292524');
    px(x + 2, y - 1, 28, 13, '#44403c');
    const spin = active ? tick % 3 : 0;
    for (let d = 0; d < 4; d++) {
      const dx = x + 4 + d * 6;
      px(dx, y + 1, 5, 4, '#991b1b'); // upper drum
      px(dx + spin, y + 2, 2, 2, '#facc15');
      px(dx, y + 6, 5, 4, '#1e3a8a'); // lower drum
      px(dx + (2 - spin), y + 7, 2, 2, '#facc15');
    }
    return;
  }

  if (ws.style === 'ww2_radar_scope') {
    // Circular PPI Green-Phosphor Radar CRT Console
    px(x + 1, y + 4, 30, 9, '#263028');
    px(x + 1, y + 3, 30, 2, '#3f4f41');
    // Large round radar hood
    px(x + 5, y - 3, 12, 10, '#141a15');
    px(x + 7, y - 1, 8, 6, '#052e16');
    px(x + 10, y + 1, 2, 2, '#22c55e'); // radar center
    if (active) {
      const bx = (tick % 5) - 2;
      px(x + 10 + bx, y + 1 - (tick % 2), 2, 1, '#4ade80');
      px(x + 12, y + 0, 1, 1, '#fef08a'); // aircraft blip
    }
    // Side plotting grid
    px(x + 19, y + 1, 9, 5, '#1e293b');
    px(x + 21, y + 2, 5, 3, glow);
    return;
  }

  if (ws.style === 'ww2_radio_morse') {
    // High-Power Shortwave Transceiver + Antenna Coil + Morse Key
    px(x + 1, y + 4, 30, 9, '#263028');
    px(x + 3, y - 2, 14, 8, '#1c1917');
    px(x + 5, y, 4, 3, '#fef3c7'); // analog dial meter
    px(x + 11, y, 4, 3, active ? '#84cc16' : '#3f3f46');
    // Copper whip coil & Morse tapper
    px(x + 21, y - 4, 2, 9, '#d97706');
    px(x + 25, y + 3, 4, 2, '#facc15');
    return;
  }

  if (ws.style === 'ww2_map_plotter') {
    // RAF Fighter Command Illuminated Glass Sector Plotting Table
    px(x + 1, y + 3, 30, 11, '#3f4f41');
    px(x + 3, y + 4, 26, 7, '#064e3b');
    px(x + 6, y + 5, 10, 5, '#15803d');
    // Squadron markers
    px(x + 9 + (active ? tick % 4 : 0), y + 6, 2, 2, '#ef4444');
    px(x + 18, y + 7, 2, 2, '#facc15');
    px(x + 22, y + 5, 2, 2, '#38bdf8');
    return;
  }

  if (ws.style === 'ww2_field_mechanic') {
    // Motor Pool Aircraft / Jeep Engine Block Repair Bench
    px(x + 1, y + 4, 30, 9, '#374151');
    px(x + 1, y + 3, 30, 2, '#4b5563');
    // V-12 / Radial Engine block on stand
    px(x + 5, y - 1, 12, 7, '#1f2937');
    px(x + 6, y, 10, 2, '#9ca3af'); // cylinder heads
    px(x + 21, y + 1, 6, 4, '#dc2626'); // red tool chest
    if (active) {
      px(x + 10 + (tick % 4), y - 2, 2, 2, '#facc15'); // wrench spark
    }
    return;
  }

  if (ws.style === 'ww2_enigma' || ws.style === 'radio_station') {
    // WW2 Allied Enigma Rotor Cipher Desk
    px(x + 1, y + 4, 30, 9, '#263028');
    px(x + 1, y + 3, 30, 2, '#3f4f41');
    px(x + 2, y + 13, 3, 3, '#141a15');
    px(x + 27, y + 13, 3, 3, '#141a15');
    px(x + 4, y - 2, 13, 8, '#1c1917');
    px(x + 6, y - 1, 9, 3, '#44403c');
    px(x + 19, y - 2, 9, 8, '#141a15');
    px(x + 20, y - 1, 7, 6, '#052e16');
    if (active) {
      const sweep = tick % 5;
      px(x + 6 + sweep, y + 3, 2, 1, '#facc15');
      px(x + 21 + sweep, y + 1, 2, 2, glow);
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. OFFICE WORKSTATIONS (Triple Monitor, Ultrawide, Standing Desk, Mac Studio, Server Bench, Architect, Dual PC)
  // ══════════════════════════════════════════════════════════════════════════
  if (ws.style === 'office_triple' || ws.style === 'cyber_deck_triple') {
    const isCyber = ws.style === 'cyber_deck_triple';
    px(x + 1, y + 4, 30, 9, isCyber ? '#0f172a' : '#5c3e26');
    px(x + 1, y + 3, 30, 2, isCyber ? '#1e1b4b' : '#78553a');
    // Left angled monitor + Center wide monitor + Right vertical code monitor
    px(x + 2, y - 2, 7, 7, '#0f172a');
    px(x + 10, y - 3, 11, 8, '#0f172a');
    px(x + 22, y - 4, 6, 9, '#0f172a'); // vertical monitor
    px(x + 3, y - 1, 5, 5, active ? '#0b192c' : '#1e293b');
    px(x + 11, y - 2, 9, 6, active ? '#091526' : '#1e293b');
    px(x + 23, y - 3, 4, 7, active ? '#0b192c' : '#1e293b');
    if (active) {
      px(x + 4, y, 3, 1, '#38bdf8');
      px(x + 12, y - 1, 5 + (tick % 3), 1, glow);
      px(x + 12, y + 1, 7 - (tick % 3), 1, '#4ade80');
      px(x + 24, y - 2, 2, 5, '#a855f7');
    }
    return;
  }

  if (ws.style === 'office_ultrawide') {
    // 49-inch Curved Super-Ultrawide Monitor + Laptop on Stand + Coffee Mug
    px(x + 1, y + 4, 30, 9, '#5c3e26');
    px(x + 1, y + 3, 30, 2, '#855836');
    px(x + 3, y - 3, 20, 8, '#0f172a');
    px(x + 4, y - 2, 18, 6, active ? '#091526' : '#1e293b');
    px(x + 11, y + 5, 4, 2, '#475569');
    // Side mug
    px(x + 25, y + 2, 3, 3, '#f97316');
    px(x + 25, y + 2, 3, 1, '#ffffff');
    if (active) {
      px(x + 5, y - 1, 7, 4, 'rgba(56, 189, 248, 0.25)');
      px(x + 13, y - 1, 8, 4, 'rgba(168, 85, 247, 0.25)');
      px(x + 6, y, 4 + (tick % 3), 1, glow);
      px(x + 14, y + 1, 5 - (tick % 2), 1, '#4ade80');
    }
    return;
  }

  if (ws.style === 'office_standing') {
    // Motorized Elevated Standing Desk with Dual Monitors & Succulent
    px(x + 1, y + 1, 30, 3, '#94a3b8'); // high tabletop
    px(x + 3, y + 4, 2, 11, '#334155'); // motorized leg L
    px(x + 27, y + 4, 2, 11, '#334155'); // motorized leg R
    px(x + 5, y - 5, 12, 7, '#0f172a');
    px(x + 6, y - 4, 10, 5, active ? '#0b192c' : '#1e293b');
    px(x + 19, y - 4, 7, 6, '#0f172a');
    px(x + 20, y - 3, 5, 4, active ? '#091526' : '#1e293b');
    // Mini desk plant
    px(x + 27, y - 2, 3, 3, '#22c55e');
    if (active) {
      px(x + 7, y - 3, 6 + (tick % 3), 1, glow);
      px(x + 7, y - 1, 5, 1, '#4ade80');
    }
    return;
  }

  if (ws.style === 'office_mac_studio') {
    // Silver Pro Studio Display + Mac Studio Cube + Drawing Tablet
    px(x + 1, y + 4, 30, 9, '#475569');
    px(x + 1, y + 3, 30, 2, '#cbd5e1');
    px(x + 5, y - 3, 13, 8, '#e2e8f0'); // silver bezel
    px(x + 6, y - 2, 11, 6, active ? '#0f172a' : '#1e293b');
    // Mac Studio silver cube
    px(x + 20, y + 1, 5, 4, '#cbd5e1');
    px(x + 21, y + 3, 1, 1, '#ffffff');
    if (active) {
      px(x + 7, y - 1, 8, 4, glow);
      px(x + 9, y, 4, 2, '#ffffff');
    }
    return;
  }

  if (ws.style === 'office_server_bench') {
    // Hardware / DevOps Bench with Green Oscilloscope & Mini Server Rack
    px(x + 1, y + 4, 30, 9, '#1e293b');
    px(x + 1, y + 3, 30, 2, '#475569');
    // Mini rack on left
    px(x + 3, y - 2, 9, 7, '#090d16');
    px(x + 4, y - 1, 2, 1, active ? '#22c55e' : '#f59e0b');
    px(x + 4, y + 1, 2, 1, '#38bdf8');
    // Oscilloscope & Laptop on right
    px(x + 14, y - 2, 13, 7, '#0f172a');
    px(x + 15, y - 1, 11, 5, '#052e16');
    if (active) {
      px(x + 16 + (tick % 8), y + 1, 2, 1, '#4ade80');
    }
    return;
  }

  if (ws.style === 'office_architect') {
    // Monitor + Mini Tabletop Kanban Sticky-Note Board
    px(x + 1, y + 4, 30, 9, '#5c3e26');
    px(x + 1, y + 3, 30, 2, '#78553a');
    px(x + 4, y - 3, 12, 8, '#0f172a');
    px(x + 5, y - 2, 10, 6, active ? '#0b192c' : '#1e293b');
    // Kanban board with sticky notes
    px(x + 18, y - 2, 10, 7, '#f8fafc');
    px(x + 19, y - 1, 2, 2, '#facc15');
    px(x + 22, y - 1, 2, 2, '#f43f5e');
    px(x + 25, y - 1, 2, 2, '#22c55e');
    px(x + 19, y + 2, 2, 2, '#38bdf8');
    if (active) {
      px(x + 6, y - 1, 6 + (tick % 3), 1, glow);
    }
    return;
  }

  // Default Office Desk PC & Cyberpunk Deck (32x16)
  const isCyber = ws.style === 'cyber_deck';
  const deskTop = isCyber ? '#1e1b4b' : '#78553a';
  const deskFront = isCyber ? '#0f172a' : '#5c3e26';
  const deskTrim = isCyber ? glow : '#966d4e';

  px(x + 1, y + 4, 30, 9, deskFront);
  px(x + 1, y + 3, 30, 2, deskTop);
  px(x + 1, y + 3, 30, 1, deskTrim);
  px(x + 2, y + 13, 3, 3, '#1e293b');
  px(x + 27, y + 13, 3, 3, '#1e293b');

  px(x + 4, y - 3, 13, 8, '#0f172a');
  px(x + 5, y - 2, 11, 6, active ? '#0b192c' : '#1e293b');
  px(x + 9, y + 5, 3, 2, '#334155');

  px(x + 19, y - 2, 8, 7, '#0f172a');
  px(x + 20, y - 1, 6, 5, active ? '#091526' : '#1e293b');
  px(x + 22, y + 5, 2, 2, '#334155');

  px(x + 6, y + 6, 9, 2, '#334155');
  px(x + 17, y + 6, 2, 2, '#475569');

  if (active) {
    px(x + 6, y - 1, 5 + (tick % 4), 1, glow);
    px(x + 6, y + 1, 8 - (tick % 3), 1, '#4ade80');
    px(x + 6, y + 2, 4 + ((tick + 2) % 5), 1, '#f8fafc');
    px(x + 21, y, 4, 1, glow);
    px(x + 21, y + 2, 3, 1, '#a855f7');
    px(x + 15, y + 3, 1, 1, '#22c55e');
  } else {
    px(x + 15, y + 3, 1, 1, '#f59e0b');
  }
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
    drawImg(spriteImg, x, y, w, h);
    return;
  }

  switch (prop.type) {
    case 'ping_pong': {
      // Office Tournament Ping-Pong Table with Net & Animated Ball
      px(x + 4, y + 4, w - 8, h - 6, '#1d4ed8');
      px(x + 4, y + 4, w - 8, 1, '#ffffff');
      px(x + 4, y + h - 3, w - 8, 1, '#ffffff');
      px(x + 4, y + Math.floor(h / 2), w - 8, 1, 'rgba(255,255,255,0.45)');
      px(x + Math.floor(w / 2), y + 2, 2, h - 2, '#e2e8f0'); // center net
      // Animated bouncing ball
      const bx = Math.round((Math.sin(time * 5) * 0.4 + 0.5) * (w - 16)) + 8;
      const by = Math.round(Math.abs(Math.cos(time * 5)) * 6) + 6;
      px(x + bx, y + by, 2, 2, '#ffffff');
      break;
    }
    case 'zen_garden': {
      // Edo Dojo Karesansui Raked Gravel Zen Garden & Moss Stones
      px(x + 1, y + 2, w - 2, h - 4, '#5c3a21'); // timber border
      px(x + 3, y + 4, w - 6, h - 8, '#d6d3d1'); // white gravel
      for (let ry = 6; ry < h - 6; ry += 3) {
        px(x + 5, y + ry, w - 10, 1, '#a8a29e'); // raked zen wave lines
      }
      // Zen moss rocks
      px(x + 12, y + 9, 8, 6, '#44403c');
      px(x + 14, y + 10, 4, 2, '#22c55e');
      px(x + 46, y + 11, 10, 7, '#57534e');
      px(x + 48, y + 12, 5, 2, '#15803d');
      break;
    }
    case 'koi_pond': {
      // Edo Dojo Koi Pond with Swimming Nishikigoi & Lily Pads
      px(x + 2, y + 2, w - 4, h - 4, '#57534e'); // stone border
      px(x + 4, y + 4, w - 8, h - 8, '#0369a1'); // deep water
      px(x + 6, y + 6, w - 12, h - 12, '#0284c7');
      // Lily pads
      px(x + 10, y + 8, 5, 4, '#22c55e');
      px(x + 12, y + 8, 2, 2, '#f472b6'); // lotus flower
      px(x + w - 18, y + 14, 5, 4, '#16a34a');
      // Animated swimming koi fish
      const k1 = (tick * 2) % (w - 24);
      const k2 = (w - 24) - ((tick * 2) % (w - 24));
      px(x + 8 + k1, y + 10, 4, 2, '#f97316');
      px(x + 9 + k1, y + 10, 2, 2, '#ffffff');
      px(x + 8 + k2, y + 18, 4, 2, '#ef4444');
      break;
    }
    case 'torii_gate': {
      // Vermilion Shinto Torii Gate
      px(x + 2, y - 2, w - 4, 3, '#1c1917'); // top kasagi lintel
      px(x + 3, y + 1, w - 6, 2, '#dc2626');
      px(x + 4, y + 5, w - 8, 2, '#dc2626'); // nuki crossbeam
      px(x + 6, y + 1, 3, h - 3, '#dc2626'); // pillar L
      px(x + w - 9, y + 1, 3, h - 3, '#dc2626'); // pillar R
      break;
    }
    case 'training_dummy':
    case 'sword_dummy': {
      // Straw Makiwara / Knight Pells Combat Dummy
      const shake = tick % 4 === 0 ? 1 : 0;
      px(x + 10, y + 18, 12, 4, '#451a03'); // base
      px(x + 14 + shake, y + 2, 4, 17, '#78350f'); // post
      px(x + 8 + shake, y + 6, 16, 3, '#92400e'); // crossbar arms
      px(x + 12 + shake, y + 4, 8, 9, '#eab308'); // straw torso wrap
      break;
    }
    case 'archery_target': {
      // Medieval Courtyard Archery Range (3 Straw Bullseye Targets)
      for (let t = 0; t < 3; t++) {
        const tx = x + 6 + t * 28;
        px(tx + 2, y + 14, 2, 6, '#78350f');
        px(tx + 10, y + 14, 2, 6, '#78350f');
        px(tx, y + 2, 14, 14, '#fef08a'); // outer straw
        px(tx + 2, y + 4, 10, 10, '#2563eb'); // blue ring
        px(tx + 4, y + 6, 6, 6, '#ef4444'); // red ring
        px(tx + 6, y + 8, 2, 2, '#facc15'); // gold bullseye
        // Embedded arrow shaft
        if ((tick + t) % 3 !== 0) {
          px(tx + 7, y + 9, 5, 1, '#451a03');
          px(tx + 11, y + 8, 2, 3, '#f8fafc');
        }
      }
      break;
    }
    case 'ramen_stall': {
      // Cyberpunk Neon Ramen Street Stall
      px(x + 1, y - 3, w - 2, 5, '#ff007f'); // neon canopy
      px(x + 3, y - 2, w - 6, 3, '#090d16');
      px(x + 5, y - 1, 8, 1, '#00f0ff');
      px(x + 2, y + 5, w - 4, 9, '#1e1b4b'); // counter
      px(x + 2, y + 4, w - 4, 2, '#00f0ff');
      // Steaming ramen bowls
      px(x + 8, y + 2, 4, 3, '#f43f5e');
      px(x + 20, y + 2, 4, 3, '#f43f5e');
      px(x + 9, y - (tick % 3), 1, 2, 'rgba(255,255,255,0.65)');
      break;
    }
    case 'cryo_tank': {
      // Glowing Cyan Stasis Pod
      px(x + 4, y + 1, w - 8, h - 2, '#083344');
      px(x + 6, y + 3, w - 12, h - 6, '#06b6d4');
      px(x + 4, y, w - 8, 3, '#334155');
      px(x + 4, y + h - 3, w - 8, 3, '#334155');
      px(x + 10, y + 8 + (tick % 8), 2, 2, '#ffffff');
      break;
    }
    case 'holo_pod': {
      // Braindance VR Pod
      px(x + 2, y + 2, w - 4, 12, '#1e1b4b');
      px(x + 4, y + 4, w - 8, 8, tick % 2 === 0 ? '#a855f7' : '#00f0ff');
      break;
    }
    case 'piano': {
      // Western Saloon Upright Ragtime Piano
      px(x + 2, y - 2, w - 4, 16, '#451a03');
      px(x + 4, y + 5, w - 8, 3, '#f8fafc'); // ivory keys
      const keyHit = (tick * 3) % Math.max(4, w - 12);
      px(x + 5 + keyHit, y + 5, 2, 2, '#090d16');
      break;
    }
    case 'water_trough': {
      // Frontier Wooden Water Trough
      px(x + 2, y + 3, w - 4, 10, '#5c3820');
      px(x + 4, y + 5, w - 8, 6, '#0284c7');
      px(x + 6 + (tick % 12), y + 7, 6, 1, '#7dd3fc');
      break;
    }
    case 'sandbag_post': {
      // WW2 Sandbagged Observation Emplacement & Periscope
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < w - 8; c += 8) {
          px(x + 4 + c + (r % 2) * 2, y + 8 + r * 5, 7, 4, '#a16207');
        }
      }
      px(x + 18, y + 1, 4, 8, '#3f4f41'); // periscope mast
      px(x + 16, y + 1, 6, 2, '#84cc16');
      break;
    }
    case 'radar_dish': {
      // WW2 Rotating Radar Array
      px(x + 14, y + 10, 12, 14, '#374151'); // lattice tower
      const sweep = Math.round(Math.sin(time * 3) * 4);
      px(x + 8 + sweep, y + 2, 24, 6, '#9ca3af'); // dish
      px(x + 19, y, 2, 2, tick % 2 === 0 ? '#ef4444' : '#450a0a'); // beacon
      break;
    }
    case 'ammo_crates': {
      // Olive Drab Supply Crates
      px(x + 2, y + 3, 18, 10, '#3f6212');
      px(x + 4, y + 5, 14, 2, '#eab308');
      px(x + 22, y + 5, 16, 8, '#365314');
      break;
    }
    case 'coffee_machine': {
      // Counter + Espresso Machine + Steam
      px(x, y + 4, 32, 12, '#334155');
      px(x, y + 3, 32, 2, '#64748b');
      // Machine body
      px(x + 4, y - 4, 12, 8, '#dc2626');
      px(x + 5, y - 3, 10, 2, '#cbd5e1');
      px(x + 7, y + 1, 2, 2, '#0f172a');
      // Mugs
      px(x + 20, y + 1, 3, 3, '#f8fafc');
      px(x + 25, y + 1, 3, 3, '#38bdf8');
      // Animated steam pixels
      const sy = Math.floor(time * 4) % 4;
      px(x + 8, y - 6 - sy, 1, 2, 'rgba(255,255,255,0.6)');
      px(x + 21, y - 2 - (sy % 3), 1, 2, 'rgba(255,255,255,0.5)');
      break;
    }
    case 'watercooler': {
      px(x + 4, y + 4, 8, 11, '#e2e8f0');
      px(x + 5, y - 3, 6, 7, '#38bdf8');
      px(x + 6, y - 2, 2, 5, '#7dd3fc');
      if (Math.floor(time * 3) % 2 === 0) {
        px(x + 8, y - 1, 1, 1, '#ffffff');
      }
      break;
    }
    case 'arcade': {
      px(x + 2, y - 4, 26, 20, '#1e1b4b');
      px(x + 3, y - 3, 24, 4, '#ec4899'); // marquee
      const screenCol = Math.floor(time * 5) % 2 === 0 ? '#00f0ff' : '#a855f7';
      px(x + 5, y + 2, 20, 6, '#090d16');
      px(x + 7, y + 3, 16, 4, screenCol);
      px(x + 4, y + 9, 22, 2, '#facc15'); // joysticks
      break;
    }
    case 'bookshelf': {
      const w = (prop.w || 3) * TILE_SIZE;
      px(x + 1, y - 4, w - 2, 19, '#5c3a21');
      px(x + 3, y - 2, w - 6, 4, '#291709');
      px(x + 3, y + 4, w - 6, 4, '#291709');
      px(x + 3, y + 10, w - 6, 4, '#291709');
      const colors = ['#ef4444', '#38bdf8', '#22c55e', '#eab308', '#a855f7', '#f97316'];
      for (let bx = 4; bx < w - 6; bx += 3) {
        px(x + bx, y - 1, 2, 3, colors[bx % colors.length]);
        px(x + bx, y + 5, 2, 3, colors[(bx + 2) % colors.length]);
        px(x + bx, y + 11, 2, 3, colors[(bx + 4) % colors.length]);
      }
      break;
    }
    case 'sofa': {
      const w = (prop.w || 4) * TILE_SIZE;
      const col = prop.color || '#be123c';
      px(x + 2, y + 2, w - 4, 12, col);
      px(x + 4, y + 6, w - 8, 7, '#9f1239');
      px(x + 2, y + 2, w - 4, 3, '#fb7185');
      break;
    }
    case 'coffee_table':
    case 'holo_table': {
      const w = (prop.w || 3) * TILE_SIZE;
      if (prop.type === 'holo_table') {
        px(x + 4, y + 4, w - 8, 9, '#1e1b4b');
        px(x + 6, y + 5, w - 12, 6, '#00f0ff');
        const pulse = Math.floor(time * 6) % 3;
        px(x + 12, y + 2 - pulse, w - 24, 2, 'rgba(0, 240, 255, 0.65)');
      } else {
        px(x + 4, y + 4, w - 8, 9, '#78553a');
        px(x + 5, y + 5, w - 10, 6, '#966d4e');
        px(x + 14, y + 6, 4, 3, '#f8fafc');
      }
      break;
    }
    case 'server_rack': {
      const w = (prop.w || 2) * TILE_SIZE;
      const h = (prop.h || 2) * TILE_SIZE;
      px(x + 2, y + 2, w - 4, h - 4, '#0f172a');
      px(x + 3, y + 3, w - 6, h - 6, '#1e293b');
      const blink = Math.floor(time * 6);
      for (let ry = 5; ry < h - 5; ry += 4) {
        px(x + 5, y + ry, w - 10, 2, '#090d16');
        px(x + 6, y + ry, 2, 1, (blink + ry) % 3 === 0 ? '#22c55e' : '#38bdf8');
        px(x + 10, y + ry, 2, 1, (blink + ry) % 2 === 0 ? '#22c55e' : '#f59e0b');
      }
      break;
    }
    case 'whiteboard': {
      const w = (prop.w || 4) * TILE_SIZE;
      px(x + 2, y + 2, w - 4, 11, '#f8fafc');
      px(x + 2, y + 2, w - 4, 1, '#64748b');
      px(x + 2, y + 12, w - 4, 1, '#64748b');
      px(x + 6, y + 5, 14, 1, '#ef4444');
      px(x + 6, y + 8, 22, 1, '#3b82f6');
      px(x + 34, y + 5, 12, 5, '#10b981');
      break;
    }
    case 'clock': {
      px(x + 4, y + 3, 8, 8, '#f8fafc');
      px(x + 4, y + 3, 8, 1, '#475569');
      px(x + 7, y + 5, 1, 3, '#0f172a');
      px(x + 7, y + 7, 3, 1, '#ef4444');
      break;
    }
    case 'campfire': {
      px(x + 6, y + 10, 20, 6, '#451a03');
      const f = Math.floor(time * 8) % 3;
      px(x + 9, y + 4 - f, 14, 8, '#ea580c');
      px(x + 12, y + 6 - f, 8, 5, '#facc15');
      break;
    }
    case 'barrel': {
      px(x + 4, y + 2, 24, 12, '#78350f');
      px(x + 4, y + 5, 24, 2, '#9ca3af');
      px(x + 4, y + 10, 24, 2, '#9ca3af');
      break;
    }
    case 'plant':
    default: {
      // Pixel potted plant
      px(x + 5, y + 10, 6, 5, '#b45309');
      px(x + 4, y + 9, 8, 2, '#d97706');
      px(x + 4, y + 3, 8, 6, '#15803d');
      px(x + 3, y + 5, 10, 3, '#22c55e');
      px(x + 6, y + 1, 4, 3, '#4ade80');
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

  // Shadow
  px(x + 2, y + 10, 8, 2, 'rgba(0,0,0,0.35)');

  if (spriteImg) {
    drawImg(spriteImg, x, y - bob, 12, 12);
  } else if (pet.type === 'robot') {
    // Tachikoma / Cyber Drone
    px(x + 2, y + 3 - bob, 8, 6, pet.color);
    px(x + 4, y + 5 - bob, 4, 2, '#ffffff');
    px(x + 1, y + 9, 2, 2, '#334155');
    px(x + 9, y + 9, 2, 2, '#334155');
  } else {
    // Pixel Cat / Corgi
    px(x + 2, y + 5 - bob, 7, 4, pet.color); // body
    const hx = pet.dir === 'right' ? x + 7 : x + 1;
    px(hx, y + 2 - bob, 4, 4, pet.color); // head
    px(hx, y + 1 - bob, 1, 1, '#1f2937'); // ear
    px(hx + 3, y + 1 - bob, 1, 1, '#1f2937'); // ear
    px(hx + (pet.dir === 'right' ? 3 : 0), y + 3 - bob, 1, 1, '#0f172a'); // eye
    // Tail wag
    const tailWag = Math.floor(time * 6) % 2;
    const tx = pet.dir === 'right' ? x + 1 : x + 9;
    px(tx, y + 3 - tailWag, 1, 3, pet.color);
    // Paws
    px(x + 2, y + 9, 2, 2, '#ffffff');
    px(x + 7, y + 9, 2, 2, '#ffffff');
  }

  // Heart bubble
  if (pet.heartTimer > 0) {
    const hy = y - 6 - Math.round((1 - pet.heartTimer) * 4);
    px(x + 3, hy, 2, 2, '#f43f5e');
    px(x + 6, hy, 2, 2, '#f43f5e');
    px(x + 4, hy + 2, 3, 2, '#f43f5e');
  }
}

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

  // Spawn / Despawn Effect (Matrix digital rain, Cyber beam, Arcane portal, Sakura smoke)
  if (ch.spawnEffect) {
    const p = ch.spawnEffect === 'spawn' ? ch.spawnProgress : 1 - ch.spawnProgress;
    drawSpawnEffect(ctx, px, bx, by, p, ch.spawnSeeds, spawnEffectType, spawnColor || '#22c55e', time);
    if (p < 0.35) return;
  }

  // Floor shadow
  px(bx + 3, Math.round(ch.y - 2), 10, 3, 'rgba(0,0,0,0.42)');

  // Selection / Hover Pixel Halo Outline
  if (isSelected || isHovered) {
    const outColor = isSelected ? '#ffffff' : 'rgba(255,255,255,0.55)';
    px(bx + 2, by - 1, 12, 18, outColor);
  }

  // External PNG Sprite Sheet support (templates/<id>/sprites/<file>.png)
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

  // Legs / Shoes
  if (ch.animState === 'type') {
    // Seated posture
    px(bx + 4, by + 13, 3, 3, style.secondary);
    px(bx + 9, by + 13, 3, 3, style.secondary);
  } else if (ch.animState === 'walk') {
    const lOff = ch.frame === 1 ? -1 : ch.frame === 3 ? 1 : 0;
    const rOff = -lOff;
    px(bx + 4, by + 13 + lOff, 3, 4, style.secondary);
    px(bx + 9, by + 13 + rOff, 3, 4, style.secondary);
    px(bx + 4, by + 16 + lOff, 3, 1, '#090d16');
    px(bx + 9, by + 16 + rOff, 3, 1, '#090d16');
  } else {
    px(bx + 4, by + 13, 3, 4, style.secondary);
    px(bx + 9, by + 13, 3, 4, style.secondary);
    px(bx + 4, by + 16, 3, 1, '#090d16');
    px(bx + 9, by + 16, 3, 1, '#090d16');
  }

  // Torso / Jacket
  px(bx + 3, by + 7, 10, 6, style.primary);
  px(bx + 6, by + 7, 4, 5, 'rgba(255,255,255,0.16)'); // shirt stripe

  // Arms
  if (ch.animState === 'type') {
    // Typing hands bobbing rapidly
    const tL = ch.frame === 0 ? -1 : 0;
    const tR = ch.frame === 1 ? -1 : 0;
    px(bx + 2, by + 7 + tL, 2, 4, style.primary);
    px(bx + 12, by + 7 + tR, 2, 4, style.primary);
    px(bx + 2, by + 6 + tL, 2, 1, style.skin);
    px(bx + 12, by + 6 + tR, 2, 1, style.skin);
  } else {
    const swing = ch.animState === 'walk' && ch.frame % 2 === 1 ? 1 : 0;
    px(bx + 2, by + 7 + swing, 2, 5, style.primary);
    px(bx + 12, by + 7 - swing, 2, 5, style.primary);
    px(bx + 2, by + 11 + swing, 2, 1, style.skin);
    px(bx + 12, by + 11 - swing, 2, 1, style.skin);
  }

  // Head & Skin
  px(bx + 4, by + 1, 8, 6, style.skin);

  // Hair base
  px(bx + 3, by, 10, 2, style.hair);
  if (ch.dir === 'up') {
    // Back of head hair when facing up at desk
    px(bx + 4, by + 1, 8, 4, style.hair);
  } else {
    // Eyes
    const eyeX = ch.dir === 'left' ? bx + 4 : ch.dir === 'right' ? bx + 6 : bx + 5;
    px(eyeX, by + 3, 1, 2, '#0f172a');
    px(eyeX + 4, by + 3, 1, 2, '#0f172a');
  }

  // Accessories
  switch (style.accessory) {
    case 'visor':
      if (ch.dir !== 'up') {
        px(bx + 4, by + 3, 8, 2, '#00f0ff');
        px(bx + 5, by + 3, 3, 1, '#ffffff');
      }
      break;
    case 'headphones':
      px(bx + 3, by + 1, 1, 4, '#e2e8f0');
      px(bx + 12, by + 1, 1, 4, '#e2e8f0');
      px(bx + 4, by - 1, 8, 1, '#94a3b8');
      break;
    case 'glasses':
      if (ch.dir !== 'up') {
        px(bx + 4, by + 3, 3, 2, '#38bdf8');
        px(bx + 9, by + 3, 3, 2, '#38bdf8');
      }
      break;
    case 'wizard_hat':
      px(bx + 2, by, 12, 1, style.primary);
      px(bx + 4, by - 3, 8, 3, style.primary);
      px(bx + 6, by - 5, 4, 2, style.primary);
      px(bx + 4, by - 1, 8, 1, '#facc15');
      break;
    case 'crown':
      px(bx + 4, by - 2, 8, 2, '#facc15');
      px(bx + 4, by - 3, 1, 1, '#facc15');
      px(bx + 7, by - 3, 2, 1, '#ef4444');
      px(bx + 11, by - 3, 1, 1, '#facc15');
      break;
    case 'samurai':
      px(bx + 6, by - 2, 4, 2, style.hair);
      px(bx + 4, by + 1, 8, 1, '#ef4444');
      break;
    case 'spiky':
      px(bx + 4, by - 2, 2, 2, style.hair);
      px(bx + 7, by - 3, 2, 3, style.hair);
      px(bx + 10, by - 2, 2, 2, style.hair);
      break;
    case 'beanie':
      px(bx + 3, by - 2, 10, 3, style.primary);
      px(bx + 7, by - 3, 2, 1, '#f8fafc');
      break;
    case 'cowboy_hat':
      px(bx + 1, by, 14, 1, '#78350f'); // wide brim
      px(bx + 3, by - 2, 10, 2, '#92400e'); // crown
      px(bx + 3, by - 1, 10, 1, '#facc15'); // hatband
      break;
    case 'helmet':
      px(bx + 3, by - 2, 10, 3, '#3f6212'); // M1 steel pot
      px(bx + 2, by, 12, 1, '#365314'); // helmet rim
      px(bx + 7, by - 1, 2, 1, '#facc15'); // officer insignia
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
    // Cyberpunk vertical teleport pillar
    ctx.globalAlpha = (1 - Math.abs(progress - 0.5) * 1.6) * 0.85;
    px(bx + 2, by - 20, 12, 38, color);
    px(bx + 5, by - 20, 6, 38, '#ffffff');
  } else if (effectType === 'portal') {
    // Arcane golden rune ring
    ctx.globalAlpha = 0.85;
    const r = Math.round(4 + progress * 8);
    px(bx + 8 - r, by + 14, r * 2, 3, color);
    px(bx + 4, by + 2 + Math.round(Math.sin(time * 12) * 3), 8, 2, '#fef08a');
  } else {
    // Matrix digital pixel rain (inspired by pixel-agents matrixEffect.ts)
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
