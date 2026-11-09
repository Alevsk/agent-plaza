import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Check,
  ChevronDown,
  Compass,
  CreditCard,
  Eye,
  Maximize2,
  Plus,
  RotateCcw,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AgentBreakdownPanel } from './components/AgentBreakdownPanel';
import { PixelCanvas } from './components/PixelCanvas';
import { SubscriptionLimitsPanel } from './components/SubscriptionLimitsPanel';
import { PixelSceneWorld } from './engine/pixelEngine';
import type {
  TemplateManifest,
  TemplateSummary,
  WorkspaceEvent,
  WorkspaceSnapshot,
} from './types';

interface ToastNotice {
  id: number;
  text: string;
  color: string;
}

export const App: React.FC = () => {
  const worldRef = useRef<PixelSceneWorld>(new PixelSceneWorld());
  const wsRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [template, setTemplate] = useState<TemplateManifest | null>(null);
  const [templatesList, setTemplatesList] = useState<TemplateSummary[]>([]);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  // Mobile drawer sheet state: 'none' | 'context' | 'quotas'
  const [mobileSheet, setMobileSheet] = useState<'none' | 'context' | 'quotas'>('none');
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const pushToast = useCallback((text: string, color = '#38bdf8') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, text, color }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // Fetch available templates list
  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((list: TemplateSummary[]) => {
        if (Array.isArray(list)) setTemplatesList(list);
      })
      .catch(() => {});
  }, []);

  // Connect real-time WebSocket with auto-reconnect
  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const event: WorkspaceEvent = JSON.parse(ev.data);
          if (event.type === 'snapshot') {
            if (event.template) {
              worldRef.current.setTemplate(event.template);
              setTemplate(event.template);
            }
            if (event.snapshot) {
              setSnapshot(event.snapshot);
              worldRef.current.syncAgents(event.snapshot.agents);
              if (!event.template && event.snapshot.active_template) {
                fetch(`/api/templates/${event.snapshot.active_template}`)
                  .then((r) => r.json())
                  .then((tpl: TemplateManifest) => {
                    worldRef.current.setTemplate(tpl);
                    setTemplate(tpl);
                  })
                  .catch(() => {});
              }
            }
          } else if (event.type === 'diff' && event.snapshot) {
            setSnapshot(event.snapshot);
            const joinedIds = new Set((event.joined || []).map((a) => a.id));
            const leftIds = new Set(event.left || []);
            worldRef.current.syncAgents(event.snapshot.agents, joinedIds, leftIds);

            for (const j of event.joined || []) {
              pushToast(
                `⚡ Agent joined workspace: ${j.display_name} (${j.status})`,
                '#22c55e',
              );
            }
            for (const u of event.updated || []) {
              pushToast(
                `🔄 ${u.display_name} → ${u.status.toUpperCase()}`,
                u.status === 'working' ? '#38bdf8' : '#f59e0b',
              );
            }
          } else if (event.type === 'template_changed' && event.template) {
            worldRef.current.setTemplate(event.template);
            setTemplate(event.template);
            if (event.snapshot) setSnapshot(event.snapshot);
            pushToast(`🎨 Scene template switched to ${event.template.name}`, '#a855f7');
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 1800);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [pushToast]);

  const sendCommand = (payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const handleSelectTemplate = (id: string) => {
    sendCommand({ action: 'set_template', template_id: id });
  };

  const handleSpawnSimAgent = () => {
    sendCommand({ action: 'spawn_sim', status: 'working' });
  };

  const handleClearSim = () => {
    sendCommand({ action: 'clear_sim' });
    pushToast('🧹 Reset simulated agents & status overrides', '#94a3b8');
  };

  const handleToggleStatus = (id: string) => {
    sendCommand({ action: 'toggle_status', id });
  };

  const summary = snapshot?.summary || { total_agents: 0, working: 0, idle: 0 };
  const agents = snapshot?.agents || [];
  const subscriptions = snapshot?.subscriptions || [];
  const otherAgents = snapshot?.other_agents || [];
  const hasSimOrOverrides = agents.some((a) => a.simulated);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#080b11] select-none">
      {/* Full-Screen 2D Pixel Art Scene Canvas */}
      <PixelCanvas
        worldRef={worldRef}
        template={template}
        agents={agents}
        selectedId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        onToggleStatus={handleToggleStatus}
        showLabels={showLabels}
        fitTrigger={fitTrigger}
      />

      {/* TOP COMMAND & SUMMARY BAR */}
      <header className="pointer-events-auto absolute top-2 left-2 right-2 md:top-3 md:left-3 md:right-3 z-30 flex items-center justify-between gap-1.5 md:gap-3 rounded-xl md:rounded-lg border border-slate-700/80 bg-slate-950/92 px-2.5 py-1.5 md:px-4 md:py-2.5 backdrop-blur-md shadow-2xl safe-top">
        {/* Left: Brand + Live + Scene Description + Desktop Summary */}
        <div className="flex items-center gap-3 md:gap-5 min-w-0 shrink">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 md:h-8 md:w-8 shrink-0 items-center justify-center rounded border border-sky-400/50 bg-sky-500/15 text-sky-400 shadow-inner">
              <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-pixel text-[10px] md:text-[11px] tracking-tight text-white whitespace-nowrap">
                  HERDR
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 font-mono text-[9px] md:text-[10px] font-bold ${
                    connected
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {connected ? (
                    <>
                      <Wifi className="w-2 md:w-2.5 h-2 md:h-2.5" /> LIVE
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-2 md:w-2.5 h-2 md:h-2.5" /> OFF
                    </>
                  )}
                </span>
              </div>
              <p className="hidden md:block font-mono text-[10px] text-slate-400 truncate max-w-[180px] lg:max-w-[240px]">
                {template ? `${template.name} — ${template.description}` : 'Loading scene...'}
              </p>
            </div>
          </div>

          {/* Desktop Summary Block */}
          <div className="hidden xl:flex items-center gap-3 border-l border-slate-800 pl-4 font-mono text-xs">
            <span className="text-fuchsia-400 font-extrabold tracking-wider">■ SUMMARY</span>
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded">
              <span className="text-slate-400">Total:</span>
              <span className="font-extrabold text-white">{summary.total_agents}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">Working:</span>
              <span className="font-extrabold text-emerald-400">{summary.working}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-950/30 border border-amber-500/30 px-2.5 py-1 rounded">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-300">Idle:</span>
              <span className="font-extrabold text-amber-300">{summary.idle}</span>
            </div>
          </div>
        </div>

        {/* Right: Controls & Template Selection */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
          {/* Custom UI-styled Template Dropdown (< lg) */}
          <div className="relative block lg:hidden">
            <button
              onClick={() => setTemplateMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 h-7 rounded border border-slate-700/80 bg-slate-900/90 hover:bg-slate-800 px-2 font-mono text-[11px] font-bold text-sky-400 cursor-pointer transition-colors active:scale-95 shadow-inner"
              aria-label="Select scene template"
            >
              <span className="truncate max-w-[105px] sm:max-w-[150px]">
                {template?.theme_badge || template?.name || 'Theme'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  templateMenuOpen ? 'rotate-180 text-sky-400' : ''
                }`}
              />
            </button>

            {/* Dropdown Popover */}
            <AnimatePresence>
              {templateMenuOpen && (
                <>
                  {/* Backdrop for click outside */}
                  <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
                    onClick={() => setTemplateMenuOpen(false)}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.16 }}
                    className="absolute top-full mt-2 right-0 sm:left-0 sm:right-auto z-50 w-72 max-w-[88vw] rounded-xl border border-slate-700/90 bg-slate-950/98 backdrop-blur-xl shadow-2xl p-1.5 flex flex-col gap-1 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800/80 font-mono text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sky-400 font-extrabold">■</span>
                        <span>SCENE TEMPLATES</span>
                      </div>
                      <span className="text-slate-500 font-semibold">{templatesList.length} themes</span>
                    </div>

                    <div className="max-h-[60dvh] overflow-y-auto overscroll-contain touch-pan-y divide-y divide-slate-800/40 py-0.5">
                      {templatesList.map((tpl) => {
                        const active = template?.id === tpl.id;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => {
                              handleSelectTemplate(tpl.id);
                              setTemplateMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg font-mono text-left transition-colors cursor-pointer ${
                              active
                                ? 'bg-sky-500/20 border border-sky-400/50 text-white'
                                : 'hover:bg-slate-900/90 text-slate-300 hover:text-white border border-transparent'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm shrink-0">
                                  {tpl.theme_badge?.split(' ')[0] || '■'}
                                </span>
                                <span className="text-xs font-bold truncate">
                                  {tpl.theme_badge ? tpl.theme_badge.replace(/^[^\s]+\s*/, '') : tpl.name}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                                {tpl.description}
                              </p>
                            </div>
                            {active ? (
                              <Check className="w-4 h-4 text-sky-400 shrink-0" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Desktop Template Selector Buttons (>= lg) */}
          <div className="hidden lg:flex items-center rounded border border-slate-700/80 bg-slate-900/90 p-0.5">
            {templatesList.map((tpl) => {
              const active = template?.id === tpl.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`px-2.5 py-1 rounded-xs font-mono text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-sky-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title={tpl.description}
                >
                  {tpl.theme_badge || tpl.name}
                </button>
              );
            })}
          </div>

          {/* Simulation Quick Actions */}
          <button
            onClick={handleSpawnSimAgent}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/15 p-1.5 sm:px-2.5 sm:py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
            title="Spawn simulated agent"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Spawn</span>
          </button>

          <button
            onClick={handleClearSim}
            className={`inline-flex items-center gap-1 rounded border p-1.5 sm:px-2 sm:py-1.5 font-mono text-xs font-semibold transition-colors cursor-pointer ${
              hasSimOrOverrides
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
            title="Reset simulated agents"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Desktop HUD Panel Toggles (>= lg) */}
          <div className="hidden lg:flex items-center gap-1 border-l border-slate-800 pl-2">
            <button
              onClick={() => setShowLeftPanel((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-xs font-bold cursor-pointer transition-colors ${
                showLeftPanel
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title="Toggle Agent Context Breakdown panel"
            >
              <Activity className="w-3.5 h-3.5" /> Context
            </button>
            <button
              onClick={() => setShowRightPanel((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-xs font-bold cursor-pointer transition-colors ${
                showRightPanel
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title="Toggle Subscription Limits panel"
            >
              <CreditCard className="w-3.5 h-3.5" /> Quotas
            </button>
          </div>

          {/* Overhead Labels & Camera Fit Toggles */}
          <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5">
            <button
              onClick={() => setShowLabels((v) => !v)}
              className={`inline-flex items-center justify-center rounded border p-1.5 sm:px-2 sm:py-1.5 font-mono text-xs font-bold cursor-pointer transition-colors ${
                showLabels
                  ? 'border-purple-500/60 bg-purple-500/20 text-purple-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title="Toggle character overhead labels"
              aria-label="Toggle character labels"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFitTrigger((n) => n + 1)}
              className="hidden sm:inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 p-1.5 sm:px-2 sm:py-1.5 font-mono text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              title="Center and fit scene camera"
              aria-label="Center camera"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* REAL-TIME EVENT TOASTS */}
      <div className="pointer-events-none absolute top-14 md:top-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 max-w-[90vw]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.94 }}
              style={{ borderColor: t.color }}
              className="rounded-lg border bg-slate-950/95 px-3 py-1 font-mono text-[11px] md:text-xs font-bold text-white shadow-xl backdrop-blur-md text-center truncate max-w-full"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* DESKTOP DOCK PANELS (>= lg) */}
      {!isMobile && (
        <>
          {/* LEFT DOCK: ■ AGENT CONTEXT BREAKDOWN */}
          <AnimatePresence>
            {showLeftPanel && (
              <motion.aside
                initial={{ opacity: 0, x: -360 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -360 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="pointer-events-auto absolute top-20 bottom-4 left-3 z-20 w-[540px] max-w-[44vw]"
              >
                <AgentBreakdownPanel
                  agents={agents}
                  template={template}
                  selectedId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                  onToggleStatus={handleToggleStatus}
                />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* RIGHT DOCK: ■ SUBSCRIPTION LIMITS & ■ OTHER AGENTS */}
          <AnimatePresence>
            {showRightPanel && (
              <motion.aside
                initial={{ opacity: 0, x: 380 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 380 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="pointer-events-auto absolute top-20 bottom-4 right-3 z-20 w-[620px] max-w-[48vw]"
              >
                <SubscriptionLimitsPanel
                  subscriptions={subscriptions}
                  otherAgents={otherAgents}
                  template={template}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      )}

      {/* MOBILE BOTTOM SHEETS (< lg) */}
      {isMobile && (
        <AnimatePresence>
          {mobileSheet !== 'none' && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileSheet('none')}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
              />

              {/* Sheet container */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-[50px] z-45 flex flex-col h-[76dvh] max-h-[76dvh] rounded-t-2xl border-t border-slate-700 bg-slate-950/96 backdrop-blur-xl shadow-2xl overflow-hidden touch-pan-y"
              >
                {/* Drag Handle */}
                <div className="flex justify-center pt-2.5 pb-1 cursor-pointer shrink-0" onClick={() => setMobileSheet('none')}>
                  <div className="h-1 w-12 rounded-full bg-slate-700" />
                </div>

                <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col">
                  {mobileSheet === 'context' && (
                    <AgentBreakdownPanel
                      agents={agents}
                      template={template}
                      selectedId={selectedAgentId}
                      onSelectAgent={setSelectedAgentId}
                      onToggleStatus={handleToggleStatus}
                      onClose={() => setMobileSheet('none')}
                    />
                  )}
                  {mobileSheet === 'quotas' && (
                    <SubscriptionLimitsPanel
                      subscriptions={subscriptions}
                      otherAgents={otherAgents}
                      template={template}
                      onClose={() => setMobileSheet('none')}
                    />
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR (< lg) */}
      <nav className="pointer-events-auto fixed bottom-0 inset-x-0 z-50 flex lg:hidden items-center justify-around border-t border-slate-800/90 bg-slate-950/98 px-3 py-1 backdrop-blur-md safe-bottom shadow-2xl">
        <button
          data-testid="tab-scene"
          onClick={() => setMobileSheet('none')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg font-mono text-[10px] font-bold transition-colors cursor-pointer ${
            mobileSheet === 'none'
              ? 'text-sky-400 bg-sky-500/15'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Scene</span>
        </button>

        <button
          data-testid="tab-context"
          onClick={() => setMobileSheet((s) => (s === 'context' ? 'none' : 'context'))}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg font-mono text-[10px] font-bold transition-colors cursor-pointer relative ${
            mobileSheet === 'context'
              ? 'text-sky-400 bg-sky-500/15'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Agents ({agents.length})</span>
          {summary.working > 0 && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          data-testid="tab-quotas"
          onClick={() => setMobileSheet((s) => (s === 'quotas' ? 'none' : 'quotas'))}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg font-mono text-[10px] font-bold transition-colors cursor-pointer ${
            mobileSheet === 'quotas'
              ? 'text-amber-400 bg-amber-500/15'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Quotas ({subscriptions.length})</span>
        </button>
      </nav>

      {/* BOTTOM DESKTOP LEGEND BAR */}
      <footer className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center gap-4 rounded-full border border-slate-800/90 bg-slate-950/85 px-4 py-1 font-mono text-[11px] text-slate-400 backdrop-blur-sm shadow-lg">
        <span>🖱️ Drag to pan · Scroll to zoom</span>
        <span>·</span>
        <span>⚡ Click any agent status badge to toggle Working / Idle</span>
        <span>·</span>
        <span>🐾 Click companions to interact</span>
      </footer>
    </div>
  );
};
