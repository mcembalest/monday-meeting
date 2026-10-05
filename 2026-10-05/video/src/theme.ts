import {loadFont as loadSans} from '@remotion/google-fonts/Inter';

// One typeface everywhere: Inter, with tabular figures so hex columns line up.
export const sans = loadSans().fontFamily;
export const mono = sans;

export const C = {
  bg: '#0d0c0a',
  card: '#15140f',
  ink: '#efe9dc',
  dim: '#8a8478',
  faint: '#2a2823',
  teacher: '#7fa8f0',
  learner: '#e0aa4f',
  ok: '#6fcf7f',
  miss: '#e2675e',
};

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
