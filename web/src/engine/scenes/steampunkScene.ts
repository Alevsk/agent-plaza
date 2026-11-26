import {
  drawBevelBox,
  drawDropShadow,
  drawHiBitDeskBase,
  getFloorPalette,
} from '../hibitPalette';
import { TILE_SIZE } from '../pixelEngine';
import type { SceneModule } from './types';

/**
 * 🧪 STEAMPUNK AIRSHIP SCENE MODULE — "Aether-Zeppelin & Clockwork Foundry"
 * Riveted brass & mahogany deck plates, copper steam pipes, spinning clockwork
 * gears, Tesla aether coils, difference-engine punch looms, pressure boilers,
 * and Victorian espresso automats.
 */
export const steampunkScene: SceneModule = {
  id: 'steampunk',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt }) => {
      if (ch === 'L') {
        // Victorian Officer's Emerald-Velvet Salon Carpet (Layer 1 calm muted teal-green)
        const velvetPal = getFloorPalette('#162b28', 0.13, 0.18, 0.25);
        p(tx, ty, 16, 16, isAlt ? velvetPal.base : velvetPal.shadow);
        p(tx, ty + 7, 16, 1, velvetPal.highlight);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, velvetPal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, velvetPal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, velvetPal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, velvetPal.accent);
      } else {
        // Riveted Brass-Bound Ironwood Airship Decking
        const brassPal = getFloorPalette(ch === 'C' ? '#292018' : '#211a14', 0.12, 0.17, 0.24);
        p(tx, ty, 16, 16, isAlt ? brassPal.base : brassPal.shadow);
        p(tx, ty + 15, 16, 1, brassPal.seam);
        p(tx + 15, ty, 1, 16, brassPal.seam);
        p(tx + 2, ty + 2, 1, 1, brassPal.highlight);
        p(tx + 13, ty + 2, 1, 1, brassPal.highlight);
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp }) => {
      // Copper-Piped Boiler Bulkhead with Brass Pressure Gauges
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx, ty + 7, 16, 2, '#b45309'); // horizontal copper steam pipe
      p(tx, ty + 7, 16, 1, '#f59e0b');
      if (c % 3 === 1) {
        // Round White-Dial Pressure Manometer Gauge
        p(tx + 5, ty + 6, 6, 6, '#eab308');
        p(tx + 6, ty + 7, 4, 4, '#fef3c7');
        p(tx + 7, ty + 8, 2, 1, '#dc2626');
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('steam_')) return false;
    drawDropShadow(px, x + 3, y + 10, 10, 4);
    // Brass-Spring Piston & Tufted Leather Machinist Stool
    px(x + 6, y + 10, 4, 4, '#d97706');
    drawBevelBox(px, x + 3, y + 6, 10, 5, '#78350f');
    px(x + 4, y + 6, 8, 1, '#facc15');
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('steam_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#f59e0b';

    if (ws.style === 'steam_clockwork_forge') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#f59e0b');
      // Interlocking Brass & Copper Escapement Gears + Jeweler's Loupe
      const spin = active ? tick % 2 : 0;
      drawBevelBox(px, x + 4, y - 3, 10, 9, '#eab308');
      px(x + 7 + spin, y, 4, 3, '#78350f');
      drawBevelBox(px, x + 15, y - 2, 8, 8, '#d97706');
      px(x + 18 - spin, y + 1, 2, 2, '#fef08a');
      drawBevelBox(px, x + 24, y - 3, 5, 8, '#b45309');
      if (active && tick % 3 === 0) {
        px(x + 25, y - 6, 2, 2, 'rgba(255,255,255,0.75)'); // steam puff
      }
      return true;
    }

    if (ws.style === 'steam_aether_coil') {
      drawHiBitDeskBase(px, x, y, '#451a03', '#292524', '#38bdf8');
      // Twin Brass Tesla Coils with Crackling Cyan Aether Arcs
      drawBevelBox(px, x + 4, y - 5, 7, 11, '#d97706');
      drawBevelBox(px, x + 21, y - 5, 7, 11, '#d97706');
      drawBevelBox(px, x + 12, y - 1, 8, 6, '#083344');
      if (active) {
        const ay = (tick % 3) - 1;
        px(x + 11, y - 3 + ay, 10, 1, '#38bdf8');
        px(x + 14, y - 4 - ay, 4, 1, '#ffffff');
      }
      return true;
    }

    if (ws.style === 'steam_babbage_loom') {
      drawHiBitDeskBase(px, x, y, '#92400e', '#5c3820', '#facc15');
      // Charles Babbage Analytical Engine Brass Cylinders & Punch Cards
      drawBevelBox(px, x + 3, y - 4, 16, 10, '#b45309');
      for (let cx = 5; cx < 17; cx += 3) {
        const off = active ? (tick + cx) % 3 : 0;
        px(x + cx, y - 2 + off, 2, 5, '#fef08a');
      }
      drawBevelBox(px, x + 20, y - 2, 9, 7, '#fef3c7'); // punch card stack
      px(x + 22, y, 5, 1, '#1c1917');
      return true;
    }

    if (ws.style === 'steam_airship_helm') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Brass Airship Bridge Wheel, Altitude Barometer & Telegraph Chadburn
      drawBevelBox(px, x + 1, y + 3, 30, 11, '#5c3820');
      drawBevelBox(px, x + 4, y - 3, 7, 9, '#facc15'); // engine telegraph
      px(x + 6, y - 1, 3, 3, '#fef3c7');
      drawBevelBox(px, x + 13, y - 4, 11, 10, '#92400e');
      px(x + 17, y, 3, 3, '#facc15');
      drawBevelBox(px, x + 25, y - 2, 5, 8, '#06b6d4'); // aether compass
      return true;
    }

    if (ws.style === 'steam_boiler_bench') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#ef4444');
      // Riveted Copper Pressure Boiler with Glowing Firebox Grate & Whistle
      drawBevelBox(px, x + 3, y - 4, 16, 10, '#c2410c');
      px(x + 6, y + 1, 10, 3, active ? '#facc15' : '#dc2626');
      drawBevelBox(px, x + 21, y - 5, 6, 11, '#eab308');
      if (active) {
        const sy = tick % 4;
        px(x + 23, y - 7 - sy, 3, 2, 'rgba(255,255,255,0.8)');
      }
      return true;
    }

    // Default steam_drafting_desk
    drawHiBitDeskBase(px, x, y, '#92400e', '#5c3820', glow);
    drawBevelBox(px, x + 4, y - 1, 16, 7, '#1e3a8a'); // cyanotype blueprint
    px(x + 7, y + 1, 10, 3, '#93c5fd');
    drawBevelBox(px, x + 22, y - 2, 6, 7, active ? '#facc15' : '#b45309');
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'steam_turbine_core': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#9a3412');
        const spin = tick % 3;
        drawBevelBox(px, x + 6, y + 5, w - 12, 10, '#eab308');
        px(x + 9 + spin, y + 8, 6, 4, '#fef08a');
        drawBevelBox(px, x + 6, y + 17, w - 12, 9, '#083344');
        px(x + 8, y + 19, w - 16, 5, '#38bdf8');
        return true;
      }
      case 'steam_automaton': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 3, y + 1, w - 6, h - 2, '#451a03');
        // Brass Clockwork Automaton Knight on Calibration Stand
        drawBevelBox(px, x + 8, y + 4, w - 16, 7, '#facc15');
        px(x + 10, y + 6, 2, 2, '#38bdf8');
        px(x + 14, y + 6, 2, 2, '#38bdf8');
        drawBevelBox(px, x + 6, y + 12, w - 12, h - 16, '#d97706');
        return true;
      }
      case 'steam_espresso_bar': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#78350f');
        drawBevelBox(px, x + 4, y - 5, 14, 9, '#d97706');
        px(x + 8, y - 8 - (tick % 3), 3, 2, 'rgba(255,255,255,0.75)');
        drawBevelBox(px, x + 22, y - 1, 5, 4, '#f8fafc');
        drawBevelBox(px, x + 32, y - 1, 5, 4, '#facc15');
        return true;
      }
      case 'steam_orrery': {
        drawDropShadow(px, x + 2, y + h - 3, w - 4, 4);
        drawBevelBox(px, x + 2, y + 4, w - 4, h - 6, '#5c3820');
        const orb = Math.round(Math.cos(time * 4) * 8);
        drawBevelBox(px, x + Math.floor(w / 2) - 5, y + 7, 10, 8, '#facc15');
        px(x + Math.floor(w / 2) + orb, y + 9, 4, 4, '#38bdf8');
        return true;
      }
      case 'steam_pressure_board': {
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#78350f');
        for (let gx = 6; gx < w - 10; gx += 12) {
          drawBevelBox(px, x + gx, y + 3, 8, 8, '#eab308');
          px(x + gx + 2, y + 5, 4, 4, '#fef3c7');
        }
        return true;
      }
      case 'steam_pipe_organ': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 2, y - 4, w - 4, 18, '#78350f');
        for (let pxOff = 4; pxOff < w - 6; pxOff += 4) {
          px(x + pxOff, y - 3, 2, 9, '#facc15');
        }
        px(x + 4, y + 7, w - 8, 3, '#f8fafc');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('steam_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 32 : 22,
      color: ws.glow_color || '#f59e0b',
      intensity: (isWorking ? 0.28 : 0.16) + flicker * 0.5,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'steam_turbine_core' || prop.type === 'steam_orrery') {
      return { x: cx, y: cy, radius: 36, color: '#f59e0b', intensity: 0.26 + flicker * 0.5 };
    }
    return null;
  },
};
