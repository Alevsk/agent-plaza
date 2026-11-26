import {
  drawBevelBox,
  drawDitherRect,
  drawDropShadow,
  drawHiBitDeskBase,
  getFloorPalette,
  getRamp,
} from '../hibitPalette';
import { TILE_SIZE } from '../pixelEngine';
import type { SceneModule } from './types';

/**
 * 🏴‍☠️ PIRATES SCENE MODULE — "Crimson Galleon & Smuggler's Cove"
 * Weathered teak ship decking, tar-caulked seams, brass porthole bulkheads,
 * cannon gunports, captain's chart tables, ship's helm wheels, powder kegs,
 * kraken specimen tanks, treasure chests, and grog tavern barrels.
 */
export const piratesScene: SceneModule = {
  id: 'pirates',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt, pal }) => {
      if (ch === 'L') {
        // Captain's Quarterdeck Oriental Crimson-Gold Woven Rug (calm muted Layer 1)
        const rugPal = getFloorPalette('#3b1822', 0.13, 0.18, 0.25);
        p(tx, ty, 16, 16, isAlt ? rugPal.base : rugPal.shadow);
        p(tx, ty + 7, 16, 1, rugPal.highlight);
        p(tx + 7, ty, 1, 16, rugPal.seam);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, rugPal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, rugPal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, rugPal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, rugPal.accent);
      } else {
        // Weathered Teak Ship Decking with pitch-caulked horizontal seams & trunnel pegs
        p(tx, ty, 16, 16, pal.base);
        p(tx, ty, 16, 5, isAlt ? pal.base : pal.shadow);
        p(tx, ty + 5, 16, 1, pal.seam);
        p(tx, ty + 6, 16, 5, isAlt ? pal.shadow : pal.base);
        p(tx, ty + 11, 16, 1, pal.seam);
        p(tx, ty + 12, 16, 3, isAlt ? pal.base : pal.highlight);
        p(tx, ty + 15, 16, 1, pal.seam);
        const buttX = ((c * 7 + r * 5) % 10) + 3;
        p(tx + buttX, ty, 1, 5, pal.seam);
        p(tx + 15 - buttX, ty + 6, 1, 5, pal.seam);
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp, trimRamp }) => {
      // Ship Timber Bulkhead with Iron Rib Straps & Brass Porthole every 3rd tile
      p(tx, ty + 5, 16, 8, wallRamp.base);
      p(tx, ty + 8, 16, 1, wallRamp.deepShadow);
      p(tx + 15, ty + 5, 1, 8, trimRamp.shadow);
      if (c % 3 === 1) {
        // Round Brass Ship Porthole showing deep ocean blue
        p(tx + 5, ty + 6, 6, 6, '#d97706');
        p(tx + 6, ty + 7, 4, 4, '#0c4a6e');
        p(tx + 6, ty + 7, 2, 1, '#38bdf8');
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('pirate_')) return false;
    if (style === 'pirate_helm' || style === 'pirate_cannon_deck') {
      // Rope coil & tarred deck grating mat
      px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.26)');
      drawBevelBox(px, x + 2, y + 7, 12, 6, '#5c3820');
      px(x + 4, y + 9, 8, 1, '#3b2110');
      px(x + 4, y + 11, 8, 1, '#3b2110');
      return true;
    }
    // Iron-Hooped Rum Cask Stool
    drawDropShadow(px, x + 3, y + 11, 10, 4);
    drawBevelBox(px, x + 3, y + 6, 10, 7, '#78350f');
    px(x + 3, y + 8, 10, 1, '#94a3b8');
    px(x + 3, y + 11, 10, 1, '#94a3b8');
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('pirate_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#f59e0b';

    if (ws.style === 'pirate_chart_table') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#d97706');
      // Unrolled Nautical Treasure Map with Red X, Brass Compass & Sextant
      drawBevelBox(px, x + 3, y - 1, 16, 7, '#fef3c7');
      px(x + 5, y + 1, 6, 3, '#38bdf8'); // sea inlet on chart
      px(x + 12, y + 1, 5, 3, '#a16207'); // island contour
      // Crimson X marks the spot
      px(x + 14, y + 2, 2, 2, active && tick % 2 === 0 ? '#ef4444' : '#991b1b');
      // Brass compass & flickering candle
      drawBevelBox(px, x + 20, y, 5, 5, '#facc15');
      px(x + 22, y + 2, 1, 2, '#ef4444');
      drawBevelBox(px, x + 26, y - 2, 4, 6, '#f8fafc');
      px(x + 27, y - 4 + (active ? tick % 2 : 0), 2, 2, '#f97316');
      px(x + 27, y - 3, 1, 1, '#fef08a');
      return true;
    }

    if (ws.style === 'pirate_helm') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Raised Quarterdeck Plinth + Binnacle Compass + Ship's Spoked Mahogany Wheel
      drawBevelBox(px, x + 1, y + 4, 30, 10, '#5c3820');
      drawBevelBox(px, x + 4, y - 2, 8, 8, '#b45309'); // brass binnacle
      px(x + 6, y, 4, 3, active ? '#38bdf8' : '#1e3a8a');
      // Spoked Ship's Helm Wheel
      const turn = active ? tick % 2 : 0;
      drawBevelBox(px, x + 15, y - 4, 12, 11, '#78350f');
      px(x + 18, y - 1, 6, 5, '#1c1917');
      px(x + 20, y + 1, 2, 2, '#facc15'); // brass hub
      px(x + 14 - turn, y + 1, 2, 1, '#d97706'); // left spoke handle
      px(x + 26 + turn, y + 1, 2, 1, '#d97706'); // right spoke handle
      px(x + 20, y - 5 - turn, 2, 1, '#d97706'); // top spoke handle
      return true;
    }

    if (ws.style === 'pirate_cannon_deck') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Red Naval Gun Carriage + Cast-Iron 24-Pounder Cannon + Stacked Cannonballs
      drawBevelBox(px, x + 3, y + 5, 18, 9, '#991b1b');
      px(x + 5, y + 12, 3, 3, '#1c1917'); // carriage wheel
      px(x + 15, y + 12, 3, 3, '#1c1917');
      const recoil = active && tick % 6 === 0 ? 1 : 0;
      drawBevelBox(px, x + 5, y + 1 + recoil, 14, 6, '#334155');
      px(x + 7, y + 2 + recoil, 10, 1, '#94a3b8');
      // Pyramid of iron cannonballs & powder ramrod
      drawBevelBox(px, x + 22, y + 6, 8, 7, '#1e293b');
      px(x + 24, y + 4, 4, 2, '#475569');
      if (active) {
        // Lit linstock fuse & muzzle smoke puff
        px(x + 11, y - 1, 2, 2, '#f97316');
        px(x + 11 + (tick % 3), y - 2, 1, 1, '#fef08a');
        if (tick % 4 < 2) {
          px(x + 9, y - 3, 5, 2, 'rgba(226, 232, 240, 0.75)');
        }
      }
      return true;
    }

    if (ws.style === 'pirate_alchemy_rum') {
      drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', '#eab308');
      // Copper Rum Alembic Still & Glowing Sea-Glass Elixir Bottles
      drawBevelBox(px, x + 3, y - 3, 9, 9, '#d97706');
      px(x + 5, y - 1, 5, 2, '#fef08a');
      px(x + 12, y - 1, 5, 2, '#b45309'); // copper condenser coil
      drawBevelBox(px, x + 17, y - 2, 5, 7, '#10b981');
      drawBevelBox(px, x + 24, y - 1, 5, 6, '#a855f7');
      if (active) {
        const b = tick % 3;
        px(x + 19, y - 4 - b, 2, 2, '#6ee7b7');
        px(x + 26, y - 3 - ((b + 1) % 3), 1, 1, '#e879f9');
      }
      return true;
    }

    if (ws.style === 'pirate_carpenter') {
      drawHiBitDeskBase(px, x, y, '#92400e', '#5c3820', '#ca8a04');
      // Shipwright Hull Model, Brass Spyglass & Rope Splicing Vise
      drawBevelBox(px, x + 3, y - 2, 14, 7, '#b45309');
      px(x + 7, y - 5, 2, 4, '#f8fafc'); // miniature mast & sail
      px(x + 9, y - 4, 4, 3, '#fef3c7');
      drawBevelBox(px, x + 19, y + 1, 10, 4, '#facc15'); // brass spyglass
      if (active) {
        px(x + 8 + (tick % 5), y + 1, 2, 1, '#fef08a');
      }
      return true;
    }

    // Default pirate_chronometer / Crow's Nest Astrolabe & Ledger Desk
    drawHiBitDeskBase(px, x, y, '#78350f', '#451a03', glow);
    drawBevelBox(px, x + 3, y - 2, 11, 7, '#fef3c7');
    px(x + 5, y, 7, 1, '#78350f');
    px(x + 5, y + 2, 5 + (active ? tick % 3 : 0), 1, '#1e3a8a');
    drawBevelBox(px, x + 16, y - 3, 7, 8, '#eab308');
    px(x + 18, y - 1, 3, 4, active ? '#38bdf8' : '#0c4a6e');
    drawBevelBox(px, x + 25, y - 1, 5, 6, active ? '#f97316' : '#78350f');
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'pirate_treasure_chest': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 3, w - 4, h - 5, '#78350f');
        // Open chest lid & overflowing gold doubloons, rubies, and emeralds
        drawDitherRect(px, x + 4, y + 5, w - 8, 6, '#facc15', '#eab308', 0.5);
        px(x + 7, y + 6, 2, 2, '#ef4444'); // ruby
        px(x + 14, y + 7, 2, 2, '#22c55e'); // emerald
        px(x + 21, y + 6, 2, 2, '#38bdf8'); // sapphire
        // Sparkle glint
        const sx = x + 6 + ((tick * 5) % Math.max(6, w - 12));
        px(sx, y + 5, 2, 2, '#ffffff');
        return true;
      }
      case 'pirate_grog_bar': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        drawBevelBox(px, x + 1, y + 2, w - 2, 12, '#5c3820');
        drawBevelBox(px, x, y + 1, w, 4, '#92400e');
        // Brass rail & foaming pewter grog tankards + rum cask on counter
        px(x + 2, y + 13, w - 4, 1, '#facc15');
        drawBevelBox(px, x + 5, y - 3, 10, 6, '#78350f');
        px(x + 19, y - 2, 4, 4, '#94a3b8');
        px(x + 19, y - 3, 4, 2, '#ffffff'); // foam head
        px(x + 28, y - 2, 4, 4, '#15803d'); // rum bottle
        px(x + 38, y - 2, 4, 4, '#facc15'); // golden goblet
        return true;
      }
      case 'pirate_kraken_tank': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#083344');
        drawDitherRect(px, x + 4, y + 4, w - 8, h - 8, '#0e7490', '#06b6d4', 0.5);
        // Writhing bioluminescent Kraken tentacle inside brass-framed aquarium
        const sway = Math.round(Math.sin(time * 5) * 2);
        drawBevelBox(px, x + 10 + sway, y + 6, 8, h - 12, '#be185d');
        px(x + 12 + sway, y + 8, 2, 2, '#fbcfe8');
        px(x + 12 + sway, y + 13, 2, 2, '#fbcfe8');
        px(x + 7, y + 5 + (tick % 10), 2, 2, '#bae6fd');
        return true;
      }
      case 'pirate_cannon_rack': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#451a03');
        // Crossed cutlasses, flintlock pistols & stacked black powder kegs
        for (let ry = 5; ry < h - 6; ry += 8) {
          px(x + 4, y + ry, w - 8, 5, '#1c1917');
          px(x + 6, y + ry + 1, w - 12, 2, '#cbd5e1'); // cutlass blades
          px(x + 6, y + ry + 1, 3, 3, '#facc15'); // brass Basket hilt
        }
        return true;
      }
      case 'pirate_jolly_roger': {
        // Top Wall: Jolly Roger Skull & Crossbones Flag Banner
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#18181b');
        px(x + 4, y + 2, w - 8, 1, '#facc15');
        // Pixel skull & crossed bones in center
        const cx = x + Math.floor(w / 2);
        drawBevelBox(px, cx - 5, y + 3, 10, 7, '#f8fafc');
        px(cx - 3, y + 5, 2, 2, '#090d16');
        px(cx + 1, y + 5, 2, 2, '#090d16');
        px(cx - 9, y + 4, 4, 2, '#e2e8f0');
        px(cx + 5, y + 4, 4, 2, '#e2e8f0');
        return true;
      }
      case 'pirate_anchor': {
        drawDropShadow(px, x + 2, y + 12, w - 4, 3);
        drawBevelBox(px, x + 5, y + 1, 6, 12, '#334155');
        drawBevelBox(px, x + 2, y + 9, 12, 4, '#475569');
        px(x + 6, y + 3, 4, 2, '#facc15'); // brass shackle
        return true;
      }
      case 'pirate_ship_bell': {
        drawBevelBox(px, x + 3, y + 1, 10, 10, '#facc15');
        px(x + 5, y + 3, 4, 2, '#fef08a');
        px(x + 7, y + 10, 2, 2, '#b45309');
        return true;
      }
      case 'pirate_palm': {
        drawDropShadow(px, x + 2, y + 12, 12, 3);
        drawBevelBox(px, x + 4, y + 8, 8, 7, '#78350f');
        px(x + 7, y + 3, 2, 6, '#92400e');
        drawBevelBox(px, x + 2, y - 1, 12, 5, '#16a34a');
        px(x + 4, y, 8, 2, '#4ade80');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('pirate_')) return null;
    if (ws.style === 'pirate_cannon_deck' || ws.style === 'pirate_chart_table') {
      return {
        x: wx,
        y: wy,
        radius: isWorking ? 32 : 22,
        color: '#f59e0b',
        intensity: (isWorking ? 0.3 : 0.18) + flicker,
      };
    }
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 28 : 18,
      color: ws.glow_color || '#f59e0b',
      intensity: isWorking ? 0.24 : 0.12,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'pirate_treasure_chest') {
      return { x: cx, y: cy, radius: 34, color: '#facc15', intensity: 0.26 + flicker * 0.4 };
    }
    if (prop.type === 'pirate_kraken_tank') {
      return { x: cx, y: cy, radius: 34, color: '#06b6d4', intensity: 0.24 + flicker * 0.3 };
    }
    return null;
  },
};
