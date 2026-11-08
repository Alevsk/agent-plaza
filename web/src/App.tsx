import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
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
    <div className="relative w-screen h-screen overflow-hidden bg-[#080b11] select-none">
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
      <header className="pointer-events-auto absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/80 bg-slate-950/90 px-4 py-2.5 backdrop-blur-md shadow-2xl">
        {/* Left: Title + Summary Counters */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-sky-400/50 bg-sky-500/15 text-sky-400 shadow-inner">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-pixel text-[11px] tracking-tight text-white">
                  HERDR PIXEL AGENTS
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    connected
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {connected ? (
                    <>
                      <Wifi className="w-2.5 h-2.5" /> LIVE
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-2.5 h-2.5" /> RECONNECTING
                    </>
                  )}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-400">
                {template ? `${template.name} — ${template.description}` : 'Loading scene...'}
              </p>
            </div>
          </div>

          {/* ■ SUMMARY BLOCK */}
          <div className="hidden md:flex items-center gap-4 border-l border-slate-800 pl-5 font-mono text-xs">
            <span className="text-fuchsia-400 font-extrabold tracking-wider">■ SUMMARY</span>
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded">
              <span className="text-slate-400">Total Agents:</span>
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

        {/* Right: Template Switcher & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scene Template Selector */}
          <div className="flex items-center rounded border border-slate-700/80 bg-slate-900/90 p-0.5">
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

          {/* Live Join Simulation Controls */}
          <button
            onClick={handleSpawnSimAgent}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
            title="Spawn a new simulated agent over WebSocket to watch the live join animation"
          >
            <Plus className="w-3.5 h-3.5" /> Spawn Agent
          </button>

          <button
            onClick={handleClearSim}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-xs font-semibold transition-colors cursor-pointer ${
              hasSimOrOverrides
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
            title="Reset simulated agents and manual status toggles"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* HUD Panel Toggles */}
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
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
            <button
              onClick={() => setShowLabels((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-xs font-bold cursor-pointer transition-colors ${
                showLabels
                  ? 'border-purple-500/60 bg-purple-500/20 text-purple-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title="Toggle character overhead labels"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFitTrigger((n) => n + 1)}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              title="Center and fit camera"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* REAL-TIME EVENT TOASTS */}
      <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.92 }}
              style={{ borderColor: t.color }}
              className="rounded border bg-slate-950/95 px-3.5 py-1.5 font-mono text-xs font-bold text-white shadow-xl backdrop-blur-md"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

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

      {/* BOTTOM LEGEND BAR */}
      <footer className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center gap-4 rounded-full border border-slate-800/90 bg-slate-950/85 px-4 py-1 font-mono text-[11px] text-slate-400 backdrop-blur-sm shadow-lg">
        <span>🖱️ Drag to pan · Scroll to zoom</span>
        <span>·</span>
        <span>⚡ Click any agent status badge to toggle Working (at desk) / Idle (wandering)</span>
        <span>·</span>
        <span>🐾 Click office pets to pet them</span>
      </footer>
    </div>
  );
};
