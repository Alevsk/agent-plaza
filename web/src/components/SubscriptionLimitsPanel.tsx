import React from 'react';
import type { AccountSubscription, OfflineAgent, TemplateManifest } from '../types';
import { PixelBar } from './PixelBar';

interface SubscriptionLimitsPanelProps {
  subscriptions: AccountSubscription[];
  otherAgents: OfflineAgent[];
  template: TemplateManifest | null;
}

export const SubscriptionLimitsPanel: React.FC<SubscriptionLimitsPanelProps> = ({
  subscriptions,
  otherAgents,
  template,
}) => {
  return (
    <div className="flex flex-col h-full rounded-lg border border-slate-700/80 bg-slate-950/88 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* SUBSCRIPTION LIMITS HEADER */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-mono text-xs font-extrabold">■</span>
          <h2 className="font-mono text-xs font-extrabold tracking-wider text-amber-400 uppercase">
            SUBSCRIPTION LIMITS
          </h2>
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          {subscriptions.length} accounts
        </span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[64px_138px_40px_124px_124px_86px] gap-1.5 px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/40 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <div>AGENT</div>
        <div>ACCOUNT</div>
        <div>PLAN</div>
        <div>LIMIT</div>
        <div>USAGE</div>
        <div className="text-right">RESETS</div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {subscriptions.map((sub, idx) => {
          const style =
            template?.characters[sub.agent] || template?.characters['default'];
          const badgeColor = style?.badge_color || '#38bdf8';

          return (
            <div
              key={`${sub.agent}-${sub.account_id}-${idx}`}
              className="py-1.5 px-3 hover:bg-slate-900/50 transition-colors"
            >
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
          );
        })}

        {/* OTHER AGENTS SECTION */}
        {otherAgents && otherAgents.length > 0 && (
          <div className="border-t border-slate-700/80 bg-slate-900/30">
            <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-800 bg-slate-900/70">
              <span className="text-cyan-400 font-mono text-xs font-extrabold">■</span>
              <h3 className="font-mono text-xs font-extrabold tracking-wider text-cyan-400 uppercase">
                OTHER AGENTS
              </h3>
            </div>
            <div className="grid grid-cols-[90px_120px_1fr] gap-2 px-3.5 py-1 border-b border-slate-800/60 font-mono text-[10px] font-bold text-slate-400 uppercase">
              <div>AGENT</div>
              <div>PROVIDER</div>
              <div>LIMIT</div>
            </div>
            {otherAgents.map((oa) => (
              <div
                key={oa.agent}
                className="grid grid-cols-[90px_120px_1fr] gap-2 px-3.5 py-1.5 font-mono text-xs text-slate-400"
              >
                <div className="font-bold text-white">{oa.agent}</div>
                <div>{oa.provider}</div>
                <div>{oa.limit}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
