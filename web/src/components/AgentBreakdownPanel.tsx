import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, X } from 'lucide-react';
import type { AgentSession, TemplateManifest } from '../types';
import { PixelBar } from './PixelBar';

interface AgentBreakdownPanelProps {
  agents: AgentSession[];
  template: TemplateManifest | null;
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  onToggleStatus: (id: string) => void;
  onClose?: () => void;
  onFollowAgent?: (id: string) => void;
  followTargetId?: string | null;
}

export const AgentBreakdownPanel: React.FC<AgentBreakdownPanelProps> = ({
  agents,
  template,
  selectedId,
  onSelectAgent,
  onToggleStatus,
  onClose,
  onFollowAgent,
  followTargetId,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl md:rounded-lg border border-slate-700/80 bg-slate-950/92 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 py-3 md:py-2.5 border-b border-slate-800 bg-slate-900/85 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sky-400 font-mono text-xs font-extrabold">■</span>
          <h2 className="font-mono text-xs md:text-xs font-extrabold tracking-wider text-sky-400 uppercase">
            AGENT CONTEXT BREAKDOWN
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-slate-400">
            {agents.length} panes
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table Header */}
      <div className="hidden md:grid grid-cols-[88px_64px_1fr_130px_28px] gap-2 px-3.5 py-1.5 border-b border-slate-800/80 bg-slate-900/40 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
        <div>AGENT</div>
        <div>STATUS</div>
        <div>TASK</div>
        <div className="text-right">CONTEXT</div>
        <div className="text-center" title="Follow agent with camera">CAM</div>
      </div>

      {/* Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-slate-800/60 p-1 md:p-0">
        <AnimatePresence initial={false}>
          {agents.map((ag) => {
            const isSelected = ag.id === selectedId;
            const isFollowed = followTargetId === ag.id;
            const style =
              template?.characters[ag.character_key] ||
              template?.characters[ag.agent] ||
              template?.characters['default'];
            const badgeColor = style?.badge_color || '#38bdf8';

            return (
              <motion.div
                key={ag.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  backgroundColor: isSelected
                    ? 'rgba(56, 189, 248, 0.14)'
                    : 'rgba(15, 23, 42, 0)',
                }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.2 }}
                onClick={() => onSelectAgent(isSelected ? null : ag.id)}
                className={`cursor-pointer hover:bg-slate-800/50 transition-colors rounded-lg md:rounded-none ${
                  isSelected ? 'ring-1 ring-inset ring-sky-400/60' : ''
                }`}
              >
                {/* Desktop 5-column Grid */}
                <div className="hidden md:grid grid-cols-[88px_64px_1fr_130px_28px] gap-2 items-center px-3.5 py-2">
                  {/* AGENT */}
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      style={{ backgroundColor: badgeColor }}
                      className="w-2 h-2 rounded-xs shrink-0"
                    />
                    <span className="font-mono text-xs font-bold text-white truncate">
                      {ag.display_name}
                    </span>
                  </div>

                  {/* STATUS */}
                  <div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStatus(ag.id);
                      }}
                      title="Click to toggle working / idle state"
                      className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                        ag.status === 'working'
                          ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25'
                          : 'text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20'
                      }`}
                    >
                      {ag.status}
                    </button>
                  </div>

                  {/* TASK */}
                  <div
                    className="font-mono text-xs text-slate-200 truncate"
                    title={`${ag.task}${ag.cwd ? ` (${ag.cwd})` : ''}`}
                  >
                    {ag.task}
                  </div>

                  {/* CONTEXT */}
                  <div className="flex justify-end">
                    <PixelBar
                      percent={ag.context_percent}
                      text={ag.context_tokens || ag.context_raw}
                      tokens={ag.context_percent >= 0 ? ag.context_tokens : undefined}
                    />
                  </div>

                  {/* CAMERA FOLLOW BUTTON */}
                  <div className="flex justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFollowAgent?.(ag.id);
                      }}
                      title={isFollowed ? 'Following with camera' : 'Follow and center camera on agent'}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        isFollowed
                          ? 'text-sky-400 bg-sky-500/25 border border-sky-400/50'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mobile Responsive Card (2-row layout) */}
                <div className="md:hidden flex flex-col gap-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: badgeColor }}
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                      />
                      <span className="font-mono text-xs font-bold text-white">
                        {ag.display_name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFollowAgent?.(ag.id);
                        }}
                        title={isFollowed ? 'Following with camera' : 'Follow with camera'}
                        className={`p-1 rounded cursor-pointer transition-colors ${
                          isFollowed
                            ? 'text-sky-400 bg-sky-500/25 border border-sky-400/50'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStatus(ag.id);
                        }}
                        className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                          ag.status === 'working'
                            ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40'
                            : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                        }`}
                      >
                        {ag.status === 'working' ? '⚡ working' : '☕ idle'}
                      </button>

                      <PixelBar
                        percent={ag.context_percent}
                        text={ag.context_tokens || ag.context_raw}
                        tokens={ag.context_percent >= 0 ? ag.context_tokens : undefined}
                      />
                    </div>
                  </div>

                  {/* Task text (readable, not truncated to 5 chars) */}
                  <div className="font-mono text-xs text-slate-300 leading-snug pl-4">
                    {ag.task}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer Note matching herdr-agent-usage */}
      <div className="px-3.5 py-2 border-t border-slate-800/80 bg-slate-900/50 font-mono text-[10px] text-slate-400 leading-relaxed">
        Live for Claude, Codex, and OpenCode. &ldquo;—&rdquo; means no data. A bare claude/codex row is the default account; a ·label suffix names the account.
      </div>
    </div>
  );
};
