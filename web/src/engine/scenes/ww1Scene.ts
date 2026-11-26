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
 * 🪖 WW1 TRENCHES SCENE MODULE — "Western Front Trench & Dugout HQ"
 * Muddy earth lined with wooden A-frame duckboards, burlap sandbag parapets,
 * corrugated-iron dugout walls, fire-step periscopes, crank field telephones,
 * carrier pigeon coops (Cher Ami), Vickers water-cooled machine-gun posts,
 * biplane reconnaissance photo benches, brass-horn gramophones, and Flanders poppies.
 */
export const ww1Scene: SceneModule = {
  id: 'ww1',

  backdrop: {
    floorTile: ({ p, tx, ty, ch, c, r, isAlt, tileAt }) => {
      if (ch === 'L') {
        // Officers' Timber Dugout Mess Planks (Layer 1 calm muted warm oak-umber)
        const dugoutPal = getFloorPalette('#292017', 0.13, 0.18, 0.23);
        p(tx, ty, 16, 16, isAlt ? dugoutPal.base : dugoutPal.shadow);
        p(tx, ty + 7, 16, 1, dugoutPal.seam);
        p(tx, ty + 15, 16, 1, dugoutPal.seam);
        if (tileAt(c - 1, r) !== 'L') p(tx, ty, 2, 16, dugoutPal.accent);
        if (tileAt(c + 1, r) !== 'L') p(tx + 14, ty, 2, 16, dugoutPal.accent);
        if (tileAt(c, r - 1) !== 'L') p(tx, ty, 16, 2, dugoutPal.accent);
        if (tileAt(c, r + 1) !== 'L') p(tx, ty + 14, 16, 2, dugoutPal.accent);
      } else {
        // Western Front Trench Mud with Wooden Duckboard Slats (strictly Layer 1 low-contrast)
        const mudPal = getFloorPalette(ch === 'C' ? '#231d17' : '#1e1914', 0.11, 0.16, 0.22);
        p(tx, ty, 16, 16, isAlt ? mudPal.base : mudPal.shadow);
        // Subtle horizontal duckboard timber runners & cross-slats
        p(tx + 2, ty, 12, 16, mudPal.base);
        p(tx + 3, ty, 1, 16, mudPal.seam);
        p(tx + 12, ty, 1, 16, mudPal.seam);
        for (let sy = 2; sy < 15; sy += 4) {
          p(tx + 2, ty + sy, 12, 2, mudPal.highlight);
          p(tx + 2, ty + sy + 2, 12, 1, mudPal.seam);
        }
        if ((c + r) % 5 === 0) {
          p(tx + 1, ty + 6, 1, 3, mudPal.seam);
        }
      }
    },

    wallFace: ({ p, tx, ty, c, wallRamp }) => {
      // Stacked Burlap Sandbag Parapet over Corrugated Iron & Timber Shoring Posts
      p(tx, ty + 5, 16, 8, wallRamp.base);
      // Upper 2 courses of staggered tan sandbags (rows 5..8)
      const bagA = '#786242';
      const bagB = '#635035';
      p(tx + 1, ty + 5, 6, 2, bagA);
      p(tx + 8, ty + 5, 7, 2, bagB);
      p(tx, ty + 7, 4, 2, bagB);
      p(tx + 5, ty + 7, 6, 2, bagA);
      p(tx + 12, ty + 7, 4, 2, bagB);
      // Lower corrugated iron & vertical timber trench brace (rows 9..12)
      for (let ix = 0; ix < 16; ix += 2) {
        p(tx + ix, ty + 9, 1, 4, ix % 4 === 0 ? '#3f454d' : '#2d3238');
      }
      if (c % 2 === 0) {
        p(tx + 7, ty + 5, 2, 8, '#4a321e'); // heavy oak shoring post
      }
    },
  },

  drawChair: (px, x, y, _accent, style) => {
    if (!style.startsWith('ww1_')) return false;
    if (style === 'ww1_periscope_post' || style === 'ww1_vickers_post') {
      // Elevated Timber Fire-Step Duckboard Grating
      px(x + 2, y + 8, 12, 5, 'rgba(8, 6, 14, 0.28)');
      drawBevelBox(px, x + 2, y + 7, 12, 6, '#5c4028');
      px(x + 4, y + 9, 8, 1, '#3b2818');
      px(x + 4, y + 11, 8, 1, '#3b2818');
      return true;
    }
    // Stenciled Wooden Munitions Box Stool
    drawDropShadow(px, x + 3, y + 11, 10, 4);
    drawBevelBox(px, x + 3, y + 6, 10, 6, '#6b4c30');
    px(x + 4, y + 8, 8, 1, '#3b2818');
    px(x + 5, y + 7, 6, 1, '#a16207');
    return true;
  },

  drawWorkstation: (px, ws, active, time, tick) => {
    if (!ws.style.startsWith('ww1_')) return false;
    const x = ws.col * TILE_SIZE;
    const y = ws.row * TILE_SIZE;
    const glow = ws.glow_color || '#f59e0b';

    if (ws.style === 'ww1_periscope_post') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Burlap Sandbag Parapet + Box Trench Periscope + Brass Flare Pistol & Whistle
      drawBevelBox(px, x + 1, y + 4, 30, 10, '#5c4028');
      for (let bx = 2; bx < 26; bx += 8) {
        drawBevelBox(px, x + bx, y + 1, 8, 5, '#856d47');
        drawBevelBox(px, x + bx + 2, y - 2, 8, 4, '#9a7f56');
      }
      // Tall Khaki Periscope Tube extending above sandbags
      const scan = active ? (tick % 3) - 1 : 0;
      drawBevelBox(px, x + 13 + scan, y - 6, 5, 13, '#3f6212');
      px(x + 14 + scan, y - 5, 3, 2, active ? '#38bdf8' : '#0c4a6e'); // top prism lens
      // Brass flare gun & trench whistle on firing shelf
      drawBevelBox(px, x + 22, y + 5, 6, 4, '#d97706');
      if (active && tick % 4 === 0) {
        px(x + 15 + scan, y - 5, 1, 1, '#ffffff'); // lens glint
      }
      return true;
    }

    if (ws.style === 'ww1_field_telephone') {
      drawHiBitDeskBase(px, x, y, '#6b4c30', '#4a321e', '#ca8a04');
      // Leather-Bound Crank Field Telephone + Copper Wire Reel + Tin Candle Lantern
      drawBevelBox(px, x + 3, y - 2, 11, 7, '#78350f');
      px(x + 5, y - 3, 7, 2, '#d97706'); // brass handset on cradle
      px(x + 14, y, 2, 2, '#facc15'); // magneto hand crank
      // Spool of copper field wire
      drawBevelBox(px, x + 17, y - 2, 7, 7, '#334155');
      px(x + 19, y, 3, 3, '#b45309');
      // Flickering candle inside ration tin
      drawBevelBox(px, x + 25, y - 1, 5, 6, '#94a3b8');
      const f = active ? tick % 2 : 0;
      px(x + 27, y - 3 - f, 2, 2, '#f97316');
      px(x + 27, y - 2 - f, 1, 1, '#fef08a');
      return true;
    }

    if (ws.style === 'ww1_pigeon_coop') {
      drawHiBitDeskBase(px, x, y, '#785532', '#4a321e', '#a16207');
      // Wicker Carrier-Pigeon Hutch ("Cher Ami") + Message Capsule Pad
      drawBevelBox(px, x + 2, y - 5, 16, 10, '#a16207');
      px(x + 4, y - 3, 12, 6, '#292524'); // dark coop interior
      // Two Hi-Bit Carrier Pigeons inside & perched on roof
      const bob = active ? tick % 2 : 0;
      px(x + 6, y - 1 - bob, 4, 3, '#cbd5e1');
      px(x + 7, y - 1 - bob, 1, 1, '#10b981'); // iridescent neck band
      px(x + 12, y - 6 + bob, 5, 4, '#e2e8f0');
      px(x + 16, y - 5 + bob, 1, 1, '#f97316'); // beak
      // Message pad & tiny aluminum leg capsules on right
      drawBevelBox(px, x + 20, y - 1, 9, 6, '#fef3c7');
      px(x + 22, y + 1, 5, 1, '#1c1917');
      if (active) {
        px(x + 11, y - 7, 2, 2, '#ffffff'); // fluttering wing feather
      }
      return true;
    }

    if (ws.style === 'ww1_vickers_post') {
      drawDropShadow(px, x + 1, y + 12, 30, 4);
      // Sandbag Embrasure + Water-Cooled Brass-Jacket Vickers Machine Gun + Condenser Can
      drawBevelBox(px, x + 1, y + 3, 10, 9, '#856d47');
      drawBevelBox(px, x + 21, y + 3, 10, 9, '#856d47');
      // Tripod & corrugated brass water jacket
      px(x + 12, y + 8, 8, 5, '#3f6212');
      drawBevelBox(px, x + 11, y, 10, 8, '#ca8a04');
      px(x + 13, y + 1, 6, 4, '#facc15');
      // Canvas cartridge belt & water condenser tin can
      px(x + 7, y + 5, 5, 2, '#fde047');
      drawBevelBox(px, x + 22, y + 6, 5, 6, '#475569');
      if (active) {
        // Muzzle flash & steam puff from water condenser hose
        if (tick % 2 === 0) {
          px(x + 14, y - 3, 4, 3, '#fef08a');
          px(x + 15, y - 4, 2, 2, '#f97316');
        }
        px(x + 24, y + 3 - (tick % 3), 2, 2, 'rgba(255,255,255,0.75)');
      }
      return true;
    }

    if (ws.style === 'ww1_biplane_rig') {
      drawHiBitDeskBase(px, x, y, '#6b4c30', '#4a321e', '#d97706');
      // Laminated Mahogany Two-Blade Biplane Propeller & Aerial Recon Photo Lightbox
      drawBevelBox(px, x + 3, y - 3, 13, 8, '#fef3c7');
      px(x + 5, y - 1, 9, 4, '#78716c'); // black-and-white trench aerial photo
      px(x + 6, y, 7, 1, '#1c1917'); // zig-zag trench line on photo
      // Polished wooden Sopwith propeller with brass hub
      drawBevelBox(px, x + 18, y - 1, 12, 4, '#92400e');
      px(x + 23, y, 2, 2, '#facc15');
      if (active) {
        px(x + 6 + (tick % 6), y + 1, 2, 1, '#ef4444'); // red recon magnifying marker
      }
      return true;
    }

    // Default ww1_trench_map (Candle-Lit Western Front Sector Map Table)
    drawHiBitDeskBase(px, x, y, '#6b4c30', '#4a321e', glow);
    drawBevelBox(px, x + 3, y - 1, 19, 7, '#fef3c7');
    // Red & Blue Front-Line Trench Zig-Zags on Paper Map
    px(x + 6, y + 1, 12, 1, '#dc2626');
    px(x + 6, y + 3, 12, 1, '#2563eb');
    if (active) {
      px(x + 8 + (tick % 8), y + 2, 2, 2, '#facc15');
    }
    // Wax candle in green glass wine bottle
    drawBevelBox(px, x + 24, y - 1, 5, 6, '#15803d');
    px(x + 25, y - 3, 3, 2, '#f8fafc');
    px(x + 26, y - 5 + (active ? tick % 2 : 0), 2, 2, '#f97316');
    return true;
  },

  drawProp: (px, prop, time, tick) => {
    const x = prop.col * TILE_SIZE;
    const y = prop.row * TILE_SIZE;
    const w = (prop.w || 1) * TILE_SIZE;
    const h = (prop.h || 1) * TILE_SIZE;

    switch (prop.type) {
      case 'ww1_brazier_stove': {
        drawDropShadow(px, x + 2, y + 12, w - 4, 4);
        // Perforated Iron Coke-Coal Trench Brazier & Boiling Tin Billy-Can
        drawBevelBox(px, x + 4, y + 3, w - 8, 11, '#292524');
        const f = tick % 3;
        px(x + 7, y + 6, w - 14, 4, '#dc2626');
        px(x + 8, y + 2 - f, w - 16, 4, '#f97316');
        px(x + 10, y + 3 - f, w - 20, 2, '#fef08a');
        return true;
      }
      case 'ww1_gramophone': {
        drawDropShadow(px, x + 2, y + 12, w - 4, 4);
        // Oak Cabinet Gramophone with Large Flared Brass Horn
        drawBevelBox(px, x + 4, y + 6, w - 8, 8, '#78350f');
        px(x + 7, y + 5, w - 14, 2, '#18181b'); // spinning 78rpm shellac disc
        drawBevelBox(px, x + 8, y - 4, 14, 9, '#facc15');
        px(x + 11, y - 2, 8, 5, '#ca8a04');
        if (tick % 2 === 0) {
          px(x + 22, y - 6 - (tick % 3), 2, 2, '#fef08a');
        }
        return true;
      }
      case 'ww1_sandbag_parapet': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < w - 8; c += 8) {
            drawBevelBox(px, x + 2 + c + (r % 2) * 2, y + 5 + r * 5, 8, 5, '#856d47');
          }
        }
        // Resting Lee-Enfield rifle & fixed bayonet
        px(x + 10, y + 2, 14, 2, '#78350f');
        px(x + 24, y + 2, 5, 1, '#cbd5e1');
        return true;
      }
      case 'ww1_duckboard_crate': {
        drawDropShadow(px, x + 1, y + 12, w - 2, 4);
        // Quartermaster Ration Table with Stoneware "SRD" Rum Jars & Biscuit Tins
        drawBevelBox(px, x + 1, y + 3, w - 2, 11, '#5c4028');
        drawBevelBox(px, x + 5, y - 3, 7, 7, '#d6d3d1'); // stoneware rum jug
        px(x + 6, y - 3, 5, 2, '#78350f');
        drawBevelBox(px, x + 15, y - 2, 8, 6, '#475569'); // tin ration box
        drawBevelBox(px, x + 26, y - 2, 6, 6, '#b45309'); // enamel tea mug
        px(x + 28, y - 4 - (tick % 3), 2, 2, 'rgba(255,255,255,0.7)');
        return true;
      }
      case 'ww1_mortar_rack': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        // Green Stokes Trench Mortar Tube & Brass Artillery Shell Rack
        drawBevelBox(px, x + 2, y + 1, w - 4, h - 2, '#3b2818');
        for (let sy = 5; sy < h - 6; sy += 8) {
          px(x + 4, y + sy, w - 8, 6, '#1c1917');
          for (let sx = 6; sx < w - 6; sx += 5) {
            px(x + sx, y + sy + 1, 3, 5, '#eab308'); // brass 18-pdr shell casing
            px(x + sx, y + sy + 1, 3, 1, '#94a3b8'); // nose fuse
          }
        }
        return true;
      }
      case 'ww1_barbed_wire': {
        drawDropShadow(px, x + 1, y + h - 3, w - 2, 4);
        // Timber X-Frame Chevaux-de-Frise with Coiled Concertina Barbed Wire
        drawBevelBox(px, x + 3, y + 2, w - 6, h - 4, '#4a321e');
        for (let wx = 5; wx < w - 7; wx += 4) {
          px(x + wx, y + 4, 3, h - 8, '#64748b');
          px(x + wx + 1, y + 6, 1, 1, '#e2e8f0'); // barb glint
          px(x + wx + 1, y + 14, 1, 1, '#e2e8f0');
        }
        return true;
      }
      case 'ww1_trench_clock': {
        // Top Wall: Western Front Zero-Hour Trench Attack Board & Brass Whistle
        drawBevelBox(px, x + 2, y + 1, w - 4, 12, '#4a321e');
        px(x + 4, y + 3, w - 8, 8, '#1c1917');
        px(x + 7, y + 5, 14, 2, '#fef3c7');
        px(x + 7, y + 8, 20, 1, '#ef4444');
        drawBevelBox(px, x + w - 16, y + 3, 10, 8, '#eab308');
        return true;
      }
      case 'ww1_poppy_planter': {
        // Flanders Red Poppies growing in a polished brass artillery shell casing
        drawDropShadow(px, x + 3, y + 12, 10, 3);
        drawBevelBox(px, x + 4, y + 7, 8, 8, '#ca8a04');
        px(x + 5, y + 3, 6, 5, '#15803d');
        const sway = Math.round(Math.sin(time * 3) * 1);
        px(x + 4 + sway, y + 1, 3, 3, '#dc2626'); // red Flanders poppy 1
        px(x + 5 + sway, y + 2, 1, 1, '#090d16');
        px(x + 9, y + 2, 3, 3, '#ef4444'); // red Flanders poppy 2
        px(x + 10, y + 3, 1, 1, '#090d16');
        return true;
      }
      default:
        return false;
    }
  },

  getWorkstationLight: (ws, wx, wy, isWorking, flicker) => {
    if (!ws.style.startsWith('ww1_')) return null;
    return {
      x: wx,
      y: wy,
      radius: isWorking ? 30 : 20,
      color: ws.glow_color || '#f59e0b',
      intensity: (isWorking ? 0.28 : 0.16) + flicker * 0.6,
    };
  },

  getPropLight: (prop, cx, cy, flicker) => {
    if (prop.type === 'ww1_brazier_stove') {
      return { x: cx, y: cy, radius: 38, color: '#f97316', intensity: 0.34 + flicker };
    }
    if (prop.type === 'ww1_gramophone') {
      return { x: cx, y: cy, radius: 26, color: '#facc15', intensity: 0.16 };
    }
    return null;
  },
};
