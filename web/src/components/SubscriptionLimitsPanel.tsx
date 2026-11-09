import React from 'react';
import { X } from 'lucide-react';
import type { AccountSubscription, OfflineAgent, TemplateManifest } from '../types';
import { PixelBar } from './PixelBar';

interface SubscriptionLimitsPanelProps {
  subscriptions: AccountSubscription[];
  otherAgents: OfflineAgent[];
  template: TemplateManifest | null;
  onClose?: () => void;
}

export const SubscriptionLimitsPanel: React.FC<SubscriptionLimitsPanelProps> = ({
  subscriptions,
  otherAgents,
  template,
  onClose,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl md:rounded-lg border border-slate-700/80 bg-slate-950/92 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* SUBSCRIPTION LIMITS HEADER */}
      <div className="flex items-center justify-between px-4 py-3 md:py-2.5 border-b border-slate-800 bg-slate-900/85 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-mono text-xs font-extrabold">■</span>
          <h2 className="font-mono text-xs font-extrabold tracking-wider text-amber-400 uppercase">
            SUBSCRIPTION LIMITS
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-slate-400">
            {subscriptions.length} accounts
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

      {/* Desktop Column Headers */}
      <div className="hidden md:grid grid-cols-[64px_138px_40px_124px_124px_86px] gap-1.5 px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/40 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
        <div>AGENT</div>
        <div>ACCOUNT</div>
        <div>PLAN</div>
        <div>LIMIT</div>
        <div>USAGE</div>
        <div className="text-right">RESETS</div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y divide-y divide-slate-800/80 p-2 md:p-0">
        {subscriptions.map((sub, idx) => {
          const style =
            template?.characters[sub.agent] || template?.characters['default'];
          const badgeColor = style?.badge_color || '#38bdf8';

          return (
            <div
              key={`${sub.agent}-${sub.account_id}-${idx}`}
              className="py-2.5 px-3 md:py-1.5 hover:bg-slate-900/50 transition-colors rounded-lg md:rounded-none bg-slate-900/25 md:bg-transparent mb-2 md:mb-0 border border-slate-800/60 md:border-none"
            >
              {/* Mobile Card Layout (< md) */}
              <div className="flex flex-col gap-2 md:hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{ backgroundColor: badgeColor }}
                      className="w-2 h-2 rounded-xs shrink-0"
                    />
                    <span className="font-mono text-xs font-bold text-white">
                      {sub.agent}
                    </span>
                    <span className="font-mono text-[11px] text-cyan-300 truncate max-w-[130px]">
                      {sub.account_display}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 font-semibold">
                    {sub.plan}
                  </span>
                </div>

                <div className="flex flex-col gap-2 pt-0.5">
                  {sub.windows.map((win, wIdx) => (
                    <div key={`${win.label}-${wIdx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300 font-medium">{win.label}</span>
                        <span className="text-slate-400 text-[10px]">
                          resets {win.resets || '—'}
                        </span>
                      </div>
                      <PixelBar percent={win.usage_pct} text={win.usage_text} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Desktop 6-Column Grid (>= md) */}
              <div className="hidden md:block">
                {sub.windows.map((win, wIdx) => (
                  <div
                    key={`${win.label}-${wIdx}`}
                    className="grid grid-cols-[64px_138px_40px_124px_124px_86px] gap-1.5 items-center py-0.5 font-mono text-xs"
                  >
                    {/* AGENT (only first row of account block) */}
                    <div className="truncate">
                      {wIdx === 0 && (
                        <span className="inline-flex items-center gap-1 font-bold text-white">
                          <span
                            style={{ backgroundColor: badgeColor }}
                            className="w-1.5 h-1.5 rounded-xs shrink-0"
                          />
                          {sub.agent}
                        </span>
                      )}
                    </div>

                    {/* ACCOUNT (only first row) */}
                    <div
                      className="text-cyan-300 text-[11px] truncate"
                      title={sub.account_display}
                    >
                      {wIdx === 0 ? sub.account_display : ''}
                    </div>

                    {/* PLAN (only first row) */}
                    <div className="text-slate-300 text-[11px] truncate">
                      {wIdx === 0 ? sub.plan : ''}
                    </div>

                    {/* LIMIT */}
                    <div
                      className="text-slate-200 text-[11px] truncate"
                      title={win.label}
                    >
                      {win.label}
                    </div>

                    {/* USAGE */}
                    <div>
                      <PixelBar percent={win.usage_pct} text={win.usage_text} />
                    </div>

                    {/* RESETS */}
                    <div className="text-right text-[11px] text-slate-400 truncate">
                      {win.resets || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* OTHER AGENTS SECTION */}
        {otherAgents && otherAgents.length > 0 && (
          <div className="border-t border-slate-700/80 bg-slate-900/30 p-2 md:p-0">
            <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-800 bg-slate-900/70">
              <span className="text-cyan-400 font-mono text-xs font-extrabold">■</span>
              <h3 className="font-mono text-xs font-extrabold tracking-wider text-cyan-400 uppercase">
                OTHER AGENTS
              </h3>
            </div>
            {/* Desktop Table Header */}
            <div className="hidden md:grid grid-cols-[90px_120px_1fr] gap-2 px-3.5 py-1 border-b border-slate-800/60 font-mono text-[10px] font-bold text-slate-400 uppercase">
              <div>AGENT</div>
              <div>PROVIDER</div>
              <div>LIMIT</div>
            </div>
            {/* Rows */}
            {otherAgents.map((oa) => (
              <div
                key={oa.agent}
                className="flex md:grid md:grid-cols-[90px_120px_1fr] items-center justify-between gap-2 px-3.5 py-2 md:py-1.5 font-mono text-xs text-slate-400 border-b border-slate-800/40 md:border-none"
              >
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-xs bg-cyan-400" />
                  {oa.agent}
                </div>
                <div className="text-slate-300 text-[11px]">{oa.provider}</div>
                <div className="text-right md:text-left text-amber-300/90 text-[11px] font-semibold">{oa.limit}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
