import React, { useEffect, useRef, useState } from 'react';
import {
  PixelSceneWorld,
  renderPixelWorld,
  SceneCharacter,
  TILE_SIZE,
} from '../engine/pixelEngine';
import type { AgentSession, TemplateManifest } from '../types';

interface PixelCanvasProps {
  worldRef: React.MutableRefObject<PixelSceneWorld>;
  template: TemplateManifest | null;
  agents: AgentSession[];
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  onToggleStatus: (id: string) => void;
  showLabels: boolean;
  fitTrigger: number;
}

export const PixelCanvas: React.FC<PixelCanvasProps> = ({
  worldRef,
  template,
  selectedId,
  onSelectAgent,
  onToggleStatus,
  showLabels,
  fitTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [zoom, setZoom] = useState<number>(3);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [, setOverlayTick] = useState<number>(0);

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  });

  const offsetRef = useRef<{ offsetX: number; offsetY: number }>({
    offsetX: 0,
    offsetY: 0,
  });

  // Auto-fit zoom to viewport & preload any external PNG sprite sheets in templates/<id>/sprites/
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !template) return;
    worldRef.current.preloadTemplateSprites(template);
    const w = el.clientWidth;
    const h = el.clientHeight;
    const mapW = template.grid.cols * TILE_SIZE;
    const mapH = template.grid.rows * TILE_SIZE;
    const fitZ = Math.max(2, Math.min(4.5, Math.min((w * 0.66) / mapW, (h * 0.78) / mapH)));
    setZoom(Number(fitZ.toFixed(2)));
    setPan({ x: 0, y: 12 });
  }, [template?.id, fitTrigger, worldRef, template]);

  // 60fps Game Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let frameCount = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const world = worldRef.current;
      world.update(dt);

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const dpr = window.devicePixelRatio || 1;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
          canvas.width = Math.round(cw * dpr);
          canvas.height = Math.round(ch * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          offsetRef.current = renderPixelWorld(
            ctx,
            world,
            cw,
            ch,
            zoom,
            pan.x,
            pan.y,
            selectedId,
            hoveredId,
          );
          ctx.restore();
        }
      }

      frameCount++;
      if (frameCount % 2 === 0) {
        setOverlayTick((t) => (t + 1) % 100000);
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [worldRef, zoom, pan, selectedId, hoveredId]);

  const hitTestCharacter = (clientX: number, clientY: number): SceneCharacter | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const mx = (clientX - rect.left - offsetRef.current.offsetX) / zoom;
    const my = (clientY - rect.top - offsetRef.current.offsetY) / zoom;

    for (const ch of worldRef.current.characters.values()) {
      if (Math.abs(mx - ch.x) <= 9 && my >= ch.y - 18 && my <= ch.y + 4) {
        return ch;
      }
    }
    return null;
  };

  const hitTestPet = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const mx = (clientX - rect.left - offsetRef.current.offsetX) / zoom;
    const my = (clientY - rect.top - offsetRef.current.offsetY) / zoom;
    for (const pet of worldRef.current.companions) {
      if (Math.abs(mx - pet.x) <= 8 && Math.abs(my - pet.y) <= 8) {
        return pet;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        dragRef.current.moved = true;
      }
      setPan({
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      });
      return;
    }
    const hit = hitTestCharacter(e.clientX, e.clientY);
    setHoveredId(hit ? hit.id : null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (!wasMoved) {
      const pet = hitTestPet(e.clientX, e.clientY);
      if (pet) {
        pet.heartTimer = 1.4;
        return;
      }
      const hit = hitTestCharacter(e.clientX, e.clientY);
      onSelectAgent(hit ? (selectedId === hit.id ? null : hit.id) : null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => Number(Math.max(1.5, Math.min(6, z + delta)).toFixed(2)));
  };

  const characters = Array.from(worldRef.current.characters.values());

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Projected Character Overhead HUD Tags (pixel-agents style) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {characters.map((ch) => {
          const isSelected = ch.id === selectedId;
          const isHovered = ch.id === hoveredId;
          if (!showLabels && !isSelected && !isHovered) return null;

          const screenX = offsetRef.current.offsetX + ch.x * zoom;
          const screenY = offsetRef.current.offsetY + (ch.y - 19) * zoom;
          const style =
            template?.characters[ch.session.character_key] ||
            template?.characters[ch.session.agent] ||
            template?.characters['default'];
          const badgeColor = style?.badge_color || '#38bdf8';
          const pct = ch.session.context_percent;
          const barColor =
            pct >= 85 ? '#ef4444' : pct >= 65 ? '#f59e0b' : '#22c55e';
          const station = ch.assignedStationId
            ? template?.workstations.find((w) => w.id === ch.assignedStationId)
            : undefined;

          return (
            <div
              key={ch.id}
              style={{
                transform: `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0) translate(-50%, -100%)`,
                zIndex: isSelected ? 40 : isHovered ? 35 : 20,
              }}
              className="absolute top-0 left-0 flex flex-col items-center transition-opacity duration-150"
            >
              {/* Expanded card when selected/hovered */}
              {(isSelected || isHovered) && (
                <div className="pointer-events-auto mb-1 w-64 rounded border border-slate-600/90 bg-slate-950/95 px-2.5 py-2 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      style={{ color: badgeColor }}
                      className="font-mono text-xs font-extrabold uppercase tracking-wider"
                    >
                      {ch.session.display_name}
                    </span>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onToggleStatus(ch.id);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase cursor-pointer border ${
                        ch.session.status === 'working'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      }`}
                      title="Click to toggle working/idle animation"
                    >
                      {ch.session.status === 'working' ? '⚡ WORKING' : '☕ IDLE'}
                    </button>
                  </div>
                  {station?.label && ch.session.status === 'working' && (
                    <div className="text-[10px] font-mono text-cyan-300/90 truncate mb-1">
                      🛠️ {station.label}
                    </div>
                  )}
                  <div className="text-[11px] font-mono text-slate-200 leading-snug line-clamp-2 mb-1.5">
                    {ch.session.task}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>CTX: {ch.session.context_raw}</span>
                    {ch.session.pane_id && <span>{ch.session.pane_id}</span>}
                  </div>
                </div>
              )}

              {/* Compact overhead pill */}
              <div
                className={`flex flex-col items-center rounded border px-1.5 py-0.5 backdrop-blur-sm shadow-lg ${
                  isSelected
                    ? 'bg-slate-900/95 border-white'
                    : ch.session.status === 'working'
                      ? 'bg-slate-950/88 border-emerald-400/70'
                      : 'bg-slate-950/80 border-slate-700/80'
                }`}
              >
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      ch.session.status === 'working'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span
                    style={{ color: badgeColor }}
                    className="font-mono text-[10px] font-bold tracking-tight"
                  >
                    {ch.session.display_name}
                  </span>
                  {ch.session.context_raw !== '—' && (
                    <span className="font-mono text-[9px] text-slate-300">
                      {ch.session.context_tokens || ch.session.context_raw}
                    </span>
                  )}
                </div>

                {/* Context Fuel Gauge Bar */}
                {pct >= 0 && (
                  <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
                      className="h-full transition-all duration-300"
                    />
                  </div>
                )}

                {/* Activity / Task micro-bubble */}
                {ch.session.status === 'working' ? (
                  <div className="text-[9px] font-mono text-emerald-300 max-w-[115px] truncate mt-0.5">
                    ⌨️ {ch.session.task}
                  </div>
                ) : (
                  ch.idleBubble && (
                    <div className="text-[9px] font-mono text-slate-400 max-w-[115px] truncate mt-0.5">
                      {ch.idleBubble}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
