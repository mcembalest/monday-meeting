import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, random, staticFile, useCurrentFrame} from 'remotion';
import {getLength, getPointAtLength} from '@remotion/paths';
import {C, clamp, mono, sans} from '../theme';
import {HexCell, Net} from '../components';
import {QUOTES} from './quotes';
import {WORLDS, WORLD_W, WorldPanel} from './world';
import {
  AUDIO_FILE,
  AUDIO_TRIM,
  CUE,
  DURATION,
  LATE_NOTES,
  LEARNER_NOTES,
  ROUNDS,
  TEACHER_NOTES,
  UPDATES,
  Round,
  lastBefore,
  roundAt,
  sec,
  updatesBefore,
} from './score';

const ease = {...clamp, easing: Easing.inOut(Easing.cubic)};
const fadeIn = (frame: number, at: number, d = 20) => interpolate(frame, [at, at + d], [0, 1], clamp);

// When each piece of the machine appears (video seconds, matching the quote it illustrates).
const V = {
  policy: sec(104),
  ce: sec(116),
  reward: sec(130),
  demo: [sec(141), sec(152.5)],
  worldIn: CUE.exit + 24,
  predict: sec(174.5),
  worldOut: sec(186),
  stream: sec(186.5),
};

// ---------- quotes ----------
// Name both roles everywhere: generator → teacher/generator, learner → learner/predictor.
// The added words are dimmed so the paper's own wording stays visible.
const withRoles = (text: string) =>
  text.split(/\b(generator|learner)\b/).map((part, i) =>
    part === 'generator' ? (
      <React.Fragment key={i}>
        <span style={{color: C.dim}}>teacher/</span>generator
      </React.Fragment>
    ) : part === 'learner' ? (
      <React.Fragment key={i}>
        learner<span style={{color: C.dim}}>/predictor</span>
      </React.Fragment>
    ) : (
      part
    ),
  );
const Quote: React.FC<{frame: number}> = ({frame}) => {
  const i = QUOTES.findIndex((q, j) => frame >= sec(q.at) && (j + 1 === QUOTES.length || frame < sec(QUOTES[j + 1].at)));
  if (i < 0) return null;
  const q = QUOTES[i];
  const start = sec(q.at);
  const next = i + 1 < QUOTES.length ? sec(QUOTES[i + 1].at) - 20 : DURATION;
  const end = Math.min(next, start + sec(Math.max(9, q.text.length / 15 + 3)));
  const o = interpolate(frame, [start, start + 18, end - 18, end], [0, 1, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: 0, top: 846, width: 1920, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: o}}>
      <div style={{maxWidth: 1600, textAlign: 'center', fontFamily: sans, fontSize: 31, fontWeight: 400, lineHeight: 1.45, color: C.ink}}>
        <span style={{color: C.dim}}>“</span>
        {withRoles(q.text)}
        <span style={{color: C.dim}}>”</span>
      </div>
    </div>
  );
};

// ---------- top row: program, tape, bytes, cross-entropy ----------
const CELL = 46;
const GAP = 5;
const ROW_X = 880;
const ACT_Y = 112;
const PRED_Y = 178;
const CE_Y = 238;
const VISIBLE = 12;

// Where the machine is in its program: interpolates between emitted bytes, in time with the notes.
const machineStep = (r: Round, frame: number) => {
  const e = r.cells.filter((c) => c.actT <= frame).length;
  if (e >= r.cells.length) return r.emitStep[r.emitStep.length - 1];
  const prevT = e === 0 ? r.start : r.cells[e - 1].actT;
  const prevS = e === 0 ? 0 : r.emitStep[e - 1];
  if (prevT >= r.cells[e].actT) return r.emitStep[e];
  const t = interpolate(frame, [prevT, r.cells[e].actT], [0, 1], clamp);
  return Math.floor(prevS + (r.emitStep[e] - prevS) * t);
};

