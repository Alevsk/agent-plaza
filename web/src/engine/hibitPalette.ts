import type { TemplateManifest } from '../types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HI-BIT PIXEL ART COLOR & CONTRAST DESIGN SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * Inspired by Owlboy, Hyper Light Drifter, Enter the Gungeon & Dungeon of the Endless.
 *
 * Enforces a strict 4-Layer Luminance (L) & Saturation (S) Hierarchy so that
 * characters and interactive props always read clearly against any floor:
 *
 * - Layer 0 (Void / Backdrop):      L = 0.05..0.09, S <= 0.22, ΔL <= 0.02
 * - Layer 1 (Walkable Floors):      L = 0.11..0.19, S <= 0.26, ΔL <= 0.035 (Strict low-contrast cap!)
 * - Layer 2 (Walls & Workstations): L = 0.22..0.65, S = 0.30..0.75, grounded with sel-out (L ~ 0.07)
 * - Layer 3 (Characters & FX):      L = 0.45..0.95, S = 0.65..0.95, crisp 1px sel-out + ground shadow
 */

export interface ColorRamp {
  outline: string;
  deepShadow: string;
  shadow: string;
  base: string;
  light: string;
  spec: string;
  rgb: [number, number, number];
}

export interface FloorPalette {
  seam: string;      // L - 0.028 (subtle mortar / plank crease)
  shadow: string;    // L - 0.014 (subtle secondary tile shade)
  base: string;      // Normalized L (0.11..0.19), S <= 0.26
  highlight: string; // L + 0.016 (gentle surface texture sheen)
  accent: string;    // Muted thematic trim (L ~ 0.23, S <= 0.34)
}

export interface PointLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
}

const rampCache = new Map<string, ColorRamp>();
const floorPaletteCache = new Map<string, FloorPalette>();

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseHex(hex: string): [number, number, number] {
  const clean = (hex || '#64748b').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toH = (v: number) => clampByte(v).toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  if (s === 0) {
    const v = l * 255;
    return rgbToHex(v, v, v);
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  );
}

/**
 * Enforces the Hi-Bit Floor Design System on any input hex color:
 * - Clamps saturation to <= 26% so floors never glare or compete with sprites
 * - Clamps lightness to 11%..18% so characters (L=45%..90%) pop with high contrast
 * - Limits internal floor texture delta (ΔL) to +/- 1.6%..2.8%
 */
export function getFloorPalette(hex: string, targetMinL = 0.11, targetMaxL = 0.18, maxSat = 0.26): FloorPalette {
  const cacheKey = `${hex}:${targetMinL}:${targetMaxL}:${maxSat}`;
  const cached = floorPaletteCache.get(cacheKey);
  if (cached) return cached;

  const [r, g, b] = parseHex(hex);
  const [h, rawS, rawL] = rgbToHsl(r, g, b);

  const s = Math.min(rawS, maxSat);
  const l = Math.max(targetMinL, Math.min(targetMaxL, rawL));

  const pal: FloorPalette = {
    seam: hslToHex(h + 0.01, Math.min(1, s * 1.05), Math.max(0.06, l - 0.026)),
    shadow: hslToHex(h + 0.005, s, Math.max(0.08, l - 0.013)),
    base: hslToHex(h, s, l),
    highlight: hslToHex(h - 0.005, Math.max(0, s * 0.92), Math.min(0.24, l + 0.015)),
    accent: hslToHex(h, Math.min(0.32, s * 1.15 + 0.04), Math.min(0.25, l + 0.032)),
  };
  floorPaletteCache.set(cacheKey, pal);
  return pal;
}

/**
 * Generates a 6-tone Hi-Bit pixel art color ramp for foreground sprites & furniture:
 * - Shadows shift cooler toward deep indigo/violet (#120d24)
 * - Highlights shift warmer toward sunlit gold/cream (#fff7d6)
 * - Outlines use "sel-out" (selective dark tinted contour)
 */
