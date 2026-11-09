import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react';
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
  const [mobileViewMode, setMobileViewMode] = useState<'cover' | 'contain'>('cover');

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

  const touchStateRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    startDist: number;
    startZoom: number;
    startTime: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    startDist: 0,
    startZoom: 1,
    startTime: 0,
    moved: false,
  });

  // Clamp pan so the pixel art scene always covers the screen on mobile (like Pokémon games)
  const clampPan = (targetPan: { x: number; y: number }, currentZoom: number) => {
    const el = containerRef.current;
    if (!el || !template) return targetPan;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const mw = template.grid.cols * TILE_SIZE * currentZoom;
    const mh = template.grid.rows * TILE_SIZE * currentZoom;

    let { x, y } = targetPan;

    // Horizontal bounds: keep map spanning edge-to-edge
    if (mw >= cw) {
      const maxPanX = (mw - cw) / 2;
      x = Math.max(-maxPanX, Math.min(maxPanX, x));
    } else {
      x = 0;
    }

    // Vertical bounds: keep map spanning edge-to-edge
    if (mh >= ch) {
      const maxPanY = (mh - ch) / 2;
      y = Math.max(-maxPanY, Math.min(maxPanY, y));
    } else {
      y = 0;
    }

    return { x, y };
  };

  // Apply either Pokémon Full-Screen ('cover') or Overview with Borders ('contain') on mobile
  const applyViewMode = (mode: 'cover' | 'contain') => {
    const el = containerRef.current;
    if (!el || !template) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const mapW = template.grid.cols * TILE_SIZE;
    const mapH = template.grid.rows * TILE_SIZE;
    const isMobile = w < 768;

    if (!isMobile) {
      // Desktop: Balanced framing with space for dual sidebars
      const targetW = w * 0.68;
      const targetH = h * 0.78;
      const fitZ = Math.max(0.9, Math.min(4.5, Math.min(targetW / mapW, targetH / mapH)));
      setZoom(Number(fitZ.toFixed(2)));
      setPan({ x: 0, y: 12 });
      return;
    }

    if (mode === 'cover') {
      // Pokémon Full-Screen Game Viewport: Fill 100% of visible screen with ZERO black borders
      const coverZ = Math.max(w / mapW, h / mapH);
      const chosenZ = Number(coverZ.toFixed(2));
      setZoom(chosenZ);
      setPan({ x: 0, y: 0 });
      setMobileViewMode('cover');
    } else {
      // Overview Mode: Show full canvas with black borders
      const targetW = w * 0.94;
      const targetH = h * 0.76;
      const fitZ = Math.max(0.5, Math.min(4.5, Math.min(targetW / mapW, targetH / mapH)));
      const chosenZ = Number(fitZ.toFixed(2));
      setZoom(chosenZ);
      setPan({ x: 0, y: 0 });
      setMobileViewMode('contain');
    }
  };

  const toggleViewMode = () => {
    const nextMode = mobileViewMode === 'cover' ? 'contain' : 'cover';
    applyViewMode(nextMode);
  };

  // Auto-fit zoom to viewport & preload any external PNG sprite sheets in templates/<id>/sprites/
  const fitCamera = () => {
    applyViewMode(mobileViewMode);
  };

  useEffect(() => {
    if (!template) return;
    worldRef.current.preloadTemplateSprites(template);
    fitCamera();
  }, [template?.id, fitTrigger, worldRef, template]);

  // Handle window resize to re-fit if needed
  useEffect(() => {
    const handleResize = () => {
      // Small debounce
      fitCamera();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [template]);

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
      const rawPan = {
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      };
      const el = containerRef.current;
      const isMobile = el ? el.clientWidth < 768 : false;
      setPan(isMobile ? clampPan(rawPan, zoom) : rawPan);
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

  // Touch Events for Mobile / Tablet (1-finger pan, 2-finger pinch-to-zoom, tap-to-select)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        startDist: 0,
        startZoom: zoom,
        startTime: performance.now(),
        moved: false,
      };
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStateRef.current = {
        mode: 'pinch',
        startX: (t1.clientX + t2.clientX) / 2,
        startY: (t1.clientY + t2.clientY) / 2,
        origPanX: pan.x,
        origPanY: pan.y,
        startDist: Math.max(10, dist),
        startZoom: zoom,
        startTime: performance.now(),
        moved: true,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const s = touchStateRef.current;
    if (s.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (Math.hypot(dx, dy) > 6) {
        s.moved = true;
      }
      const rawPan = {
        x: s.origPanX + dx,
        y: s.origPanY + dy,
      };
      setPan(clampPan(rawPan, zoom));
    } else if (s.mode === 'pinch' && e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (s.startDist > 0) {
        const factor = dist / s.startDist;
        const el = containerRef.current;
        const mapW = template ? template.grid.cols * TILE_SIZE : 448;
        const mapH = template ? template.grid.rows * TILE_SIZE : 288;
        const isMobile = el ? el.clientWidth < 768 : false;
        const minZ = (el && isMobile)
          ? Math.max(el.clientWidth / mapW, el.clientHeight / mapH)
          : 0.5;
        const newZoom = Math.max(minZ, Math.min(6, Number((s.startZoom * factor).toFixed(2))));
        setZoom(newZoom);
        setPan((prevPan) => (isMobile ? clampPan(prevPan, newZoom) : prevPan));
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const s = touchStateRef.current;
    if (s.mode === 'pan' && !s.moved && e.changedTouches.length === 1) {
      const elapsed = performance.now() - s.startTime;
      if (elapsed < 350) {
        const t = e.changedTouches[0];
        const pet = hitTestPet(t.clientX, t.clientY);
        if (pet) {
          pet.heartTimer = 1.4;
          s.mode = 'none';
          return;
        }
        const hit = hitTestCharacter(t.clientX, t.clientY);
        onSelectAgent(hit ? (selectedId === hit.id ? null : hit.id) : null);
      }
    }
    if (e.touches.length === 0) {
      s.mode = 'none';
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        startDist: 0,
        startZoom: zoom,
        startTime: performance.now(),
        moved: true,
      };
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    const el = containerRef.current;
    const isMobile = el ? el.clientWidth < 768 : false;
    const mapW = template ? template.grid.cols * TILE_SIZE : 448;
    const mapH = template ? template.grid.rows * TILE_SIZE : 288;
    const minZ = (el && isMobile)
      ? Math.max(el.clientWidth / mapW, el.clientHeight / mapH)
      : 0.5;
    setZoom((z) => {
      const newZ = Number(Math.max(minZ, Math.min(6, z + delta)).toFixed(2));
      if (isMobile) setPan((p) => clampPan(p, newZ));
      return newZ;
    });
  };

  const characters = Array.from(worldRef.current.characters.values());
  const selectedCharacter = selectedId ? worldRef.current.characters.get(selectedId) : null;
  const selectedStyle = selectedCharacter
    ? template?.characters[selectedCharacter.session.character_key] ||
      template?.characters[selectedCharacter.session.agent] ||
      template?.characters['default']
    : null;
  const selectedBadgeColor = selectedStyle?.badge_color || '#38bdf8';
  const selectedStation = selectedCharacter?.assignedStationId
    ? template?.workstations.find((w) => w.id === selectedCharacter.assignedStationId)
    : undefined;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Floating On-Canvas Camera Controls (Zoom In, Zoom Out, Fit) */}
      <div className="pointer-events-auto absolute bottom-20 md:bottom-4 right-3 md:right-4 z-20 flex flex-col items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/90 p-1 backdrop-blur-md shadow-2xl">
        <button
          onClick={() => {
            const el = containerRef.current;
            const isMobile = el ? el.clientWidth < 768 : false;
            setZoom((z) => {
              const newZ = Math.min(6, Number((z + 0.35).toFixed(2)));
              if (isMobile) setPan((p) => clampPan(p, newZ));
              return newZ;
            });
          }}
          className="flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-mono text-base font-bold cursor-pointer active:scale-95"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const el = containerRef.current;
            const isMobile = el ? el.clientWidth < 768 : false;
            const mapW = template ? template.grid.cols * TILE_SIZE : 448;
            const mapH = template ? template.grid.rows * TILE_SIZE : 288;
            const minZ = (el && isMobile && mobileViewMode === 'cover')
              ? Math.max(el.clientWidth / mapW, el.clientHeight / mapH)
              : 0.5;
            setZoom((z) => {
              const newZ = Math.max(minZ, Number((z - 0.35).toFixed(2)));
              if (isMobile) setPan((p) => clampPan(p, newZ));
              return newZ;
            });
          }}
          className="flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-mono text-base font-bold cursor-pointer active:scale-95"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="h-px w-5 bg-slate-800 my-0.5" />
        <button
          data-testid="camera-mode-toggle"
          onClick={toggleViewMode}
          className="flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer active:scale-95"
          title={
            mobileViewMode === 'cover'
              ? 'Overview: Show entire scene with borders'
              : 'Fill Screen: Immersive Pokémon view'
          }
          aria-label={
            mobileViewMode === 'cover'
              ? 'Overview: Show entire scene with borders'
              : 'Fill Screen: Immersive Pokémon view'
          }
        >
          {mobileViewMode === 'cover' ? (
            <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>
      </div>

      {/* Mobile Selected Agent Inspector Docked Card */}
      {selectedCharacter && (
        <div className="md:hidden pointer-events-auto absolute bottom-20 left-3 right-3 z-30 rounded-xl border border-sky-400/60 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span
                style={{ backgroundColor: selectedBadgeColor }}
                className="w-3 h-3 rounded-xs shrink-0"
              />
              <span className="font-mono text-xs font-black uppercase text-white tracking-wide">
                {selectedCharacter.session.display_name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onToggleStatus(selectedCharacter.id);
                }}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold uppercase cursor-pointer border ${
                  selectedCharacter.session.status === 'working'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                }`}
              >
                {selectedCharacter.session.status === 'working' ? '⚡ WORKING' : '☕ IDLE'}
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectAgent(null);
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedStation?.label && selectedCharacter.session.status === 'working' && (
            <div className="text-[11px] font-mono text-cyan-300 font-semibold mb-1">
              🛠️ {selectedStation.label}
            </div>
          )}

          <div className="text-xs font-mono text-slate-200 leading-snug line-clamp-2 mb-2">
            {selectedCharacter.session.task}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
            <span>CTX: <strong className="text-amber-300">{selectedCharacter.session.context_raw}</strong></span>
            {selectedCharacter.session.pane_id && <span>{selectedCharacter.session.pane_id}</span>}
          </div>
        </div>
      )}

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
              {/* Expanded card when selected/hovered (desktop) */}
              {(isSelected || isHovered) && (
                <div className="hidden md:block pointer-events-auto mb-1 w-64 rounded border border-slate-600/90 bg-slate-950/95 px-2.5 py-2 shadow-2xl backdrop-blur-md">
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

                {/* Context Fuel Gauge Bar (hidden when zoomed far out to avoid label overlap) */}
                {(zoom >= 1.2 || isSelected || isHovered) && pct >= 0 && (
                  <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
                      className="h-full transition-all duration-300"
                    />
                  </div>
                )}

                {/* Activity / Task micro-bubble (hidden when zoomed far out to avoid label overlap) */}
                {(zoom >= 1.2 || isSelected || isHovered) && (
                  ch.session.status === 'working' ? (
                    <div className="text-[9px] font-mono text-emerald-300 max-w-[115px] truncate mt-0.5">
                      ⌨️ {ch.session.task}
                    </div>
                  ) : (
                    ch.idleBubble && (
                      <div className="text-[9px] font-mono text-slate-400 max-w-[115px] truncate mt-0.5">
                        {ch.idleBubble}
                      </div>
                    )
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
