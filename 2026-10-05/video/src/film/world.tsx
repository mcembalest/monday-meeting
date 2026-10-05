import React from 'react';
import {C, mono} from '../theme';
import {HexCell} from '../components';

// Held-out natural data, encoded the way the paper encodes it (Appendix B).
// The learner sees 8 bytes and predicts the next 8 (illustrative predictions).

const range = (n: number) => Array.from({length: n}, (_, i) => i);
const m = (x: number) => ((Math.round(x) % 256) + 256) % 256;
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

type World = {kind: 'text' | 'image' | 'audio' | 'melody' | 'dna'; context: number[]; actual: number[]; pred: number[]};
const withMiss = (a: number[], miss: Record<number, number>) => a.map((b, j) => miss[j] ?? b);

// CIFAR-style 8x8 sunset, interleaved RGB (HWC).
const PIX = range(64).map((i) => {
  const x = i % 8;
  const y = Math.floor(i / 8);
  const d = Math.hypot(x - 3.5, y - 4.2);
  if (d < 2.3) return [250, 200 - d * 30, 90];
  if (y >= 6) return [40 + x * 4, 60, 70];
  return [70 + y * 22, 60 + y * 12, 140 - y * 10];
});
const HWC = PIX.flat().map(m);
const PCM = range(64).map((n) => m(128 + 70 * Math.sin((2 * Math.PI * n) / 16) + 30 * Math.sin((2 * Math.PI * n) / 5.3)));
// Beethoven's Fifth, as in the paper's Figure 10: pitch onsets, 128 (0x80) holds the previous note.
const MELODY = [67, 128, 67, 128, 67, 128, 63, 128, 128, 128, 128, 128, 128, 128, 65, 128];
// DNA symbols 0-7: 0 a, 1 c, 2 t, 3 g, 4 A, 5 C, 6 T, 7 G.
const DNA_CODE: Record<string, number> = {a: 0, c: 1, t: 2, g: 3, A: 4, C: 5, T: 6, G: 7};
const DNA = [...'GATTACAGATTACAGA'].map((c) => DNA_CODE[c]);

export const WORLDS: World[] = [
  {kind: 'text', context: ascii('The proc'), actual: ascii('ess is m'), pred: withMiss(ascii('ess is m'), {4: 0x6f})},
  {kind: 'image', context: HWC.slice(96, 104), actual: HWC.slice(104, 112), pred: withMiss(HWC.slice(104, 112), {5: m(HWC[109] - 20)})},
  {kind: 'audio', context: PCM.slice(24, 32), actual: PCM.slice(32, 40), pred: withMiss(PCM.slice(32, 40), {6: m(PCM[38] + 9)})},
  {kind: 'melody', context: MELODY.slice(0, 8), actual: MELODY.slice(8), pred: withMiss(MELODY.slice(8), {6: 67})},
  {kind: 'dna', context: DNA.slice(0, 8), actual: DNA.slice(8), pred: DNA.slice(8)},
];

const S = 300;

const Text: React.FC<{w: World; p: number}> = ({w, p}) => (
  <div style={{width: S, height: S, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18, fontFamily: mono, fontSize: 46}}>
    <div style={{display: 'flex', color: C.ink, whiteSpace: 'pre'}}>
      {w.context.map((b, i) => (
        <span key={i} style={{width: 30, textAlign: 'center'}}>
          {String.fromCharCode(b)}
        </span>
      ))}
    </div>
    <div style={{width: S - 20, borderTop: `2px dashed ${C.learner}`}} />
    <div style={{display: 'flex', color: C.learner, whiteSpace: 'pre'}}>
      {w.actual.map((b, i) => (
        <span key={i} style={{width: 30, textAlign: 'center', opacity: p * 8 > i ? 1 : 0, borderBottom: w.pred[i] !== b ? `4px solid ${C.miss}` : '4px solid transparent'}}>
          {String.fromCharCode(b)}
        </span>
      ))}
    </div>
  </div>
);

const Image: React.FC<{p: number}> = ({p}) => {
  const cell = 34;
  const off = (S - cell * 8) / 2;
  return (
    <svg width={S} height={S}>
      {PIX.map(([r, g, b], i) => {
        const y = Math.floor(i / 8);
        const shown = y < 4 ? 1 : Math.max(0, Math.min(1, p * 32 - (i - 32)));
        return <rect key={i} x={off + (i % 8) * cell} y={off + y * cell} width={cell - 2} height={cell - 2} rx={3} fill={`rgb(${r},${g},${b})`} opacity={shown} />;
      })}
      <line x1={4} x2={S - 4} y1={off + 4 * cell - 1} y2={off + 4 * cell - 1} stroke={C.learner} strokeWidth={2} strokeDasharray="6 6" />
    </svg>
  );
};