export function getRamp(hex: string): ColorRamp {
  const key = hex || '#64748b';
  const cached = rampCache.get(key);
  if (cached) return cached;

  const [r, g, b] = parseHex(key);

  const outline = rgbToHex(
    r * 0.18 + 10,
    g * 0.16 + 8,
    b * 0.22 + 16,
  );

  const deepShadow = rgbToHex(
    r * 0.48 + 8,
    g * 0.44 + 6,
    b * 0.56 + 18,
  );

  const shadow = rgbToHex(
    r * 0.72 + 6,
    g * 0.7 + 4,
    b * 0.78 + 12,
  );

  const light = rgbToHex(
    r + (255 - r) * 0.28 + 8,
    g + (250 - g) * 0.25 + 5,
    b + (225 - b) * 0.18,
  );

  const spec = rgbToHex(
    r + (255 - r) * 0.58 + 12,
    g + (255 - g) * 0.54 + 10,
    b + (245 - b) * 0.45 + 6,
  );

  const ramp: ColorRamp = {
    outline,
    deepShadow,
    shadow,
    base: key,
    light,
    spec,
    rgb: [r, g, b],
  };
  rampCache.set(key, ramp);
  return ramp;
}

export function pixelHash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export type PxFn = (lx: number, ly: number, lw?: number, lh?: number, color?: string) => void;

export function drawDropShadow(px: PxFn, x: number, y: number, w: number, h: number) {
  px(x + 1, y + 1, w - 2, h, 'rgba(6, 5, 14, 0.22)');
  px(x, y, w, h, 'rgba(6, 5, 14, 0.30)');
  if (w >= 6 && h >= 3) {
    px(x + 1, y, w - 2, h - 1, 'rgba(6, 5, 14, 0.42)');
  }
}

export function drawBevelBox(
  px: PxFn,
  x: number,
  y: number,
  w: number,
  h: number,
  hexColor: string,
  options?: { outline?: boolean; chamfer?: boolean; topHighlight?: boolean },
) {
  const ramp = getRamp(hexColor);
  const useOutline = options?.outline !== false;
  const chamfer = options?.chamfer ?? false;
  const topHi = options?.topHighlight !== false;

  if (useOutline) {
    if (chamfer && w >= 6 && h >= 6) {
      px(x + 1, y, w - 2, h, ramp.outline);
      px(x, y + 1, w, h - 2, ramp.outline);
    } else {
      px(x, y, w, h, ramp.outline);
    }
  }

  const ix = useOutline ? x + 1 : x;
  const iy = useOutline ? y + 1 : y;
  const iw = useOutline ? Math.max(1, w - 2) : w;
  const ih = useOutline ? Math.max(1, h - 2) : h;

  px(ix, iy, iw, ih, ramp.base);

  if (ih >= 3) {
    px(ix, iy + ih - 1, iw, 1, ramp.deepShadow);
  }
  if (ih >= 4) {
    px(ix, iy + ih - 2, iw, 1, ramp.shadow);
  }
  if (iw >= 4) {
    px(ix + iw - 1, iy, 1, ih - 1, ramp.shadow);
  }

  if (topHi && ih >= 2) {
    px(ix, iy, iw, 1, ramp.light);
    if (iw >= 3) {
      px(ix, iy, Math.min(3, iw - 1), 1, ramp.spec);
    }
  }
}

export function drawDitherRect(
  px: PxFn,
  x: number,
  y: number,
  w: number,
  h: number,
  colorA: string,
  colorB: string,
  density: 0.25 | 0.5 = 0.5,
) {
  px(x, y, w, h, colorA);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const hit =
        density === 0.5
          ? (dx + dy) % 2 === 0
          : dx % 2 === 0 && dy % 2 === 0;
      if (hit) {
        px(x + dx, y + dy, 1, 1, colorB);
      }
    }
  }
}

// ── Cached Offscreen Hi-Bit Tilemap Renderer ────────────────────────────────

interface CachedBackdrop {
  key: string;
  canvas: HTMLCanvasElement;
}

let cachedBackdrop: CachedBackdrop | null = null;

/**
 * Renders the static 448x288 (1x logical pixel) Hi-Bit architectural floor & wall tilemap.
 * Uses `getFloorPalette` so floor textures stay calm, low-contrast (ΔL <= 3%), and desaturated,
 * ensuring characters and workstations always pop in the foreground.
 */
