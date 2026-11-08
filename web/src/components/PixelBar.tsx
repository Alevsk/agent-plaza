import React from 'react';

interface PixelBarProps {
  percent: number; // -1 if no percentage
  text?: string;
  tokens?: string;
}

export const PixelBar: React.FC<PixelBarProps> = ({ percent, text, tokens }) => {
  if (percent < 0) {
    if (!text || text === '—' || text === '-') {
      return <span className="font-mono text-xs text-slate-500">—</span>;
    }
    return <span className="font-mono text-xs text-cyan-300 font-semibold">{text}</span>;
  }

  const clamped = Math.max(0, Math.min(100, percent));
  let filled = Math.floor((clamped * 10) / 100);
  if (clamped > 0 && filled === 0) filled = 1;

  const colorClass =
    clamped >= 90
      ? 'text-rose-400'
      : clamped >= 70
        ? 'text-amber-400'
        : 'text-emerald-400';

  const filledStr = '█'.repeat(filled);
  const emptyStr = '░'.repeat(10 - filled);

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
      <span className="tracking-tighter">
        <span className={colorClass}>{filledStr}</span>
        <span className="text-slate-700">{emptyStr}</span>
      </span>
      <span className={`w-8 text-right font-bold ${colorClass}`}>{clamped}%</span>
      {tokens && tokens !== '—' && (
        <span className="text-slate-300 text-[11px]">{tokens}</span>
      )}
    </span>
  );
};
