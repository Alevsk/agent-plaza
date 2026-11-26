import type { TemplateProp, TemplateWorkstation } from '../../types';
import type { BackdropHooks, PointLight, PxFn } from '../hibitPalette';

export interface SceneModule {
  id: string;
  backdrop: BackdropHooks;
  drawChair?: (px: PxFn, x: number, y: number, accent: string, style: string) => boolean;
  drawWorkstation?: (
    px: PxFn,
    ws: TemplateWorkstation,
    active: boolean,
    time: number,
    tick: number,
  ) => boolean;
  drawProp?: (
    px: PxFn,
    prop: TemplateProp,
    time: number,
    tick: number,
  ) => boolean;
  getWorkstationLight?: (
    ws: TemplateWorkstation,
    wx: number,
    wy: number,
    isWorking: boolean,
    flicker: number,
  ) => PointLight | null;
  getPropLight?: (
    prop: TemplateProp,
    cx: number,
    cy: number,
    flicker: number,
  ) => PointLight | null;
}
