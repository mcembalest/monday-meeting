import {random} from 'remotion';
import cues from '../cues.json';
import {programFor, run, Step} from './bf';

// Everything the film shows, timed to the notes of the song.
// Bytes are note pitches (the paper's melody encoding: byte = MIDI pitch).
// Learner confidences, losses, rewards and parameter movements are illustrative.

export const FPS = 30;
export const fr = (t: number) => Math.round((t - cues.offset) * FPS);
export const sec = (s: number) => Math.round(s * FPS); // video seconds → frames
export const DURATION = fr(cues.end);
export const AUDIO_FILE = 'Deliverance • Dueling Banjos • Arthur Smith, Eric Weissberg & Steve Mandell.mp3';
export const AUDIO_TRIM = Math.round(cues.offset * FPS);

export const CUE = {
  exit: fr(cues.exit),
  lastNote: fr(cues.lastNote),
  fastFrom: fr(cues.fastFrom),
};

// ---------- cells: one per note ----------
export type Cell = {
  actual: number;
  actT: number; // frame the teacher emits it
  pred: number; // learner's guess
  predT: number; // frame the learner guesses it
  p: number; // learner's probability on the actual byte
  ce: number; // -log2 p
};

export type Update = {
  k: number;
  at: number; // frame the update happens (after the learner's last guess)
  loss: number;
  theta: [number, number]; // learner parameters after this update (2-D sketch)
  kind: 'frontier' | 'mastered' | 'noise';
  reward: number;
  frontier: number; // teacher policy center after this update (0..1)
};

export type Round = {
  k: number;
  start: number;
  end: number;
  cells: Cell[];
  prog: string;
  steps: Step[];
  emitStep: number[]; // index in steps of each emitted byte
  mode: 'duel' | 'stream';
};

// The opening plinks are left to the title card; the duel starts at the first full phrase (~0:15).
const DUEL_ROUNDS = cues.rounds.slice(2);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ce = (p: number) => Math.min(8, -Math.log2(p));

// Learner skill over the song: grows slowly through the duel, quickly once training speeds up.
const DUEL_END = fr(cues.fastFrom);
export const skillAt = (f: number) =>
  f < DUEL_END ? 0.08 + 0.5 * clamp01(f / DUEL_END) ** 1.4 : 0.58 + 0.38 * (1 - Math.exp(-(f - DUEL_END) / (FPS * 14)));

const confidence = (seed: string, right: boolean, skill: number, pos: number) => {
  const ctx = Math.min(1, 0.45 + pos * 0.12); // later positions have more context
  const jitter = 0.85 + 0.3 * random(seed);
  return right ? clamp01((0.02 + 0.93 * skill * ctx) * jitter) || 0.01 : 0.004 + 0.03 * random(seed + 'w');
};

const buildRounds = () => {
  const rounds: Round[] = [];
  DUEL_ROUNDS.forEach((r, k) => {
    const actT = r.teach.map((n) => fr(n.t));
    const lastEcho = r.echo.length ? fr(r.echo[r.echo.length - 1].t) : actT[actT.length - 1] + 20;
    // Each teacher note gets the echo note aligned to it; unmatched notes get an in-between guess.
    const matched: (number | null)[] = r.teach.map(() => null);
    for (const [a, b] of r.align) if (a !== null && b !== null) matched[a] = b;
    const cells: Cell[] = r.teach.map((n, j) => {
      const b = matched[j];
      let predT: number;
      let pred: number;
      if (b !== null) {
        predT = fr(r.echo[b].t);
        pred = r.echo[b].p;
      } else {
        const prev = matched.slice(0, j).reverse().find((x) => x !== null);
        predT = prev !== undefined && prev !== null ? fr(r.echo[prev].t) + 4 : fr(r.echo[0]?.t ?? n.t + 1);
        pred = n.p + (random(`d${k}-${j}`) < 0.5 ? 1 : -2);
      }
      const p = confidence(`c${k}-${j}`, pred === n.p, skillAt(predT), j);
      return {actual: n.p, actT: actT[j], pred, predT: Math.min(predT, lastEcho), p, ce: ce(p)};
    });
    const prog = programFor(r.teach.map((n) => n.p));
    const {steps, out} = run(prog);
    if (out.join() !== r.teach.map((n) => n.p).join()) throw new Error(`program ${k} does not print its phrase`);
    rounds.push({k, start: actT[0] - 12, end: 0, cells, prog, steps, emitStep: steps.flatMap((s, i) => (s.emit !== null ? [i] : [])), mode: 'duel'});
  });
  // Fast section: one continuous stream; one byte per note.
  const fast = cues.fast.filter((n) => n.t < cues.exit);
  const cells: Cell[] = fast.map((n, j) => {
    const f = fr(n.t);
    const right = random(`fr${j}`) < 0.8 + 0.18 * clamp01((f - CUE.fastFrom) / (CUE.exit - CUE.fastFrom));
    const pred = right ? n.p : n.p + (random(`fd${j}`) < 0.5 ? 2 : -1);
    const p = confidence(`fc${j}`, right, skillAt(f), 6);
    return {actual: n.p, actT: f, pred, predT: f, p, ce: ce(p)};
  });
  const prog = programFor(fast.map((n) => n.p));
  const {steps} = run(prog, 8, 100000);
  rounds.push({k: rounds.length, start: CUE.fastFrom - 6, end: CUE.exit, cells, prog, steps, emitStep: steps.flatMap((s, i) => (s.emit !== null ? [i] : [])), mode: 'stream'});
  rounds.forEach((r, i) => (r.end = i + 1 < rounds.length ? rounds[i + 1].start : CUE.exit));
  return rounds;
};

