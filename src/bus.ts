import Channel from '@evgkch/chanjs';

// Shared UI types. They live here so that the panel and main depend on the
// bus, not on each other.
export type Mode = 'fp' | 'fp2';
export type StepMode = 'coef' | 'add' | 'mul' | 'T' | 'iter';
export type PhaseMode = 'arc' | 'fade';
export type Layout = 'geom' | 'log';
export type CoefForm = 'cart' | 'exp';

// One channel carries every user intent from the panel to main. The panel
// only sends (tx), main only subscribes (rx).
type UiEvents = {
  ':mode': [mode: Mode];
  ':coef': [key: string, value: number];
  ':p-raw': [value: number];
  ':p-step': [delta: number];
  ':anim': [key: string];
  ':form': [form: CoefForm];
  ':ns-step': [delta: number];
  ':g-step': [delta: number];
  ':exp': [key: string, k: number];
  ':exp-zero': [key: string];
  ':step-mode': [mode: StepMode];
  ':phase-mode': [mode: PhaseMode];
  ':layout': [layout: Layout];
  ':tset': [key: 'a' | 'b' | 'c' | 'd', value: number];
  ':play': [];
  ':step': [delta: number];
  ':speed': [value: number];
  ':view': [key: 'showPoints' | 'showExt', value: boolean];
  ':preset': [coefs: Record<string, number>];
  ':exposure': [value: number];
  ':zoom-reset': [];
};

export const ui = new Channel<UiEvents>();