const Audio: React.FC<{p: number}> = ({p}) => {
  const pt = (i: number) => `${10 + (i * (S - 20)) / 63},${S / 2 - (PCM[i] - 128) * 1.1}`;
  const upto = 31 + Math.floor(p * 32);
  return (
    <svg width={S} height={S}>
      <polyline points={range(32).map(pt).join(' ')} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
      <polyline points={range(upto - 30).map((j) => pt(31 + j)).join(' ')} fill="none" stroke={C.learner} strokeWidth={3} strokeLinejoin="round" />
      <line x1={10 + (31.5 * (S - 20)) / 63} x2={10 + (31.5 * (S - 20)) / 63} y1={20} y2={S - 20} stroke={C.learner} strokeWidth={2} strokeDasharray="6 6" />
    </svg>
  );
};

const Melody: React.FC<{p: number}> = ({p}) => {
  const w = 17;
  const off = (S - w * 16) / 2;
  const y = (n: number) => 230 - (n - 60) * 16;
  // Each byte is one 16th-note cell: an onset, or 0x80 holding the previous pitch.
  let pitch = MELODY[0];
  const cells = MELODY.map((b) => (b === 128 ? pitch : (pitch = b)));
  return (
    <svg width={S} height={S}>
      {[63, 65, 67].map((n) => (
        <line key={n} x1={4} x2={S - 4} y1={y(n) + 6} y2={y(n) + 6} stroke={C.faint} strokeWidth={1} />
      ))}
      {cells.map((n, i) => {
        const pred = i >= 8;
        if (pred && p * 8 <= i - 8) return null;
        const onset = MELODY[i] !== 128;
        return (
          <rect
            key={i}
            x={off + i * w + (onset ? 2 : -1)}
            y={y(n)}
            width={w - (onset ? 2 : -1)}
            height={12}
            rx={onset ? 3 : 0}
            fill={pred ? C.learner : C.ink}
            stroke={i === 14 ? C.miss : 'none'}
            strokeWidth={3}
          />
        );
      })}
      <line x1={off + 8 * w} x2={off + 8 * w} y1={30} y2={S - 30} stroke={C.learner} strokeWidth={2} strokeDasharray="6 6" />
    </svg>
  );
};

const BASE: Record<string, string> = {A: '#5fbf6a', C: '#5f8fe0', G: '#e0b84f', T: '#e0655e'};
const LETTER = 'actgACTG';
const Dna: React.FC<{w: World; p: number}> = ({w, p}) => {
  const tile = (b: number, i: number, pred: boolean, shown: boolean) => {
    const ch = LETTER[b];
    return (
      <div
        key={i}
        style={{
          width: 30,
          height: 52,
          borderRadius: 6,
          background: BASE[ch.toUpperCase()],
          opacity: shown ? (pred ? 0.85 : 1) : 0,
          fontFamily: mono,
          fontSize: 24,
          fontWeight: 700,
          color: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: pred ? `0 0 0 2px ${C.learner}` : 'none',
        }}
      >
        {ch}
      </div>
    );
  };
  return (
    <div style={{width: S, height: S, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 22}}>
      <div style={{display: 'flex', gap: 4}}>{w.context.map((b, i) => tile(b, i, false, true))}</div>
      <div style={{width: S - 20, borderTop: `2px dashed ${C.learner}`}} />
      <div style={{display: 'flex', gap: 4}}>{w.actual.map((b, i) => tile(b, i, true, p * 8 > i))}</div>
    </div>
  );
};

export const WORLD_W = 320;

export const WorldPanel: React.FC<{w: World; p: number}> = ({w, p}) => (
  <div style={{width: WORLD_W, padding: 10, boxSizing: 'border-box', background: C.card, border: `2px solid ${C.faint}`, borderRadius: 16}}>
    {w.kind === 'text' && <Text w={w} p={p} />}
    {w.kind === 'image' && <Image p={p} />}
    {w.kind === 'audio' && <Audio p={p} />}
    {w.kind === 'melody' && <Melody p={p} />}
    {w.kind === 'dna' && <Dna w={w} p={p} />}
    <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12}}>
      <div style={{display: 'flex', gap: 4}}>
        {w.context.map((b, i) => (
          <HexCell key={i} value={b} state="context" />
        ))}
      </div>
      <div style={{display: 'flex', gap: 4}}>
        {w.pred.map((b, i) => {
          const t = p * 8 - i;
          return <HexCell key={i} value={t <= 0 ? null : b} state={t <= 0 ? 'empty' : t < 0.6 ? 'ghost' : b === w.actual[i] ? 'ok' : 'miss'} />;
        })}
      </div>
    </div>
  </div>
);
