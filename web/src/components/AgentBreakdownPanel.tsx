import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AgentSession, TemplateManifest } from '../types';
import { PixelBar } from './PixelBar';

interface AgentBreakdownPanelProps {
  agents: AgentSession[];
  template: TemplateManifest | null;
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  onToggleStatus: (id: string) => void;
}

export const AgentBreakdownPanel: React.FC<AgentBreakdownPanelProps> = ({
  agents,
  template,
  selectedId,
  onSelectAgent,
  onToggleStatus,
}) => {
  return (
    <div className="flex flex-col h-full rounded-lg border border-slate-700/80 bg-slate-950/88 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <span className="text-sky-400 font-mono text-xs font-extrabold">■</span>
          <h2 className="font-mono text-xs font-extrabold tracking-wider text-sky-400 uppercase">
            AGENT CONTEXT BREAKDOWN
          </h2>
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          {agents.length} panes · click status to animate
        </span>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[88px_64px_1fr_148px] gap-2 px-3.5 py-1.5 border-b border-slate-800/80 bg-slate-900/40 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <div>AGENT</div>
        <div>STATUS</div>
        <div>TASK</div>
        <div className="text-right">CONTEXT</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        <AnimatePresence initial={false}>
          {agents.map((ag) => {
            const isSelected = ag.id === selectedId;
            const style =
              template?.characters[ag.character_key] ||
              template?.characters[ag.agent] ||
              template?.characters['default'];
            const badgeColor = style?.badge_color || '#38bdf8';

            return (
              <motion.div
                key={ag.id}
                initial={{ opacity: 0, x: -18, backgroundColor: 'rgba(34,197,94,0.22)' }}
                animate={{
                  opacity: 1,
                  x: 0,
                  backgroundColor: isSelected
                    ? 'rgba(56, 189, 248, 0.14)'
                    : 'rgba(15, 23, 42, 0)',
                }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.25 }}
                onClick={() => onSelectAgent(isSelected ? null : ag.id)}
                className={`grid grid-cols-[88px_64px_1fr_148px] gap-2 items-center px-3.5 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors ${
                  isSelected ? 'ring-1 ring-inset ring-sky-400/60' : ''
                }`}
              >
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

                {/* STATUS (clickable to toggle working/idle in scene) */}
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
