import React from 'react';
import {C, hex, mono, sans} from './theme';

// ---------- Network glyph ----------
const LAYERS = [3, 4, 3];
export const Net: React.FC<{cx: number; cy: number; scale?: number; color: string; lit: number; pulse: number; label: string; opacity?: number; flash?: number}> = ({
  cx,
  cy,
  scale = 1,
  color,
  lit,
  pulse,
  label,
  opacity = 1,
  flash = 0,
}) => {
  const nodes = LAYERS.flatMap((n, li) => Array.from({length: n}, (_, ni) => ({li, ni, x: 40 + li * 80, y: 120 + (ni - (n - 1) / 2) * 52})));
  return (
    <div style={{position: 'absolute', left: cx - 120, top: cy - 120, width: 240, transform: `scale(${scale})`, opacity, textAlign: 'center'}}>
      <svg width={240} height={240} style={{overflow: 'visible'}}>
        {nodes.map((a) =>
          nodes
            .filter((b) => b.li === a.li + 1)
            .map((b) => <line key={`${a.li}${a.ni}${b.ni}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.06 + 0.22 * lit} strokeWidth={2} />),
        )}
        {nodes.map(({li, ni, x, y}) => {
          const g = Math.min(1, Math.max(0, Math.sin(pulse * 0.22 - li * 0.9 + ni)) * lit + flash);
          return (
            <circle
              key={`${li}-${ni}`}
              cx={x}
              cy={y}
              r={16}
              fill={color}
              fillOpacity={0.05 + 0.4 * g}
              stroke={color}
              strokeOpacity={0.25 + 0.75 * lit}
              strokeWidth={3}
              style={{filter: `drop-shadow(0 0 ${4 + g * 16}px ${color})`}}
            />
          );
        })}
      </svg>
      <div style={{fontFamily: sans, fontSize: 21, letterSpacing: 2.5, color, opacity: 0.4 + 0.6 * lit, whiteSpace: 'nowrap', marginLeft: -100, marginRight: -100}}>{label}</div>
    </div>
  );
};

export const HexCell: React.FC<{
  value: number | null;
  state: 'empty' | 'context' | 'actual' | 'ghost' | 'ok' | 'miss';
  size?: number;
  fontSize?: number;
}> = ({value, state, size = 34, fontSize = 17}) => {
  const style: Record<typeof state, {border: string; bg: string; color: string}> = {
    empty: {border: `2px solid ${C.faint}`, bg: 'transparent', color: 'transparent'},
    context: {border: `2px solid ${C.faint}`, bg: 'transparent', color: C.ink},
    actual: {border: `2px solid ${C.teacher}88`, bg: 'transparent', color: C.ink},
    ghost: {border: `2px dashed ${C.learner}`, bg: 'transparent', color: C.learner},
    ok: {border: `2px solid ${C.ok}`, bg: `${C.ok}30`, color: C.ink},
    miss: {border: `2px solid ${C.miss}`, bg: `${C.miss}30`, color: C.miss},
  };
  const s = style[state];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: s.border,
        background: s.bg,
        color: s.color,
        fontFamily: mono,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        fontSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      {value === null ? '' : hex(value)}
    </div>
  );
};
