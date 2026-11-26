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
 * ❄️ ARCTIC RESEARCH OUTPOST SCENE MODULE — "Polar Aurora Station & Ice Core Lab"
 * Insulated steel expedition flooring, frost-rimmed thermal windows, glacial ice-core
 * drills, aurora borealis magnetometers, seismic arrays, geothermal hot springs,
 * and expedition cocoa stoves.
 */
export const arcticScene: SceneModule = {
  id: 'arctic',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt }) => {
      if (ch === 'L') {
        // Heated Cedar Sauna & Thermal Lodge Planks (Layer 1 warm muted amber-pine)
        const lodgePal = getFloorPalette('#2b211a', 0.13, 0.18, 0.24);
        p(tx, ty, 16, 16, isAlt ? lodgePal.base : lodgePal.shadow);
        p(tx, ty + 7, 16, 1, lodgePal.seam);
        p(tx, ty + 15, 16, 1, lodgePal.seam);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, lodgePal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, lodgePal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, lodgePal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, lodgePal.accent);
      } else {
        // Insulated Polar Outpost Composite Decking
        const icePal = getFloorPalette(ch === 'C' ? '#162433' : '#121d2b', 0.12, 0.17, 0.24);
        p(tx, ty, 16, 16, isAlt ? icePal.base : icePal.shadow);
        p(tx, ty + 15, 16, 1, icePal.seam);
        p(tx + 15, ty, 1, 16, icePal.seam);
        if ((c + r) % 4 === 0) {
          p(tx + 2, ty + 2, 3, 1, icePal.highlight);
        }
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp }) => {
      // High-Visibility Expedition Orange & Frost-Insulated Bulkhead Panels
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx, ty + 10, 16, 2, '#ea580c'); // safety orange polar stripe
      if (c % 3 === 1) {
        // Triple-glazed frost window showing aurora teal sky
        p(tx + 3, ty + 5, 10, 5, '#083344');
        p(tx + 4, ty + 6, 8, 2, '#2dd4bf');
        p(tx + 4, ty + 8, 3, 1, '#e0f2fe'); // frost corner
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('arctic_')) return false;
    drawDropShadow(px, x + 3, y + 10, 10, 4);
    // Thermal Orange Padded Expedition Task Seat
    drawBevelBox(px, x + 3, y + 6, 10, 7, '#ea580c');
    px(x + 4, y + 7, 8, 3, '#334155');
    return true;
  },

  drawWorkstation: (px, ws, active, _time, tick) => {
    if (!ws.style.startsWith('arctic_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#38bdf8';

    if (ws.style === 'arctic_ice_core') {
      drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', '#38bdf8');
      // Illuminated Translucent Glacial Ice-Core Cylinder + Laser Scanner
      drawBevelBox(px, x + 3, y - 3, 15, 8, '#0284c7');
      px(x + 5, y - 1, 11, 3, '#bae6fd');
      if (active) {
        const lx = x + 5 + (tick % 10);
        px(lx, y - 3, 1, 7, '#f43f5e'); // laser scan beam
      }
      drawHiBitMonitor(px, x + 19, y - 3, 10, 8, active, '#38bdf8', tick, '#334155');
      return true;
    }

    if (ws.style === 'arctic_aurora_scope') {
      drawHiBitDeskBase(px, x, y, '#334155', '#0f172a', '#2dd4bf');
      // Aurora Borealis Magnetometer Dome & Spectral Waveform Display
      drawBevelBox(px, x + 3, y - 4, 14, 9, '#042f2e');
      for (let ax = 5; ax < 15; ax += 2) {
        const ah = active ? 2 + ((tick + ax) % 4) : 2;
        px(x + ax, y + 3 - ah, 2, ah, ax % 4 === 1 ? '#2dd4bf' : '#a855f7');
      }
      drawHiBitMonitor(px, x + 18, y - 3, 11, 8, active, '#2dd4bf', tick, '#1e293b');
      return true;
    }

    if (ws.style === 'arctic_seismic_rig') {
      drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', '#f97316');
      // Paper Drum Seismograph Plotter & Sub-Glacial Sonar
      drawBevelBox(px, x + 4, y - 3, 13, 8, '#f8fafc');
      const waveY = active ? tick % 3 : 1;
      px(x + 6, y - 1 + waveY, 9, 1, '#ef4444');
      drawHiBitMonitor(px, x + 18, y - 3, 11, 8, active, '#f97316', tick, '#334155');
      return true;
    }

    if (ws.style === 'arctic_cryo_botany') {
      drawHiBitDeskBase(px, x, y, '#334155', '#1e293b', '#4ade80');
      // Heated Sub-Zero Alpine Lichen & Moss Incubator
      drawBevelBox(px, x + 4, y - 3, 24, 9, '#064e3b');
      px(x + 7, y - 1, 7, 4, '#22c55e');
      px(x + 17, y - 1, 7, 4, '#38bdf8');
      if (active) {
        px(x + 9, y - 2, 3, 1, '#fef08a');
      }
      return true;
    }

    // Default arctic_weather_comms
    drawHiBitDeskBase(px, x, y, '#475569', '#1e293b', glow);
    drawHiBitMonitor(px, x + 3, y - 4, 13, 8, active, glow, tick, '#334155');
    drawBevelBox(px, x + 18, y - 3, 10, 8, '#ea580c');
    px(x + 20, y - 1, 6, 3, active ? '#4ade80' : '#0f172a');
    return true;
  },

  drawProp: (px, prop, _time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'arctic_hot_spring': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        // Steaming Geothermal Rock Pool surrounded by snow-dusted boulders
        drawBevelBox(px, x + 1, y + 1, w - 2, h - 2, '#475569');
        px(x + 3, y + 2, 8, 2, '#e2e8f0'); // snow cap on rock rim
        drawDitherRect(px, x + 4, y + 4, w - 8, h - 8, '#0284c7', '#38bdf8', 0.5);
        const sy = tick % 4;
        px(x + 12, y + 5 - sy, 3, 2, 'rgba(255,255,255,0.7)');
        px(x + w - 18, y + 7 - ((sy + 2) % 4), 3, 2, 'rgba(255,255,255,0.7)');
        return true;
      }
      case 'arctic_cocoa_bar': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#ea580c');
        drawBevelBox(px, x + 4, y - 4, 12, 8, '#cbd5e1');
        px(x + 8, y - 6 - (tick % 3), 2, 2, 'rgba(255,255,255,0.8)');
        drawBevelBox(px, x + 20, y - 1, 5, 4, '#ef4444'); // hot cocoa mug
        drawBevelBox(px, x + 28, y - 1, 5, 4, '#38bdf8');
        return true;
      }
      case 'arctic_ice_vault': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#1e293b');
        for (let ry = 5; ry < h - 6; ry += 7) {
          px(x + 5, y + ry, w - 10, 4, '#38bdf8');
          px(x + 7, y + ry + 1, w - 14, 1, '#e0f2fe');
        }
        return true;
      }
      case 'arctic_snowcat_rack': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#c2410c');
        drawBevelBox(px, x + 5, y + 4, w - 10, 9, '#0f172a');
        px(x + 7, y + 6, w - 14, 4, '#38bdf8');
        drawBevelBox(px, x + 5, y + 16, w - 10, 9, '#334155');
        return true;
      }
      case 'arctic_hearth_stove': {
        drawDropShadow(px, x + 2, y + 12, w - 4, 4);
        drawBevelBox(px, x + 3, y + 1, w - 6, 13, '#1e293b');
        const f = tick % 3;
        px(x + 7, y + 5 - f, w - 14, 6, '#f97316');
        px(x + 9, y + 6 - f, w - 18, 4, '#fef08a');
        return true;
      }
      case 'arctic_aurora_map': {
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#334155');
        px(x + 4, y + 3, w - 8, 8, '#042f2e');
        px(x + 6, y + 5, 18, 2, '#2dd4bf');
        px(x + 28, y + 6, 18, 2, '#a855f7');
        return true;
      }
      case 'arctic_frost_pine': {
        drawDropShadow(px, x + 3, y + 12, 10, 3);
        drawBevelBox(px, x + 4, y + 8, 8, 6, '#475569');
        drawBevelBox(px, x + 3, y + 1, 10, 8, '#0d9488');
        px(x + 5, y + 1, 6, 2, '#e0f2fe'); // snow-covered pine crown
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('arctic_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 30 : 20,
      color: ws.glow_color || '#38bdf8',
      intensity: (isWorking ? 0.26 : 0.14) + flicker * 0.3,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'arctic_hearth_stove') {
      return { x: cx, y: cy, radius: 38, color: '#f97316', intensity: 0.32 + flicker };
    }
    if (prop.type === 'arctic_hot_spring') {
      return { x: cx, y: cy, radius: 34, color: '#38bdf8', intensity: 0.22 };
    }
    return null;
  },
};