const Machine: React.FC<{r: Round; frame: number}> = ({r, frame}) => {
  const s = r.steps[Math.max(0, machineStep(r, frame))];
  const W = 26;
  const from = Math.max(0, Math.min(s.pc - 10, r.prog.length - W));
  const text = r.prog.slice(from, from + W);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 420,
          top: ACT_Y,
          width: 400,
          height: 64,
          borderRadius: 12,
          border: `2px solid ${C.faint}`,
          background: C.card,
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          boxSizing: 'border-box',
          fontFamily: mono,
          fontVariantLigatures: 'none',
          fontSize: 22,
          color: C.teacher,
          whiteSpace: 'pre',
          overflow: 'hidden',
        }}
      >
        {[...text].map((ch, i) => (
          <span key={i} style={from + i === s.pc ? {background: C.teacher, color: C.bg, borderRadius: 3} : {opacity: from + i < s.pc ? 0.55 : 1}}>
            {ch}
          </span>
        ))}
      </div>
    </>
  );
};

const Bytes: React.FC<{r: Round; frame: number; ceVis: number}> = ({r, frame, ceVis}) => {
  let first = 0;
  if (r.mode === 'stream') {
    const e = r.cells.filter((c) => c.actT <= frame + 3).length;
    first = Math.max(0, e - VISIBLE);
  }
  const shownCells = r.cells.slice(first, first + VISIBLE);
  return (
    <>
      {shownCells.map((c, i) => {
        const x = ROW_X + i * (CELL + GAP);
        const shown = frame >= c.actT;
        const ghost = frame >= c.predT - 3;
        const done = frame >= c.predT;
        const ok = c.pred === c.actual;
        const h = (c.ce / 8) * 64;
        return (
          <React.Fragment key={first + i}>
            <div style={{position: 'absolute', left: x, top: ACT_Y}}>
              <HexCell size={CELL} fontSize={20} value={shown ? c.actual : null} state={shown ? 'actual' : 'empty'} />
            </div>
            <div style={{position: 'absolute', left: x, top: PRED_Y}}>
              <HexCell size={CELL} fontSize={20} value={ghost ? c.pred : null} state={!ghost ? 'empty' : !done ? 'ghost' : ok ? 'ok' : 'miss'} />
            </div>
            {done && (
              <div
                style={{
                  position: 'absolute',
                  left: x + 8,
                  top: CE_Y,
                  width: CELL - 16,
                  height: h * interpolate(frame, [c.predT, c.predT + 6], [0, 1], clamp),
                  borderRadius: 3,
                  background: interpolateColor(c.ce / 8),
                  opacity: ceVis,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

const interpolateColor = (t: number) => {
  const a = [0x6f, 0xcf, 0x7f];
  const b = [0xe2, 0x67, 0x5e];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
};

// ---------- feedback loop ----------
const LOOP = 'M1660,112 L1660,88 Q1660,70 1640,70 L280,70 Q260,70 260,88 L260,112';
const LOOP_LEN = getLength(LOOP);

const Loop: React.FC<{frame: number}> = ({frame}) => {
  const n = updatesBefore(frame);
  const u = UPDATES[n - 1];
  const next = UPDATES[n];
  let dot = null;
  if (u) {
    const dur = Math.max(6, Math.min(30, (next?.at ?? u.at + 30) - u.at));
    const t = (frame - u.at) / dur;
    if (t >= 0 && t <= 1) dot = getPointAtLength(LOOP, t * LOOP_LEN);
  }
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
      <path d={LOOP} fill="none" stroke={C.teacher} strokeOpacity={0.3} strokeWidth={2.5} strokeDasharray="10 10" />
      {dot && <circle cx={dot.x} cy={dot.y} r={8} fill={C.learner} style={{filter: `drop-shadow(0 0 10px ${C.learner})`}} />}
      <g stroke={C.dim} strokeWidth={2.5}>
        <line x1={372} y1={144} x2={410} y2={144} />
        <line x1={826} y1={135} x2={870} y2={135} />
        <line x1={1572} y1={201} x2={1500} y2={201} stroke={C.learner} strokeDasharray="5 5" />
      </g>
    </svg>
  );
};

// ---------- lower panels ----------
const Caption: React.FC<{x: number; y: number; children: React.ReactNode}> = ({x, y, children}) => (
  <div style={{position: 'absolute', left: x, top: y, fontFamily: sans, fontSize: 19, letterSpacing: 1.5, color: C.dim}}>{children}</div>
);

const LossPanel: React.FC<{frame: number; vis: number}> = ({frame, vis}) => {
  const X = 1380;
  const W = 350;
  const H = 280;
  const n = updatesBefore(frame);
  const ups = UPDATES.slice(0, n);
  const x = (f: number) => (f / CUE.exit) * W;
  const y = (l: number) => H - (l / 8) * H;
  const avg = ups.map((u, i) => {
    let j = i;
    while (j > 0 && (i - j < 2 || ups[j - 1].at > u.at - (u.at > CUE.fastFrom ? 240 : 150))) j--;
    const w = ups.slice(j, i + 1);
    return w.reduce((s, d) => s + d.loss, 0) / w.length;
  });
  return (
    <div style={{opacity: vis}}>
      <Caption x={X} y={438}>
        learner/predictor cross-entropy
      </Caption>
      <svg width={W + 20} height={H + 20} style={{position: 'absolute', left: X, top: 478, overflow: 'visible'}}>
        <line x1={0} y1={0} x2={0} y2={H} stroke={C.faint} strokeWidth={2} />
        <line x1={0} y1={H} x2={W} y2={H} stroke={C.faint} strokeWidth={2} />
        <text x={W} y={H + 24} textAnchor="end" fill={C.dim} fontFamily={sans} fontSize={16}>
          bits/byte
        </text>
        {ups
          .filter((u) => u.at < CUE.fastFrom)
          .map((u) => (
            <circle key={u.k} cx={x(u.at)} cy={y(u.loss)} r={3.5} fill={C.learner} opacity={0.35} />
          ))}
        <polyline points={ups.map((u, i) => `${x(u.at)},${y(avg[i])}`).join(' ')} fill="none" stroke={C.learner} strokeWidth={4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

type Vec = [number, number];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const rot = (a: Vec, ang: number): Vec => [a[0] * Math.cos(ang) - a[1] * Math.sin(ang), a[0] * Math.sin(ang) + a[1] * Math.cos(ang)];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

const KIND_ARROW = {
  frontier: {ang: 0.18, len: 0.85},
  mastered: {ang: 2.6, len: 0.2},
  noise: {ang: -1.57, len: 0.62},
} as const;

const Arrow: React.FC<{from: Vec; to: Vec; color: string; width?: number}> = ({from, to, color, width = 4}) => {
  const d = norm(sub(to, from));
  const l = Math.hypot(...sub(to, from));
  if (l < 2) return null;
  const head = 14;
  const base = sub(to, mul(d, head));
  const side = mul(rot(d, Math.PI / 2), head * 0.5);
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={base[0]} y2={base[1]} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <polygon points={[to, add(base, side), sub(base, side)].map((p) => p.join(',')).join(' ')} fill={color} />
    </g>
  );
};

// ---------- learner parameters: a fixed loss landscape with a curved valley ----------
const RW = 440;
const RH = 300;
const valley = (s: number): Vec => [46 + 280 * s, 240 - 120 * s + 50 * Math.sin(Math.PI * s)];
const VALLEY = Array.from({length: 121}, (_, i) => valley(i / 120));
const tangent = (s: number) => norm(sub(valley(Math.min(1, s + 0.02)), valley(Math.max(0, s - 0.02))));
// Loss at a point: low along the valley floor, lowest at its end.
const landscape = (p: Vec) => {
  let best = Infinity;
  let bs = 0;
  VALLEY.forEach((q, i) => {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best) [best, bs] = [d, i / 120];
  });
  return 0.55 * (1 - bs) + (best / 70) ** 2;
};
const GRID = 12;
const TILES = Array.from({length: Math.ceil(RW / GRID) * Math.ceil(RH / GRID)}, (_, i) => {
  const cols = Math.ceil(RW / GRID);
  const x = (i % cols) * GRID;
  const y = Math.floor(i / cols) * GRID;
  const level = Math.min(6, Math.floor(landscape([x + GRID / 2, y + GRID / 2]) * 5));
  return {x, y, level};
});
// Parameters after each update: progress along the valley tracks the learner's skill; SGD jitter shrinks.
const progressAt = (f: number) => 0.92 * Math.min(1, Math.max(0, f / CUE.exit)) ** 0.85;
const THETA: Vec[] = [valley(0), ...UPDATES.map((u) => add(valley(progressAt(u.at)), mul(rot(tangent(progressAt(u.at)), Math.PI / 2), (random(`j${u.k}`) - 0.5) * 22 * (1 - progressAt(u.at)))))];

const RewardPanel: React.FC<{frame: number; vis: number}> = ({frame, vis}) => {
  const X = 160;
  const Y = 470;
  const n = updatesBefore(frame);
  const cur = THETA[n];
  const past = THETA[Math.floor(n / 2)];
  const dTheta = sub(cur, past);
  const u = norm(dTheta);
  const ahead = tangent(Math.min(1, progressAt(UPDATES[Math.max(0, n - 1)]?.at ?? 0) + 0.04));
  const demo = frame >= V.demo[0] && frame < V.demo[1];
  const latest = UPDATES[n - 1];
  const kinds: (keyof typeof KIND_ARROW)[] = demo ? ['mastered', 'noise', 'frontier'] : latest ? [latest.kind] : [];
  const LABEL = {mastered: 'already mastered', noise: 'unlearnable', frontier: 'frontier'};
  return (
    <div style={{opacity: vis}}>
      <Caption x={X} y={Y - 32}>
        learner/predictor parameters θ
      </Caption>
      <div style={{position: 'absolute', left: X, top: Y + RH + 8, width: RW, display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 2, fontFamily: sans, fontSize: 16, color: C.dim}}>
        <span>
          <b style={{color: C.learner}}>Δθ</b> learner/predictor trajectory
        </span>
        <span>
          <b style={{color: C.teacher}}>g</b> learner/predictor gradient
        </span>
        <span>
          <b style={{color: C.ok}}>|⟨g, Δθ⟩|</b> alignment
        </span>
      </div>
      <svg width={RW} height={RH} style={{position: 'absolute', left: X, top: Y, overflow: 'visible'}}>
        <defs>
          <clipPath id="rp">
            <rect x={0} y={0} width={RW} height={RH} rx={14} />
          </clipPath>
        </defs>
        <g clipPath="url(#rp)">
          {TILES.map((t, i) => (
            <rect key={i} x={t.x} y={t.y} width={GRID} height={GRID} fill={C.learner} opacity={0.02 + (6 - t.level) * 0.022} />
          ))}
        </g>
        <rect x={0} y={0} width={RW} height={RH} rx={14} fill="none" stroke={C.faint} strokeWidth={2} />
        <polyline points={THETA.slice(0, n + 1).map((p) => p.join(',')).join(' ')} fill="none" stroke={C.learner} strokeOpacity={0.45} strokeWidth={2} />
        {THETA.slice(0, n + 1)
          .filter((_, i) => i < 18)
          .map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={C.learner} opacity={0.5} />
          ))}
        {n > 1 && <Arrow from={past} to={cur} color={C.learner} width={5} />}
        {n > 1 && (
          <text x={(past[0] + cur[0]) / 2 + u[1] * 22} y={(past[1] + cur[1]) / 2 - u[0] * 22} fill={C.learner} fontFamily={sans} fontSize={20} textAnchor="middle">
            Δθ
          </text>
        )}
        {n > 1 &&
          kinds.map((kind, i) => {
            const a = KIND_ARROW[kind];
            const grow = demo
              ? interpolate(frame, [V.demo[0] + 20 + i * 45, V.demo[0] + 40 + i * 45], [0, 1], clamp)
              : interpolate(frame, [latest.at, latest.at + 8], [0, 1], clamp);
            const dir = kind === 'frontier' ? rot(ahead, 0.18) : kind === 'noise' ? rot(u, -Math.PI / 2) : rot(u, 2.6);
            const g = mul(dir, a.len * 90 * grow);
            const tip = add(cur, g);
            const proj = dot(g, u);
            const foot = add(cur, mul(u, proj));
            return (
              <g key={kind} opacity={grow > 0 ? 1 : 0}>
                <line x1={tip[0]} y1={tip[1]} x2={foot[0]} y2={foot[1]} stroke={C.dim} strokeWidth={2} strokeDasharray="5 5" />
                <line x1={cur[0]} y1={cur[1]} x2={foot[0]} y2={foot[1]} stroke={C.ok} strokeWidth={8} strokeLinecap="round" opacity={0.85} />
                <Arrow from={cur} to={tip} color={C.teacher} />
                <text
                  x={tip[0] + norm(g)[0] * 14}
                  y={tip[1] + norm(g)[1] * 14 + (demo ? 22 : -6)}
                  textAnchor={norm(g)[0] < -0.2 ? 'end' : norm(g)[0] > 0.2 ? 'start' : 'middle'}
                  fill={demo ? C.dim : C.teacher}
                  fontFamily={sans}
                  fontSize={demo ? 17 : 20}
                >
                  {demo ? LABEL[kind] : 'g'}
                </text>
              </g>
            );
          })}
        <circle cx={cur[0]} cy={cur[1]} r={6} fill={C.learner} />
      </svg>
    </div>
  );
};

const RewardChart: React.FC<{frame: number; vis: number}> = ({frame, vis}) => {
  const X = 650;
  const W = 300;
  const H = 280;
  const ups = UPDATES.slice(0, updatesBefore(frame));
  const x = (f: number) => (f / CUE.exit) * W;
  const avg = ups.map((u, i) => {
    let j = i;
    while (j > 0 && (i - j < 2 || ups[j - 1].at > u.at - 240)) j--;
    const w = ups.slice(j, i + 1);
    return w.reduce((s, d) => s + d.reward, 0) / w.length;
  });
  return (
    <div style={{opacity: vis}}>
      <Caption x={X} y={438}>
        teacher/generator reward r
      </Caption>
      <svg width={W + 20} height={H + 20} style={{position: 'absolute', left: X, top: 478, overflow: 'visible'}}>
        <line x1={0} y1={0} x2={0} y2={H} stroke={C.faint} strokeWidth={2} />
        <line x1={0} y1={H} x2={W} y2={H} stroke={C.faint} strokeWidth={2} />
        {ups.map((u) => (
          <line key={u.k} x1={x(u.at)} x2={x(u.at)} y1={H} y2={H - u.reward * (H - 10)} stroke={C.ok} strokeWidth={u.at < CUE.fastFrom ? 4 : 1} opacity={u.at < CUE.fastFrom ? 0.7 : 0.12} />
        ))}
        <polyline points={ups.map((u, i) => `${x(u.at)},${H - avg[i] * (H - 10)}`).join(' ')} fill="none" stroke={C.ok} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const PolicyPanel: React.FC<{frame: number; vis: number}> = ({frame, vis}) => {
  const X = 990;
  const Y = 478;
  const W = 300;
  const H = 280;
  const n = updatesBefore(frame);
  const prev = UPDATES[Math.max(0, n - 2)]?.frontier ?? 0;
  const curr = UPDATES[n - 1]?.frontier ?? 0;
  const F = n ? interpolate(frame, [UPDATES[n - 1].at, UPDATES[n - 1].at + 10], [prev, curr], ease) : 0;
  const BARS = 10;
  const w = Array.from({length: BARS}, (_, j) => Math.exp(-((j / (BARS - 1) - F) ** 2) / (2 * 0.13 ** 2)) + 0.06);
  const max = Math.max(...w);
  const bw = W / BARS - 6;
  return (
    <div style={{opacity: vis}}>
      <Caption x={X} y={Y - 40}>
        teacher/generator g<sub>ϕ</sub>
      </Caption>
      <svg width={W} height={H + 30} style={{position: 'absolute', left: X, top: Y, overflow: 'visible'}}>
        <line x1={0} y1={H} x2={W} y2={H} stroke={C.faint} strokeWidth={2} />
        {w.map((v, j) => {
          const h = (v / max) * (H - 20);
          return <rect key={j} x={j * (W / BARS) + 3} y={H - h} width={bw} height={h} rx={4} fill={C.teacher} opacity={0.25 + 0.75 * (v / max)} />;
        })}
        <text x={0} y={H + 26} fill={C.dim} fontFamily={sans} fontSize={16}>
          simpler programs
        </text>
        <text x={W} y={H + 26} textAnchor="end" fill={C.dim} fontFamily={sans} fontSize={16}>
          richer programs
        </text>
      </svg>
    </div>
  );
};

// ---------- the film ----------
const flash = (notes: number[], frame: number) => 0.85 * Math.exp(-(frame - lastBefore(notes, frame)) / 5);

const worldBox = (i: number, e: number) => ({x: 96 + i * (WORLD_W + 32), y: interpolate(e, [0, 1], [520, 410]), o: e});
const WORLD_CELLS = WORLDS.map((_, i) => {
  const s = LATE_NOTES.findIndex((f) => f >= V.predict + i * sec(1.4));
  return Array.from({length: 8}, (_, j) => LATE_NOTES[Math.min(LATE_NOTES.length - 1, s + 2 * j)]);
});
const worldProgress = (i: number, frame: number) => WORLD_CELLS[i].reduce((s, f) => s + interpolate(frame, [f - 4, f], [0, 1], clamp), 0) / 8;

// ---------- title card over the opening chords ----------
const Title: React.FC<{frame: number}> = ({frame}) => {
  const o = interpolate(frame, [sec(0.6), sec(2.2), sec(10.8), sec(12.2)], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: o, fontFamily: sans, textAlign: 'center'}}>
      <div style={{fontSize: 76, fontWeight: 600, color: C.ink, letterSpacing: -1}}>Self-Play Pretraining with Zero Data</div>
      <div style={{fontSize: 26, color: C.dim, marginTop: 36, opacity: interpolate(frame, [sec(2.4), sec(3.8)], [0, 1], clamp)}}>
        Aditya Cowsik · Kfir Dolev · Michael Y. Li · G. Bruno De Luca · Nourya Cohen · Noah D. Goodman · Yoav Levine
      </div>
      <div style={{fontSize: 22, color: C.dim, marginTop: 18, letterSpacing: 2, opacity: interpolate(frame, [sec(3.4), sec(4.8)], [0, 1], clamp)}}>arXiv:2609.30063</div>
    </AbsoluteFill>
  );
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  const r = ROUNDS[roundAt(frame)];
  const n = updatesBefore(frame);
  const progress = n / UPDATES.length;

  const boxIn = interpolate(frame, [sec(11.5), sec(13.5)], [0, 1], clamp);
  const train = interpolate(frame, [CUE.exit - 18, CUE.exit + 12], [1, 0], clamp) * boxIn;
  const exit = interpolate(frame, [CUE.exit, CUE.exit + 60], [0, 1], ease);
  const worldE = interpolate(frame, [V.worldIn, V.worldIn + 60], [0, 1], ease);
  const worldOut = interpolate(frame, [V.worldOut, V.worldOut + 20], [1, 0], clamp);
  const stream = interpolate(frame, [V.stream, V.stream + 20], [0, 1], clamp);
  const end = interpolate(frame, [DURATION - 50, DURATION], [1, 0], clamp);
  const finalHit = frame >= CUE.lastNote ? Math.exp(-(frame - CUE.lastNote) / 10) : 0;

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Audio src={staticFile(AUDIO_FILE)} trimBefore={AUDIO_TRIM} />
      <AbsoluteFill style={{opacity: end}}>
        <div
          style={{
            position: 'absolute',
            left: 120,
            top: 30,
            width: 1680,
            height: 800,
            borderRadius: 28,
            border: '2px solid rgba(239,233,220,0.16)',
            background: 'linear-gradient(135deg, rgba(239,233,220,0.045), rgba(239,233,220,0.01) 40%, rgba(239,233,220,0.03))',
            opacity: boxIn * (1 - exit),
            transform: `scale(${1 + 0.05 * exit})`,
          }}
        >
        </div>

        <AbsoluteFill style={{opacity: train}}>
          <Net cx={260} cy={215} scale={0.85} color={C.teacher} lit={0.3 + 0.7 * progress} flash={flash(TEACHER_NOTES, frame)} pulse={frame} label="TEACHER / GENERATOR" />
          {frame >= r.start && <Machine r={r} frame={frame} />}
          {frame >= r.start && <Bytes r={r} frame={frame} ceVis={fadeIn(frame, V.ce)} />}
          <Loop frame={frame} />
          <LossPanel frame={frame} vis={fadeIn(frame, V.ce)} />
          <RewardPanel frame={frame} vis={fadeIn(frame, V.reward)} />
          <RewardChart frame={frame} vis={fadeIn(frame, V.reward)} />
          <PolicyPanel frame={frame} vis={fadeIn(frame, V.policy)} />
        </AbsoluteFill>

        {frame >= V.worldIn &&
          WORLDS.map((w, i) => {
            const b = worldBox(i, worldE);
            return (
              <div key={w.kind} style={{position: 'absolute', left: b.x, top: b.y, opacity: b.o * worldOut}}>
                <WorldPanel w={w} p={worldProgress(i, frame)} />
              </div>
            );
          })}

        {frame >= V.worldIn && (
          <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, opacity: fadeIn(frame, V.worldIn + 50, 30) * worldOut}}>
            {WORLDS.map((_, i) => {
              const x2 = 96 + i * (WORLD_W + 32) + WORLD_W / 2;
              const t = (frame * 0.035 + i * 0.2) % 1;
              return (
                <g key={i}>
                  <line x1={960} y1={348} x2={x2} y2={402} stroke={C.learner} strokeOpacity={0.3} strokeWidth={2} />
                  <circle cx={960 + (x2 - 960) * t} cy={348 + 54 * t} r={5} fill={C.learner} />
                </g>
              );
            })}
          </svg>
        )}

        {frame >= V.stream && (
          <div style={{position: 'absolute', top: 560, left: 0, width: 1920, height: 60, overflow: 'hidden', opacity: stream}}>
            <div style={{display: 'flex', gap: 6, transform: `translateX(${-Math.min(frame - V.stream, CUE.lastNote - V.stream) * 8}px)`}}>
              {[...WORLDS, ...WORLDS, ...WORLDS].flatMap((w, wi) => [...w.context, ...w.actual].map((b, i) => <HexCell key={`${wi}-${i}`} value={b} state={i < 8 ? 'context' : 'ok'} size={50} fontSize={22} />))}
            </div>
          </div>
        )}

        <Net
          cx={interpolate(exit, [0, 1], [1660, 960])}
          cy={interpolate(exit, [0, 1], [215, 210])}
          scale={0.85}
          color={C.learner}
          lit={frame < CUE.exit ? 0.25 + 0.75 * progress : 1}
          flash={flash(LEARNER_NOTES, frame) * (frame < CUE.exit ? 1 : 0.6) + finalHit}
          pulse={frame + 20}
          label="LEARNER / PREDICTOR"
          opacity={boxIn}
        />

        <Title frame={frame} />
        <Quote frame={frame} />

        <div style={{position: 'absolute', right: 60, top: 40, fontFamily: mono, fontSize: 22, color: C.dim, opacity: fadeIn(frame, CUE.lastNote, 15)}}>arXiv:2609.30063</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FILM_DURATION = DURATION;
