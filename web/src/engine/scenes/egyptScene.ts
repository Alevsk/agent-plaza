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
 * 🏛️ ANCIENT EGYPT SCENE MODULE — "Pharaoh's Pyramid & Sun-Disk Sanctuary"
 * Warm limestone flagstones, lapis-lazuli & gold hieroglyphic reliefs,
 * papyrus scriptoriums, celestial sun-disk altars, canopic alchemy benches,
 * sphinx guardians, oasis lotus pools, and golden chariot forges.
 */
export const egyptScene: SceneModule = {
  id: 'egypt',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt }) => {
      if (ch === 'L') {
        // Royal Lapis-Lazuli & Gold Mosaic Sanctuary Floor (Layer 1 calm muted blue-gold)
        const lapisPal = getFloorPalette('#182438', 0.13, 0.18, 0.26);
        p(tx, ty, 16, 16, isAlt ? lapisPal.base : lapisPal.shadow);
        p(tx, ty + 15, 16, 1, lapisPal.seam);
        p(tx + 15, ty, 1, 16, lapisPal.seam);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, lapisPal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, lapisPal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, lapisPal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, lapisPal.accent);
      } else {
        // Dressed Desert Limestone Blocks with Fine Sand-Mortar Joints
        const sandPal = getFloorPalette(ch === 'C' ? '#2b2218' : '#241c14', 0.13, 0.18, 0.24);
        p(tx, ty, 16, 16, sandPal.seam);
        p(tx + 1, ty + 1, 14, 14, isAlt ? sandPal.base : sandPal.shadow);
        p(tx + 1, ty + 1, 12, 1, sandPal.highlight);
        if ((c + r) % 3 === 0) {
          p(tx + 8, ty + 1, 1, 14, sandPal.seam);
        }
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp }) => {
      // Sandstone Temple Wall with Recessed Hieroglyphic Cartouches & Lapis Frieze
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx, ty + 5, 16, 2, '#1e3a8a'); // lapis lazuli upper band
      p(tx + 2, ty + 5, 4, 1, '#facc15');
      p(tx + 10, ty + 5, 4, 1, '#facc15');
      if (c % 2 === 0) {
        // Carved golden ankh / eye cartouche relief
        p(tx + 5, ty + 8, 6, 4, wallRamp.deepShadow);
        p(tx + 7, ty + 9, 2, 2, '#eab308');
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('egypt_')) return false;
    drawDropShadow(px, x + 3, y + 10, 10, 4);
    // Gilded Ebony Folding X-Stool with Leopard/Linen Cushion
    px(x + 4, y + 10, 2, 4, '#1c1917');
    px(x + 10, y + 10, 2, 4, '#1c1917');
    drawBevelBox(px, x + 3, y + 6, 10, 5, '#eab308');
    px(x + 5, y + 7, 6, 2, '#fef3c7');
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('egypt_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#facc15';

    if (ws.style === 'egypt_papyrus_desk') {
      drawHiBitDeskBase(px, x, y, '#a16207', '#78350f', '#facc15');
      // Unrolled Nile Papyrus Scroll, Reed Brush & Turquoise Ink Wells
      drawBevelBox(px, x + 3, y - 1, 16, 7, '#fef08a');
      px(x + 5, y + 1, 4, 2, '#1d4ed8'); // painted Horus eye glyph
      px(x + 11, y + 1, 5 + (active ? tick % 3 : 0), 1, '#78350f');
      px(x + 11, y + 3, 4, 1, '#dc2626');
      drawBevelBox(px, x + 21, y, 4, 5, '#06b6d4');
      drawBevelBox(px, x + 26, y - 1, 4, 6, '#facc15');
      return true;
    }

    if (ws.style === 'egypt_sun_altar') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Stepped Limestone Altar with Levitating Golden Aten Sun-Disk
      drawBevelBox(px, x + 2, y + 4, 28, 10, '#a16207');
      drawBevelBox(px, x + 6, y + 1, 20, 5, '#ca8a04');
      const floatY = active ? Math.round(Math.sin(time * 7) * 1.5) : 0;
      drawBevelBox(px, x + 11, y - 6 + floatY, 10, 8, '#facc15');
      px(x + 14, y - 4 + floatY, 4, 4, '#ffffff');
      if (active) {
        px(x + 8, y - 3 + floatY, 2, 1, '#fef08a');
        px(x + 22, y - 3 + floatY, 2, 1, '#fef08a');
      }
      return true;
    }

    if (ws.style === 'egypt_jeweler') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#06b6d4');
      // Pharaoh's Broad Collar Necklace of Lapis, Carnelian & Gold + Jeweler's Anvil
      drawBevelBox(px, x + 4, y - 2, 14, 7, '#1e3a8a');
      px(x + 6, y, 10, 3, '#facc15');
      px(x + 8, y + 1, 6, 1, '#06b6d4');
      drawBevelBox(px, x + 20, y - 1, 8, 6, '#eab308');
      if (active) {
        px(x + 10 + (tick % 6), y - 2, 2, 2, '#ffffff');
      }
      return true;
    }

    if (ws.style === 'egypt_astronomer') {
      drawHiBitDeskBase(px, x, y, '#1e3a8a', '#172554', '#facc15');
      // Dendera Zodiac Star-Disk & Golden Merkhet Sighting Rod
      drawBevelBox(px, x + 4, y - 3, 14, 9, '#facc15');
      px(x + 6, y - 1, 10, 5, '#0f172a');
      px(x + 8 + (active ? tick % 6 : 0), y + 1, 2, 2, '#38bdf8');
      drawBevelBox(px, x + 20, y - 4, 8, 9, '#ca8a04');
      return true;
    }

    if (ws.style === 'egypt_canopic_bench') {
      drawHiBitDeskBase(px, x, y, '#854d0e', '#713f12', '#22c55e');
      // Four Alabaster & Lapis Canopic Jars + Sacred Natron Incense Burner
      const colors = ['#facc15', '#38bdf8', '#ef4444', '#22c55e'];
      for (let j = 0; j < 4; j++) {
        drawBevelBox(px, x + 3 + j * 6, y - 2, 5, 7, colors[j]);
        px(x + 4 + j * 6, y - 4, 3, 2, '#eab308');
      }
      if (active) {
        px(x + 27, y - 3 - (tick % 3), 2, 2, '#fde047');
      }
      return true;
    }

    // Default egypt_hieroglyph_wall / Stele Chisel Bench
    drawHiBitDeskBase(px, x, y, '#a16207', '#78350f', glow);
    drawBevelBox(px, x + 6, y - 5, 20, 10, '#ca8a04');
    px(x + 9, y - 3, 14, 6, '#1e3a8a');
    px(x + 11, y - 1, 4 + (active ? tick % 6 : 0), 2, '#facc15');
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'egypt_sarcophagus': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        // Gilded Royal Sarcophagus with Lapis Nemes Stripes
        drawBevelBox(px, x + 4, y + 1, w - 8, h - 2, '#eab308');
        for (let sy = 4; sy < h - 5; sy += 4) {
          px(x + 6, y + sy, w - 12, 2, '#1e3a8a');
        }
        px(x + 9, y + 5, w - 18, 4, '#fef08a');
        return true;
      }
      case 'egypt_obelisk': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 3, y + 10, w - 6, h - 12, '#a16207');
        drawBevelBox(px, x + 6, y + 1, w - 12, 12, '#facc15');
        const pulse = Math.round(Math.sin(time * 5) * 1);
        px(x + 9, y + 3 + pulse, w - 18, 5, '#38bdf8');
        px(x + 11, y + 4 + pulse, 2, 2, '#ffffff');
        return true;
      }
      case 'egypt_oasis_pool': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 1, y + 1, w - 2, h - 2, '#ca8a04');
        drawDitherRect(px, x + 4, y + 4, w - 8, h - 8, '#0284c7', '#38bdf8', 0.5);
        // Floating Blue Nile Lotus Blossoms
        drawBevelBox(px, x + 8, y + 7, 6, 5, '#16a34a');
        px(x + 10, y + 8, 2, 2, '#fef08a');
        drawBevelBox(px, x + w - 18, y + 12, 6, 5, '#15803d');
        px(x + w - 16, y + 13, 2, 2, '#f472b6');
        return true;
      }
      case 'egypt_sphinx': {
        drawDropShadow(px, x + 2, y + 12, w - 4, 4);
        drawBevelBox(px, x + 2, y + 5, w - 4, 9, '#d97706');
        drawBevelBox(px, x + 6, y - 1, 14, 8, '#facc15');
        px(x + 8, y + 1, 10, 2, '#1e3a8a');
        return true;
      }
      case 'egypt_scroll_jar': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#78350f');
        for (let sy = 5; sy < h - 6; sy += 8) {
          px(x + 4, y + sy, w - 8, 5, '#1c1917');
          px(x + 6, y + sy + 1, 4, 4, '#facc15');
          px(x + 12, y + sy + 1, 4, 4, '#06b6d4');
          px(x + 18, y + sy + 1, 4, 4, '#ef4444');
        }
        return true;
      }
      case 'egypt_winged_sun': {
        // Top Wall: Winged Sun-Disk of Horus Relief
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#1e3a8a');
        drawBevelBox(px, x + 6, y + 4, w - 12, 6, '#facc15');
        drawBevelBox(px, x + Math.floor(w / 2) - 5, y + 2, 10, 9, '#ef4444');
        px(x + Math.floor(w / 2) - 2, y + 4, 4, 4, '#fef08a');
        return true;
      }
      case 'egypt_brazier': {
        drawDropShadow(px, x + 3, y + 12, 10, 3);
        drawBevelBox(px, x + 3, y + 6, 10, 8, '#eab308');
        const f = tick % 3;
        px(x + 5, y + 2 - f, 6, 5, '#f97316');
        px(x + 6, y + 3 - f, 4, 3, '#fef08a');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('egypt_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 32 : 22,
      color: ws.glow_color || '#facc15',
      intensity: (isWorking ? 0.28 : 0.16) + flicker * 0.4,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'egypt_obelisk' || prop.type === 'egypt_brazier') {
      return { x: cx, y: cy, radius: 34, color: '#f59e0b', intensity: 0.28 + flicker };
    }
    if (prop.type === 'egypt_oasis_pool') {
      return { x: cx, y: cy, radius: 32, color: '#38bdf8', intensity: 0.18 };
    }
    return null;
  },
};
