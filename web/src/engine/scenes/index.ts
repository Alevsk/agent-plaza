import type { TemplateProp, TemplateWorkstation } from '../../types';
import type { BackdropHooks, PointLight, PxFn } from '../hibitPalette';
import { arcticScene } from './arcticScene';
import { egyptScene } from './egyptScene';
import { forestScene } from './forestScene';
import { piratesScene } from './piratesScene';
import { spaceScene } from './spaceScene';
import { steampunkScene } from './steampunkScene';
import type { SceneModule } from './types';
import { ww1Scene } from './ww1Scene';

export const SCENE_MODULES: SceneModule[] = [
  piratesScene,
  spaceScene,
  forestScene,
  egyptScene,
  steampunkScene,
  arcticScene,
  ww1Scene,
];

const SCENE_MAP = new Map<string, SceneModule>(SCENE_MODULES.map((m) => [m.id, m]));

export function getSceneBackdropHooks(templateId: string): BackdropHooks | undefined {
  return SCENE_MAP.get(templateId)?.backdrop;
}

export function drawSceneChair(
  px: PxFn,
  x: number,
  y: number,
  accent: string,
  style: string,
): boolean {
  for (const mod of SCENE_MODULES) {
    if (mod.drawChair && mod.drawChair(px, x, y, accent, style)) {
      return true;
    }
  }
  return false;
}

export function drawSceneWorkstation(
  px: PxFn,
  ws: TemplateWorkstation,
  active: boolean,
  time: number,
  tick: number,
): boolean {
  for (const mod of SCENE_MODULES) {
    if (mod.drawWorkstation && mod.drawWorkstation(px, ws, active, time, tick)) {
      return true;
    }
  }
  return false;
}

export function drawSceneProp(
  px: PxFn,
  prop: TemplateProp,
  time: number,
  tick: number,
): boolean {
  for (const mod of SCENE_MODULES) {
    if (mod.drawProp && mod.drawProp(px, prop, time, tick)) {
      return true;
    }
  }
  return false;
}

export function getSceneWorkstationLight(
  ws: TemplateWorkstation,
  wx: number,
  wy: number,
  isWorking: boolean,
  flicker: number,
): PointLight | null {
  for (const mod of SCENE_MODULES) {
    const l = mod.getWorkstationLight?.(ws, wx, wy, isWorking, flicker);
    if (l) return l;
  }
  return null;
}

export function getScenePropLight(
  prop: TemplateProp,
  cx: number,
  cy: number,
  flicker: number,
): PointLight | null {
  for (const mod of SCENE_MODULES) {
    const l = mod.getPropLight?.(prop, cx, cy, flicker);
    if (l) return l;
  }
  return null;
}
