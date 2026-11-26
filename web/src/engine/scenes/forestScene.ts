import {
  drawBevelBox,
  drawDitherRect,
  drawDropShadow,
  drawHiBitDeskBase,
  getFloorPalette,
} from '../hibitPalette';
import { TILE_SIZE } from '../pixelEngine';
import type { SceneModule } from './types';

/**
 * 🌲 ENCHANTED FOREST SCENE MODULE — "Sylvan World-Tree & Elven Grove"
 * Mossy ancient stone tiles, living heartwood balconies, bioluminescent mushroom
 * rings, moonwell scrying pools, herbalist root tables, crystal harps, and
 * runic standing stones.
 */
export const forestScene: SceneModule = {
  id: 'forest',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt }) => {
      if (ch === 'L') {
        // Moonlit Moss-Velvet Glade Carpet (Layer 1 calm muted green)
        const gladePal = getFloorPalette('#1b3326', 0.13, 0.18, 0.25);
        p(tx, ty, 16, 16, isAlt ? gladePal.base : gladePal.shadow);
        p(tx + 3, ty + 5, 3, 1, gladePal.highlight);
        p(tx + 10, ty + 11, 3, 1, gladePal.highlight);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, gladePal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, gladePal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, gladePal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, gladePal.accent);
      } else {
        // Elven Heartwood & Moss-Grown Flagstone Walkways
        const stonePal = getFloorPalette(ch === 'C' ? '#1f2b22' : '#18241c', 0.12, 0.17, 0.23);
        p(tx, ty, 16, 16, stonePal.seam);
        p(tx + 1, ty + 1, 14, 14, isAlt ? stonePal.base : stonePal.shadow);
        p(tx + 2, ty + 1, 11, 1, stonePal.highlight);
        const mx = ((c * 7 + r * 3) % 9) + 3;
        p(tx + mx, ty + 7, 1, 8, stonePal.seam);
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp, trimRamp }) => {
      // Carved Elven Heartwood Archways & Ivy-Draped Living Bark
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx + 2, ty + 5, 12, 7, wallRamp.shadow);
      p(tx + 7, ty + 5, 2, 8, trimRamp.base);
      if (c % 2 === 0) {
        // Hanging emerald vine & glowing fairy blossom
        p(tx + 3, ty + 5, 2, 4, '#15803d');
        p(tx + 11, ty + 5, 2, 5, '#16a34a');
        p(tx + 11, ty + 9, 2, 2, '#34d399');
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('forest_')) return false;
    drawDropShadow(px, x + 3, y + 10, 10, 4);
    // Carved Mossy Tree-Stump Stool with Spiral Grain
    drawBevelBox(px, x + 3, y + 6, 10, 7, '#78350f');
    px(x + 4, y + 7, 8, 2, '#a16207');
    px(x + 3, y + 6, 3, 2, '#16a34a'); // moss cap on rim
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('forest_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#34d399';

    if (ws.style === 'forest_moonwell') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Carved Silver-Stone Moonwell Basin with Shimmering Starlight Water
      drawBevelBox(px, x + 1, y + 2, 30, 12, '#475569');
      drawDitherRect(px, x + 4, y + 4, 24, 8, '#0284c7', '#38bdf8', 0.5);
      const ripple = (tick * 2) % 14;
      px(x + 7 + ripple, y + 6, 5, 2, '#bae6fd');
      if (active) {
        const floatY = Math.round(Math.sin(time * 7) * 1.5);
        drawBevelBox(px, x + 13, y - 3 + floatY, 6, 6, '#a7f3d0');
        px(x + 15, y - 1 + floatY, 2, 2, '#ffffff');
      }
      return true;
    }

    if (ws.style === 'forest_mushroom_loom') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#22c55e');
      // Bioluminescent Azure & Magenta Mushroom Clusters + Silk Spore Loom
      drawBevelBox(px, x + 3, y - 4, 9, 5, '#06b6d4');
      px(x + 5, y - 3, 2, 2, '#cffafe');
      px(x + 6, y + 1, 3, 4, '#e2e8f0');
      drawBevelBox(px, x + 13, y - 3, 7, 4, '#ec4899');
      px(x + 15, y + 1, 3, 4, '#fbcfe8');
      drawBevelBox(px, x + 21, y - 2, 8, 7, '#a16207');
      if (active) {
        px(x + 6 + (tick % 12), y - 6 - (tick % 2), 2, 2, '#6ee7b7');
      }
      return true;
    }

    if (ws.style === 'forest_herbalist') {
      drawHiBitDeskBase(px, x, y, '#65a30d', '#3f6212', '#4ade80');
      // Living Root Apothecary Mortar, Sun-Dew Vials & Golden Lotus
      drawBevelBox(px, x + 3, y - 2, 8, 6, '#15803d');
      px(x + 5, y - 3, 4, 3, '#f472b6'); // blooming lotus
      drawBevelBox(px, x + 13, y - 2, 5, 6, '#34d399');
      drawBevelBox(px, x + 19, y - 2, 5, 6, '#facc15');
      drawBevelBox(px, x + 25, y - 1, 4, 5, '#a855f7');
      if (active) {
        px(x + 15, y - 4 - (tick % 2), 2, 2, '#a7f3d0');
      }
      return true;
    }

    if (ws.style === 'forest_runestone') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Moss-Clad Druid Standing Stones with Floating Emerald Glyphs
      drawBevelBox(px, x + 2, y + 4, 28, 10, '#334155');
      drawBevelBox(px, x + 5, y - 4, 8, 12, '#475569');
      drawBevelBox(px, x + 19, y - 4, 8, 12, '#475569');
      const runeCol = active ? '#4ade80' : '#065f46';
      px(x + 8, y - 1, 2, 5, runeCol);
      px(x + 22, y - 1, 2, 5, runeCol);
      if (active) {
        px(x + 14, y - 2 - (tick % 3), 4, 4, '#34d399');
        px(x + 15, y - 1 - (tick % 3), 2, 2, '#ffffff');
      }
      return true;
    }

    if (ws.style === 'forest_crystal_harp') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#5c3820', '#eab308');
      // Elven Golden Bow-Harp with Shimmering Starlight Strings
      drawBevelBox(px, x + 4, y - 5, 12, 10, '#eab308');
      for (let sx = 6; sx <= 12; sx += 2) {
        px(x + sx, y - 3, 1, 6, active && (tick + sx) % 2 === 0 ? '#ffffff' : '#6ee7b7');
      }
      drawBevelBox(px, x + 18, y - 1, 10, 6, '#fef3c7'); // leaf scroll
      return true;
    }

    // Default forest_leaf_scriptorium
    drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', glow);
    drawBevelBox(px, x + 4, y - 1, 14, 7, '#bbf7d0');
    px(x + 6, y + 1, 8, 1, '#166534');
    if (active) {
      px(x + 6, y + 3, 4 + (tick % 5), 1, '#15803d');
    }
    drawBevelBox(px, x + 21, y - 3, 6, 7, active ? glow : '#10b981');
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'forest_world_tree': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        // Ancient Golden-Leafed World-Tree Sapling with Glowing Roots
        drawBevelBox(px, x + Math.floor(w / 2) - 5, y + 10, 10, h - 12, '#78350f');
        drawBevelBox(px, x + 3, y + 1, w - 6, 12, '#15803d');
        drawBevelBox(px, x + 7, y - 2, w - 14, 8, '#22c55e');
        px(x + 10 + (tick % 10), y + 3, 3, 2, '#fef08a');
        return true;
      }
      case 'forest_fairy_pond': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 1, y + 1, w - 2, h - 2, '#3f6212');
        drawDitherRect(px, x + 4, y + 4, w - 8, h - 8, '#0d9488', '#2dd4bf', 0.5);
        const f1 = Math.round(Math.sin(time * 4) * 6);
        px(x + Math.floor(w / 2) + f1, y + 8, 3, 3, '#fef08a');
        px(x + Math.floor(w / 2) - f1, y + 14, 2, 2, '#a7f3d0');
        return true;
      }
      case 'forest_nectar_bar': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#5c3820');
        drawBevelBox(px, x, y + 1, w, 4, '#15803d');
        px(x + 6, y - 2, 4, 4, '#facc15');
        px(x + 16, y - 2, 4, 4, '#34d399');
        px(x + 28, y - 2, 4, 4, '#f472b6');
        return true;
      }
      case 'forest_crystal_cluster': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 4, y + 6, 8, h - 8, '#10b981');
        drawBevelBox(px, x + 11, y + 2, 9, h - 4, '#34d399');
        drawBevelBox(px, x + 19, y + 7, 7, h - 9, '#059669');
        px(x + 14, y + 4, 2, 6, '#ffffff');
        return true;
      }
      case 'forest_scroll_arch': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#5c3820');
        for (let sy = 5; sy < h - 6; sy += 8) {
          px(x + 4, y + sy, w - 8, 5, '#14532d');
          px(x + 6, y + sy + 1, 5, 3, '#fef08a');
          px(x + 14, y + sy + 1, 5, 3, '#6ee7b7');
        }
        return true;
      }
      case 'forest_elven_banner': {
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#065f46');
        px(x + 4, y + 2, w - 8, 1, '#facc15');
        drawBevelBox(px, x + Math.floor(w / 2) - 6, y + 3, 12, 7, '#34d399');
        px(x + Math.floor(w / 2) - 2, y + 5, 4, 3, '#fef08a');
        return true;
      }
      case 'forest_glow_shroom': {
        drawDropShadow(px, x + 3, y + 12, 10, 3);
        px(x + 7, y + 7, 2, 6, '#e2e8f0');
        drawBevelBox(px, x + 3, y + 2, 10, 6, '#06b6d4');
        px(x + 5, y + 3, 2, 2, '#ffffff');
        px(x + 9, y + 4, 2, 1, '#cffafe');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('forest_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 32 : 22,
      color: ws.glow_color || '#34d399',
      intensity: (isWorking ? 0.28 : 0.16) + flicker * 0.4,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'forest_fairy_pond' || prop.type === 'forest_crystal_cluster' || prop.type === 'forest_world_tree') {
      return { x: cx, y: cy, radius: 36, color: '#34d399', intensity: 0.26 + flicker * 0.4 };
    }
    return null;
  },
};
