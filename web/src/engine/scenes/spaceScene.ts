import {
  drawBevelBox,
  drawDitherRect,
  drawDropShadow,
  drawHiBitDeskBase,
  drawHiBitMonitor,
  getFloorPalette,
} from '../hibitPalette';
import { TILE_SIZE } from '../pixelEngine';
import type { SceneModule } from './types';

/**
 * 🚀 SPACE STATION SCENE MODULE — "Aegis-IX Orbital Lab & Zero-G Command"
 * Titanium airlock deck plates, viewport windows looking into deep space,
 * zero-G hydroponic pods, orbital telescope arrays, plasma fusion cores,
 * EVA suit bays, star-chart holo domes, and synth-ration dispensers.
 */
export const spaceScene: SceneModule = {
  id: 'space',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt }) => {
      // Pressurized Titanium Hex-Grid Deck Plates (strictly Layer 1 low-contrast)
      const deckPal = getFloorPalette(
        ch === 'C' ? '#141d2e' : ch === 'L' ? '#172336' : '#101726',
        0.11,
        0.17,
        0.24,
      );
      p(tx, ty, 16, 16, isAlt ? deckPal.base : deckPal.shadow);
      p(tx, ty + 15, 16, 1, deckPal.seam);
      p(tx + 15, ty, 1, 16, deckPal.seam);
      p(tx + 1, ty + 1, 3, 1, deckPal.highlight);
      // Subtle recessed airlock safety stripe every 4th tile
      if ((c + r) % 4 === 0) {
        p(tx + 6, ty + 8, 4, 1, ch === 'L' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(129, 140, 248, 0.15)');
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp, trimRamp }) => {
      // Orbital Bulkhead with Starfield Viewport Windows & Hazard Chevrons
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx, ty + 11, 16, 1, trimRamp.shadow);
      if (c % 3 === 0) {
        // Armored Space Viewport Window
        p(tx + 2, ty + 5, 12, 6, '#090d16');
        p(tx + 3, ty + 6, 10, 4, '#020617');
        p(tx + 5, ty + 7, 1, 1, '#ffffff'); // star
        p(tx + 10, ty + 8, 1, 1, '#38bdf8'); // nebula star
      } else {
        p(tx + 2, ty + 6, 12, 4, wallRamp.shadow);
        p(tx + 7, ty + 7, 2, 2, '#38bdf8');
      }
    },
  },

  drawChair: (px, x, y, accent, style) => {
    if (!style.startsWith('space_')) return false;
    drawDropShadow(px, x + 2, y + 8, 12, 6);
    // White & Cyan Mag-Lev Flight Command Seat
    drawBevelBox(px, x + 2, y + 5, 12, 8, '#cbd5e1');
    px(x + 4, y + 6, 8, 4, '#1e293b');
    px(x + 4, y + 5, 8, 1, accent || '#38bdf8');
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('space_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#38bdf8';

    if (ws.style === 'space_flight_console') {
      drawHiBitDeskBase(px, x, y, '#cbd5e1', '#334155', glow);
      drawHiBitMonitor(px, x + 2, y - 4, 13, 8, active, '#38bdf8', tick, '#475569');
      drawHiBitMonitor(px, x + 16, y - 4, 13, 8, active, glow, tick + 2, '#475569');
      if (active) {
        px(x + 6 + (tick % 18), y + 4, 3, 1, '#38bdf8');
      }
      return true;
    }

    if (ws.style === 'space_telescope') {
      drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', '#818cf8');
      // Deep-Space Exoplanet Spectrometer & Gold-Foil James Webb Mirror Array
      drawBevelBox(px, x + 3, y - 4, 12, 10, '#0f172a');
      drawDitherRect(px, x + 5, y - 2, 8, 6, '#facc15', '#eab308', 0.5);
      if (active) {
        px(x + 8, y, 2, 2, '#ffffff');
      }
      drawHiBitMonitor(px, x + 17, y - 3, 12, 8, active, '#a855f7', tick, '#334155');
      return true;
    }

    if (ws.style === 'space_hydroponics') {
      drawHiBitDeskBase(px, x, y, '#334155', '#1e293b', '#22c55e');
      // Pressurized Bio-Dome Terrarium with UV Grow Lamps & Alien Flora
      drawBevelBox(px, x + 3, y - 4, 26, 10, '#064e3b');
      drawDitherRect(px, x + 5, y - 2, 22, 6, '#065f46', '#047857', 0.5);
      for (let gx = 7; gx < 25; gx += 5) {
        drawBevelBox(px, x + gx, y - 1, 4, 4, '#22c55e');
        px(x + gx + 1, y - 2 + (active ? (tick + gx) % 2 : 0), 2, 2, '#4ade80');
      }
      // UV top light strip
      px(x + 5, y - 3, 22, 1, active ? '#e879f9' : '#a855f7');
      return true;
    }

    if (ws.style === 'space_fusion_core') {
      drawHiBitDeskBase(px, x, y, '#334155', '#0f172a', '#06b6d4');
      // Magnetic Tokamak Plasma Containment Torus
      const pulse = active ? Math.round(Math.sin(time * 9) * 1) : 0;
      drawBevelBox(px, x + 4, y - 4, 13, 10, '#1e293b');
      drawBevelBox(px, x + 6, y - 2 + pulse, 9, 6, '#06b6d4');
      px(x + 8, y - 1 + pulse, 5, 3, '#ffffff');
      drawHiBitMonitor(px, x + 19, y - 3, 10, 8, active, '#38bdf8', tick, '#334155');
      return true;
    }

    if (ws.style === 'space_xenobiology') {
      drawHiBitDeskBase(px, x, y, '#cbd5e1', '#475569', '#10b981');
      // Zero-G Stasis Containment Cylinder & Electron Microscope
      drawBevelBox(px, x + 4, y - 4, 10, 10, '#083344');
      const bob = active ? tick % 2 : 0;
      drawBevelBox(px, x + 6, y - 2 + bob, 6, 5, '#10b981');
      px(x + 8, y - 1 + bob, 2, 2, '#a7f3d0');
      drawHiBitMonitor(px, x + 16, y - 3, 13, 8, active, '#10b981', tick, '#334155');
      return true;
    }

    // Default space_nav_dome
    drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', glow);
    drawBevelBox(px, x + 8, y - 4, 16, 9, '#0c4a6e');
    px(x + 11, y - 2, 10, 5, '#38bdf8');
    if (active) {
      px(x + 13 + (tick % 5), y, 2, 2, '#ffffff');
    }
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'space_starmap': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 2, y + 2, w - 4, h - 4, '#1e293b');
        drawDitherRect(px, x + 4, y + 4, w - 8, h - 8, '#0c4a6e', '#0284c7', 0.5);
        // Orbiting Planet & Moon Rings in Holographic Projection
        const orbit = Math.round(Math.cos(time * 4) * 6);
        drawBevelBox(px, x + Math.floor(w / 2) - 5, y + Math.floor(h / 2) - 4, 10, 8, '#38bdf8');
        px(x + Math.floor(w / 2) - 2, y + Math.floor(h / 2) - 2, 4, 3, '#ffffff');
        px(x + Math.floor(w / 2) + orbit, y + Math.floor(h / 2) - 6, 3, 3, '#f472b6');
        return true;
      }
      case 'space_eva_pod': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#334155');
        // Stored White Astronaut EVA Suit with Gold Reflection Visor
        drawBevelBox(px, x + 6, y + 4, w - 12, 8, '#f8fafc');
        px(x + 8, y + 6, w - 16, 4, '#f59e0b');
        drawBevelBox(px, x + 5, y + 13, w - 10, h - 16, '#e2e8f0');
        px(x + 8, y + 16, 4, 3, '#38bdf8');
        return true;
      }
      case 'space_synth_bar': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#cbd5e1');
        drawBevelBox(px, x + 3, y + 4, w - 6, 6, '#0f172a');
        px(x + 5, y + 6, 8, 2, '#38bdf8');
        px(x + 17, y + 6, 8, 2, '#a855f7');
        px(x + 29, y + 6, 8, 2, '#22c55e');
        return true;
      }
      case 'space_gravity_ring': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#1e293b');
        const spin = tick % 4;
        drawBevelBox(px, x + 6, y + 4 + spin, w - 12, 6, '#38bdf8');
        px(x + 9, y + 6 + spin, w - 18, 2, '#ffffff');
        return true;
      }
      case 'space_telemetry_wall': {
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#334155');
        px(x + 4, y + 3, w - 8, 8, '#020617');
        px(x + 6, y + 5, 18, 2, '#38bdf8');
        px(x + 28, y + 4, 12, 6, '#1e1b4b');
        px(x + 30 + (tick % 7), y + 6, 3, 2, '#22c55e');
        return true;
      }
      case 'space_oxygen_scrubber': {
        drawDropShadow(px, x + 2, y + 12, 12, 3);
        drawBevelBox(px, x + 3, y + 1, 10, 13, '#cbd5e1');
        px(x + 5, y + 4, 6, 4, '#38bdf8');
        px(x + 6, y + 10, 4, 2, tick % 2 === 0 ? '#22c55e' : '#065f46');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('space_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 30 : 20,
      color: ws.glow_color || '#38bdf8',
      intensity: (isWorking ? 0.26 : 0.14) + flicker * 0.3,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'space_starmap' || prop.type === 'space_gravity_ring') {
      return { x: cx, y: cy, radius: 36, color: '#38bdf8', intensity: 0.26 + flicker * 0.3 };
    }
    return null;
  },
};
