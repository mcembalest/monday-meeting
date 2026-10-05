// A minimal Brainf*ck machine: builds a program that prints given bytes, and traces its execution.

export const programFor = (bytes: number[]) => {
  const b0 = bytes[0];
  const adj = b0 - 60;
  let p = '++++++[>++++++++++<-]>' + (adj >= 0 ? '+'.repeat(adj) : '-'.repeat(-adj)) + '.';
  for (let i = 1; i < bytes.length; i++) {
    const d = bytes[i] - bytes[i - 1];
    p += (d >= 0 ? '+'.repeat(d) : '-'.repeat(-d)) + '.';
  }
  return p;
};

export type Step = {pc: number; head: number; tape: number[]; emit: number | null};

export const run = (prog: string, cells = 8, maxSteps = 5000) => {
  const tape = Array(cells).fill(0);
  const steps: Step[] = [];
  const out: number[] = [];
  let head = 0;
  for (let pc = 0, n = 0; pc < prog.length && n < maxSteps; pc++, n++) {
    const c = prog[pc];
    let emit: number | null = null;
    if (c === '+') tape[head] = (tape[head] + 1) % 256;
    else if (c === '-') tape[head] = (tape[head] + 255) % 256;
    else if (c === '>') head = (head + 1) % cells;
    else if (c === '<') head = (head + cells - 1) % cells;
    else if (c === '.') out.push((emit = tape[head]));
    else if (c === '[' && tape[head] === 0) {
      for (let depth = 1; depth > 0; ) depth += prog[++pc] === '[' ? 1 : prog[pc] === ']' ? -1 : 0;
    } else if (c === ']' && tape[head] !== 0) {
      for (let depth = 1; depth > 0; ) depth += prog[--pc] === ']' ? 1 : prog[pc] === '[' ? -1 : 0;
    }
    steps.push({pc, head, tape: [...tape], emit});
  }
  return {steps, out};
};