export const ROUNDS = buildRounds();
export const STREAM = ROUNDS[ROUNDS.length - 1];

export const roundAt = (frame: number) => {
  let idx = 0;
  for (let i = 0; i < ROUNDS.length; i++) if (ROUNDS[i].start <= frame) idx = i;
  return idx;
};

// ---------- updates: one per duel exchange, then faster and faster in the stream ----------
const buildUpdates = () => {
  const groups: Cell[][] = ROUNDS.slice(0, -1).map((r) => r.cells);
  // In the stream, notes per update shrink from 12 to 1 as the music accelerates.
  const accelEnd = fr(cues.accelEnd);
  for (let j = 0; j < STREAM.cells.length; ) {
    const f = STREAM.cells[j].actT;
    const npr = Math.max(1, Math.round(12 - 11 * clamp01((f - CUE.fastFrom) / (accelEnd - CUE.fastFrom))));
    groups.push(STREAM.cells.slice(j, j + npr));
    j += npr;
  }
  const ups: Update[] = [];
  let theta: [number, number] = [0, 0];
  let heading = -0.6;
  groups.forEach((g, k) => {
    const at = Math.max(...g.map((c) => c.predT)) + 2;
    const loss = 0.5 + 6.8 * (1 - skillAt(at)) + (random(`l${k}`) - 0.5) * 0.5 * (1 - skillAt(at));
    heading += (random(`h${k}`) - 0.5) * 0.9 + 0.25 * Math.sin(k / 5);
    const stepLen = 0.6 + 0.4 * random(`s${k}`);
    theta = [theta[0] + stepLen * Math.cos(heading), theta[1] + stepLen * Math.sin(heading)];
    const u = random(`kind${k}`);
    const early = k < 6;
    // The generator proposes frontier programs more often as RL takes hold.
    const off = 0.55 - 0.4 * clamp01(at / CUE.exit);
    const kind = early ? (u < 0.5 ? 'noise' : 'frontier') : u < off / 2 ? 'noise' : u < off ? 'mastered' : 'frontier';
    const reward = kind === 'frontier' ? 0.6 + 0.4 * random(`r${k}`) : 0.05 + 0.1 * random(`r${k}`);
    const frontier = 0.1 + 0.85 * clamp01(at / CUE.exit);
    ups.push({k, at, loss, theta, kind, reward, frontier});
  });
  return ups;
};

export const UPDATES = buildUpdates();

export const updatesBefore = (frame: number) => {
  let n = 0;
  while (n < UPDATES.length && UPDATES[n].at <= frame) n++;
  return n;
};

// ---------- note onsets per player, for flashing the networks ----------
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
export const TEACHER_NOTES = sorted([...DUEL_ROUNDS.flatMap((r) => r.teach.map((n) => n.t)), ...cues.fast.filter((n) => n.t < cues.exit).map((n) => n.t)].map(fr));
export const LEARNER_NOTES = sorted([...DUEL_ROUNDS.flatMap((r) => r.echo.map((n) => n.t)), ...cues.fast.map((n) => n.t)].map(fr));

export const lastBefore = (notes: number[], frame: number) => {
  let best = -Infinity;
  for (const n of notes) {
    if (n > frame) break;
    best = n;
  }
  return best;
};

// Notes after the glass dissolves drive the downstream predictions.
export const LATE_NOTES = cues.fast.map((n) => fr(n.t));