export function getOrBuildHiBitBackdrop(tpl: TemplateManifest, tileSize: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const key = `v3:${tpl.id}:${tpl.grid.cols}x${tpl.grid.rows}:${tpl.theme.floor_primary}:${tpl.theme.wall_color}`;
  if (cachedBackdrop && cachedBackdrop.key === key) {
    return cachedBackdrop.canvas;
  }

  const { cols, rows, layout } = tpl.grid;
  const width = cols * tileSize;
  const height = rows * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const p = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  const wallRamp = getRamp(tpl.theme.wall_color || '#283246');
  const trimRamp = getRamp(tpl.theme.wall_trim || '#475569');
  const accentRamp = getRamp(tpl.theme.accent_color || '#38bdf8');

  // Normalized low-contrast floor palettes (strictly L = 11%..18%, S <= 24%)
  const corridorPal = getFloorPalette(tpl.theme.floor_primary || '#1a2232', 0.12, 0.16, 0.22);
  const bayPal = getFloorPalette(tpl.theme.floor_accent || '#1f293d', 0.13, 0.18, 0.24);
  const loungePal = getFloorPalette(tpl.theme.floor_secondary || '#151c28', 0.14, 0.19, 0.25);

  const tileAt = (c: number, r: number): string => {
    if (r < 0 || r >= rows || c < 0 || r >= rows || c >= cols) return 'W';
    return (layout[r] && layout[r][c]) || 'W';
  };

  // PASS 1: Calm, Low-Contrast Hi-Bit Floor Surfaces ('.', 'C', 'L')
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = tileAt(c, r);
      if (ch === 'W') continue;

      const tx = c * tileSize;
      const ty = r * tileSize;
      const isAlt = (c + r) % 2 === 0;
      const pal = ch === 'C' ? bayPal : ch === 'L' ? loungePal : corridorPal;

      if (tpl.id === 'cowboys') {
        // Wild West: Muted Espresso-Walnut Wide Planks & Cohesive Woven Frontier Lounge Rug
        if (ch === 'L') {
          // Cohesive deep crimson-russet woven saloon carpet (no per-tile yellow dots!)
          const rugPal = getFloorPalette('#3b1919', 0.14, 0.18, 0.28);
          p(tx, ty, tileSize, tileSize, isAlt ? rugPal.base : rugPal.shadow);
          // Subtle woven cross-thread every 4px
          p(tx, ty + 7, 16, 1, rugPal.highlight);
          p(tx + 7, ty, 1, 16, rugPal.seam);
          // Room-perimeter rug border only at edges of 'L' zone
          if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, rugPal.accent);
          if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, rugPal.accent);
          if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, rugPal.accent);
          if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, rugPal.accent);
        } else {
          // Calm 8px-tall wide timber planks with soft seams
          p(tx, ty, tileSize, tileSize, pal.base);
          p(tx, ty, 16, 7, isAlt ? pal.base : pal.shadow);
          p(tx, ty + 7, 16, 1, pal.seam);
          p(tx, ty + 8, 16, 7, isAlt ? pal.shadow : pal.base);
          p(tx, ty + 15, 16, 1, pal.seam);
          const j1 = ((c * 7 + r * 3) % 10) + 3;
          p(tx + j1, ty, 1, 7, pal.seam);
          const j2 = ((c * 5 + r * 7 + 5) % 10) + 3;
          p(tx + j2, ty + 8, 1, 7, pal.seam);
        }
      } else if (tpl.id === 'japanese') {
        // Edo Dojo: Calm Muted Moss-Sage 2x1 Tatami Mats & Dark Slate Stepping Stones
        if (ch === 'C' || ch === 'L') {
          const tatamiPal = getFloorPalette(ch === 'L' ? '#263324' : '#232e22', 0.14, 0.18, 0.22);
          p(tx, ty, tileSize, tileSize, (c + r) % 2 === 0 ? tatamiPal.base : tatamiPal.shadow);
          // Subtle rush-grass horizontal weave every 4px (low ΔL)
          for (let py = 2; py < 14; py += 4) {
            p(tx, ty + py, 16, 1, tatamiPal.highlight);
          }
          // Subtle muted brocade border (heri) spanning 2-tile-wide mats
          const heri = ch === 'L' ? '#382024' : '#1b2420';
          p(tx, ty + 15, 16, 1, heri);
          if (c % 2 === 0) {
            p(tx, ty, 1, 16, heri);
          }
        } else {
          // Calm dark river-slate corridor flagstones
          p(tx, ty, tileSize, tileSize, corridorPal.seam);
          p(tx + 1, ty + 1, 14, 14, isAlt ? corridorPal.base : corridorPal.shadow);
          p(tx + 1, ty + 1, 13, 1, corridorPal.highlight);
          p(tx + 8, ty + 1, 1, 14, corridorPal.seam);
        }
      } else if (tpl.id === 'cyberpunk') {
        // Neo-Tokyo: Deep Matte Gunmetal Decking with Whisper-Quiet Seams
        const cyPal = getFloorPalette(
          ch === 'C' ? '#161428' : ch === 'L' ? '#191326' : '#111320',
          0.10,
          0.15,
          0.24,
        );
        p(tx, ty, tileSize, tileSize, isAlt ? cyPal.base : cyPal.shadow);
        p(tx, ty + 15, 16, 1, cyPal.seam);
        p(tx + 15, ty, 1, 16, cyPal.seam);
        // Subtle corner rivet
        p(tx + 2, ty + 2, 1, 1, cyPal.highlight);
        // Sparse, low-alpha sub-floor trace only on every 3rd row so it never clutters
        if (r % 3 === 0 && (c + r) % 4 === 0) {
          p(tx + 3, ty + 8, 10, 1, ch === 'L' ? 'rgba(255, 0, 127, 0.14)' : 'rgba(0, 240, 255, 0.14)');
        }
      } else if (tpl.id === 'medieval') {
        // Arcane Citadel: Deep Weathered Slate Flagstones & Calm Courtyard Earth
        p(tx, ty, tileSize, tileSize, pal.seam);
        p(tx + 1, ty + 1, 14, 7, isAlt ? pal.base : pal.shadow);
        p(tx + 1, ty + 1, 13, 1, pal.highlight);
        p(tx + 1, ty + 9, 14, 6, isAlt ? pal.shadow : pal.base);
        const splitX = ((c * 5 + r * 3) % 8) + 4;
        p(tx + splitX, ty + 1, 1, 7, pal.seam);
        p(tx + 15 - splitX, ty + 9, 1, 6, pal.seam);
      } else if (tpl.id === 'ww2') {
        // Allied Bunker: Smooth Poured Ferro-Concrete Slabs with Clean Expansion Joints
        p(tx, ty, tileSize, tileSize, isAlt ? pal.base : pal.shadow);
        p(tx, ty + 15, 16, 1, pal.seam);
        p(tx + 15, ty, 1, 16, pal.seam);
        p(tx + 1, ty + 1, 14, 1, pal.highlight);
        // Subtle corner bolt only on 32x32 slab corners
        if (c % 2 === 0 && r % 2 === 0) {
          p(tx + 2, ty + 2, 1, 1, pal.seam);
        }
      } else {
        // Pixel HQ Office: Matte Slate Work Bays & Warm Muted Walnut Lounge Parquet
        if (ch === 'L') {
          const woodPal = getFloorPalette('#261e1b', 0.13, 0.17, 0.22);
          p(tx, ty, tileSize, tileSize, woodPal.base);
          p(tx, ty + 7, 16, 1, woodPal.seam);
          p(tx, ty + 15, 16, 1, woodPal.seam);
          const jx = ((c * 5 + r * 3) % 10) + 3;
          p(tx + jx, ty, 1, 7, woodPal.seam);
        } else {
          p(tx, ty, tileSize, tileSize, isAlt ? pal.base : pal.shadow);
          p(tx, ty + 15, 16, 1, pal.seam);
          p(tx + 15, ty, 1, 16, pal.seam);
          if (ch === '.' && isAlt) {
            p(tx + 1, ty + 1, 14, 1, pal.highlight);
          }
        }
      }
    }
  }

  // PASS 2: 2.5D Architectural Walls ('W') with Crown Molding, Elevation Façade & Baseboard
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tileAt(c, r) !== 'W') continue;
      const tx = c * tileSize;
      const ty = r * tileSize;
      const southIsFloor = tileAt(c, r + 1) !== 'W';
      const northIsFloor = tileAt(c, r - 1) !== 'W';
      const eastIsFloor = tileAt(c + 1, r) !== 'W';
      const westIsFloor = tileAt(c - 1, r) !== 'W';

      p(tx, ty, tileSize, tileSize, wallRamp.deepShadow);

      if (southIsFloor) {
        // 1. Top Crown Molding Cap (rows 0..3)
        p(tx, ty, 16, 1, trimRamp.outline);
        p(tx, ty + 1, 16, 1, trimRamp.light);
        p(tx, ty + 2, 16, 2, trimRamp.base);
        p(tx, ty + 4, 16, 1, wallRamp.outline);

        // 2. Wall Elevation Face (rows 5..12)
        p(tx, ty + 5, 16, 8, wallRamp.base);

        if (tpl.id === 'japanese') {
          p(tx + 1, ty + 5, 14, 7, '#d6d3d1');
          p(tx + 2, ty + 6, 12, 5, '#e7e5e4');
          p(tx, ty + 5, 2, 8, '#5c3a21');
          p(tx + 14, ty + 5, 2, 8, '#5c3a21');
          p(tx + 7, ty + 5, 2, 8, '#78350f');
          p(tx + 1, ty + 8, 14, 1, '#78350f');
        } else if (tpl.id === 'cowboys') {
          for (let bx = 0; bx < 16; bx += 4) {
            p(tx + bx, ty + 5, 3, 8, bx % 8 === 0 ? wallRamp.base : wallRamp.shadow);
            p(tx + bx + 3, ty + 5, 1, 8, wallRamp.deepShadow);
          }
          p(tx, ty + 9, 16, 1, trimRamp.shadow);
        } else if (tpl.id === 'medieval') {
          p(tx, ty + 5, 16, 8, wallRamp.deepShadow);
          p(tx + 1, ty + 5, 7, 3, wallRamp.base);
          p(tx + 9, ty + 5, 6, 3, wallRamp.shadow);
          p(tx + 1, ty + 9, 4, 3, wallRamp.shadow);
          p(tx + 6, ty + 9, 9, 3, wallRamp.base);
        } else if (tpl.id === 'cyberpunk') {
          for (let rx = 2; rx < 15; rx += 4) {
            p(tx + rx, ty + 5, 2, 8, wallRamp.shadow);
          }
          p(tx, ty + 10, 16, 1, c % 2 === 0 ? '#0891b2' : '#be185d');
          p(tx, ty + 11, 16, 1, wallRamp.outline);
        } else if (tpl.id === 'ww2') {
          p(tx, ty + 6, 16, 1, '#7f1d1d');
          p(tx, ty + 5, 16, 1, '#b91c1c');
          if (c % 3 === 0) {
            p(tx + 6, ty + 5, 2, 3, '#d97706');
          }
        } else {
          p(tx + 1, ty + 5, 14, 5, wallRamp.light);
          p(tx + 2, ty + 6, 12, 3, wallRamp.base);
          for (let sx = 1; sx < 15; sx += 2) {
            p(tx + sx, ty + 10, 1, 3, '#5c3e26');
          }
        }

        // 3. Baseboard Skirting Trim (rows 13..15)
        p(tx, ty + 13, 16, 1, trimRamp.base);
        p(tx, ty + 14, 16, 1, trimRamp.shadow);
        p(tx, ty + 15, 16, 1, wallRamp.outline);
      } else {
        p(tx + 1, ty + 1, 14, 14, wallRamp.shadow);
        p(tx + 2, ty + 2, 12, 12, wallRamp.deepShadow);
        if (eastIsFloor) {
          p(tx + 13, ty, 2, 16, trimRamp.base);
          p(tx + 15, ty, 1, 16, wallRamp.outline);
        }
        if (westIsFloor) {
          p(tx + 1, ty, 2, 16, trimRamp.light);
          p(tx, ty, 1, 16, wallRamp.outline);
        }
        if (northIsFloor) {
          p(tx, ty, 16, 1, wallRamp.outline);
          p(tx, ty + 1, 16, 2, trimRamp.shadow);
        }
      }

      if (southIsFloor && c % 4 === 2) {
        p(tx + 7, ty + 2, 2, 2, accentRamp.light);
      }
    }
  }

  // PASS 3: Soft Ambient Occlusion (AO) Cast by Walls onto Floors
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tileAt(c, r) === 'W') continue;
      const tx = c * tileSize;
      const ty = r * tileSize;

      if (tileAt(c, r - 1) === 'W') {
        p(tx, ty, 16, 2, 'rgba(6, 5, 15, 0.34)');
        p(tx, ty + 2, 16, 1, 'rgba(6, 5, 15, 0.16)');
      }
      if (tileAt(c - 1, r) === 'W') {
        p(tx, ty, 2, 16, 'rgba(6, 5, 15, 0.22)');
      }
      if (tileAt(c + 1, r) === 'W') {
        p(tx + 14, ty, 2, 16, 'rgba(6, 5, 15, 0.16)');
      }
    }
  }

  cachedBackdrop = { key, canvas };
  return canvas;
}
