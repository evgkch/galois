import './style.css';
import {
  mod,
  modInverse,
  mobius,
  nearestPrime,
  nextPrime,
  prevPrime,
  nonResidue,
  invTable,
  isNonResidue,
  primeFactors,
  primitiveRoot,
  powMod,
  isGenerator,
  f2add,
  f2mul,
  f2sub,
  f2inv,
  f2isZero,
  f2pow,
  type F2,
} from './field';
import { createProgram } from './webgl';
import { ControlPanel, FP_KEYS, FP2_KEYS } from './panel';
import { ui, type Mode, type StepMode, type PhaseMode, type Frame } from './bus';
import { MapFormula } from './formula';

type FpKey = (typeof FP_KEYS)[number];
type Fp2Key = (typeof FP2_KEYS)[number];
type FpSet = Record<FpKey, number>;
type Fp2Set = Record<Fp2Key, number>;

const P_MAX = 20011;
const P2_MIN = 3; // characteristic 2 has no quadratic non-residue
const P2_MAX = 499; // ~12 ms of arithmetic per animated frame; beyond that GPU fill rate dominates
const TAU = 2 * Math.PI;

const state = {
  mode: 'fp' as Mode,
  p: 257,
  fp: { a: 2, b: 0, c: 0, d: 1 } as FpSet,
  p2: 257,
  fp2: { a0: 2, a1: 0, b0: 0, b1: 0, c0: 0, c1: 0, d0: 1, d1: 0 } as Fp2Set,
  animFp: 'a' as FpKey,
  animFp2: 'a0' as Fp2Key,
  animFp2Exp: 'a' as 'a' | 'b' | 'c' | 'd',
  coefForm: 'cart' as 'cart' | 'exp',
  stepMode: 'coef' as StepMode,
  phaseMode: 'arc' as PhaseMode,
  T: { a: 1, b: 1, c: 0, d: 1 },
  playing: false,
  speed: 0.5,
  showChords: true, // off: only the optics overlays remain, for comparison
  showPoints: true,
  showExt: true,
  showIn: true, // the optics scene: the light before the mirror
  showSrc: false, // the optics scene: what lights the mirror so that the reflections are the chords
  frame: 'value' as Frame,
  zoom: 1,
  exposure: 1,
  // Wave field of the sources (Huygens sum over the mirror elements);
  // `wave` is the wavelength in units of the circle radius.
  waveOn: false,
  wave: 0.05,
  rays: 2048, // mirror points of the optics scene's ray picture
};

const WAVE_MIN = 0.0001;
const WAVE_MAX = 3;

// The wave field's colour: the slider's range of λ, logarithmic, is laid
// onto the visible spectrum, 380 nm at WAVE_MIN to 750 nm at WAVE_MAX,
// and the spectral colour is scaled so that its brightest channel is 1.
function waveTint(wave: number): [number, number, number] {
  const t = (Math.log10(wave) - Math.log10(WAVE_MIN)) / (Math.log10(WAVE_MAX) - Math.log10(WAVE_MIN));
  const nm = 380 + 370 * Math.min(1, Math.max(0, t));
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = (0.7 * (440 - nm)) / 60; // violet, not magenta
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = (510 - nm) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = (645 - nm) / 65;
  } else r = 1;
  const gamma = (v: number) => Math.pow(v, 0.8);
  const c: [number, number, number] = [gamma(r), gamma(g), gamma(b)];
  const mx = Math.max(c[0], c[1], c[2]);
  return [c[0] / mx, c[1] / mx, c[2] / mx];
}
const HUY_MAX = 16384; // elements the field shader sums per pixel

let ns = nonResidue(state.p2); // i² in the current F_{p²}
let invTab = invTable(state.p2); // inverse table of F_p for the torus hot loop
let rootP = primitiveRoot(state.p); // generator of F*_p for the ×g walk

// Continuous animation position: in 'coef' step mode the integer part is the
// armed coefficient's value (or exponent), in the group-walk modes it is a
// step counter; the fractional part is the phase of the transition.
let animValue = state.fp.a;
let walkInt = 0; // integer position of the group walk
let dirty = true;

// The scene redraws only after an invalidation. A paused static frame costs
// nothing: no draw, and the browser keeps the glass panel's cached blur.
let needsDraw = true;

function invalidate() {
  needsDraw = true;
}

let queryNs: number | null = null; // ?ns= from the URL, validated at startup
let queryG: F2 | null = null; // ?g=u,v — validated as a generator at startup
let queryArm: string | null = null; // ?arm= — validated per mode and form

// The URL mirrors the panel: every setting that differs from its default is
// written back (throttled — Safari rate-limits replaceState), so the current
// address is always a shareable link to the current picture.
let urlTimer: number | undefined;

function updateUrl() {
  if (urlTimer !== undefined) return;
  urlTimer = window.setTimeout(() => {
    urlTimer = undefined;
    const q = new URLSearchParams();
    if (state.mode === 'fp2') q.set('mode', 'fp2');
    if (curP() !== 257) q.set('p', String(curP()));
    if (state.mode === 'fp') {
      const def: FpSet = { a: 2, b: 0, c: 0, d: 1 };
      for (const k of FP_KEYS) if (state.fp[k] !== def[k]) q.set(k, String(state.fp[k]));
    } else {
      const def: Fp2Set = { a0: 2, a1: 0, b0: 0, b1: 0, c0: 0, c1: 0, d0: 1, d1: 0 };
      for (const k of FP2_KEYS) if (state.fp2[k] !== def[k]) q.set(k, String(state.fp2[k]));
      if (state.coefForm === 'exp') q.set('form', 'exp');
      if (ns !== nonResidue(state.p2)) q.set('ns', String(ns));
      if (!genIsDefault) q.set('g', `${gen[0]},${gen[1]}`);
    }
    if (state.stepMode !== 'coef') q.set('step', state.stepMode);
    const t = state.T;
    if (!(t.a === 1 && t.b === 1 && t.c === 0 && t.d === 1)) {
      q.set('t', `${t.a},${t.b},${t.c},${t.d}`);
    }
    if (state.phaseMode === 'fade') q.set('phase', 'fade');
    if (state.frame === 'eigen') q.set('frame', 'eigen');
    const armDef = state.mode === 'fp' || state.coefForm === 'exp' ? 'a' : 'a0';
    if (state.stepMode === 'coef' && curAnimKey() !== armDef) q.set('arm', curAnimKey());
    if (!state.showChords) q.set('chords', '0');
    if (!state.showPoints) q.set('points', '0');
    if (!state.showExt) q.set('ext', '0');
    if (!state.showIn) q.set('in', '0');
    if (state.showSrc) {
      q.set('src', '1');
      if (state.waveOn) q.set('wave', String(state.wave));
      if (state.rays !== 2048) q.set('rays', String(state.rays));
    }
    if (state.exposure !== 1) q.set('glow', String(state.exposure));
    if (state.zoom !== 1) q.set('zoom', state.zoom.toFixed(2));
    if (state.playing) q.set('play', '1');
    if (state.speed !== 0.5) q.set('speed', String(state.speed));
    const qs = q.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }, 250);
}

function curP(): number {
  return state.mode === 'fp' ? state.p : state.p2;
}

function curCoefs(): Record<string, number> {
  return state.mode === 'fp' ? state.fp : state.fp2;
}

function curAnimKey(): string {
  if (state.mode === 'fp') return state.animFp;
  return state.coefForm === 'exp' ? state.animFp2Exp : state.animFp2;
}

// ---------- field construction choices for F_{p²} ----------
// The picture formally depends on them: the non-residue ns fixes the basis
// {1, i} and with it the torus coordinates; the generator g fixes the
// exponential form gᵏ and the ×g steps.

let nsFactors = primeFactors(state.p2 * state.p2 - 1);

function firstGenerator(): F2 {
  const p = state.p2;
  for (let u = 0; u < p; u++) {
    for (let v = 0; v < p; v++) {
      const g: F2 = [u, v];
      if (isGenerator(g, ns, p, nsFactors)) return g;
    }
  }
  return [1, 0]; // unreachable: F*_{p²} is cyclic for every prime p
}

// Discrete-log table over the chosen generator: dlogTab[u·p+v] = k+1 for
// gᵏ = u + v·i, and 0 for the zero element.
function buildDlog(): Int32Array {
  const p = state.p2;
  const t = new Int32Array(p * p);
  const m = p * p - 1;
  let a0 = 1;
  let a1 = 0;
  for (let k = 0; k < m; k++) {
    t[a0 * p + a1] = k + 1;
    const n0 = (a0 * gen[0] + ns * a1 * gen[1]) % p;
    const n1 = (a0 * gen[1] + a1 * gen[0]) % p;
    a0 = n0;
    a1 = n1;
  }
  return t;
}

let gen: F2 = firstGenerator();
let genIsDefault = true; // the URL carries g only when the user changed it
let dlogTab = buildDlog();

function dlogOf(u: number, v: number): number | null {
  const t = dlogTab[u * state.p2 + v];
  return t === 0 ? null : t - 1;
}

function stepGenerator(delta: number) {
  const p = state.p2;
  const total = p * p;
  let idx = gen[0] * p + gen[1];
  for (let i = 0; i < total; i++) {
    idx = (idx + delta + total) % total;
    const g: F2 = [Math.floor(idx / p), idx % p];
    if (isGenerator(g, ns, p, nsFactors)) {
      gen = g;
      genIsDefault = false;
      dlogTab = buildDlog();
      return;
    }
  }
}

function stepNs(delta: number) {
  const p = state.p2;
  const span = p - 2; // candidates 2 … p−1
  let n = ns;
  for (let i = 0; i < span; i++) {
    n = ((n - 2 + delta + span) % span) + 2;
    if (isNonResidue(n, p)) {
      ns = n;
      gen = firstGenerator();
      genIsDefault = true;
      dlogTab = buildDlog();
      return;
    }
  }
}

// ---------- group-walk steps ----------
// Walk modes replace the map M by S·M each step. S is invertible, so the
// walk never leaves PGL(2, F_q) — unlike +1 on a raw coefficient, which can
// pass through det ≡ 0.

type StepInfo = { valid: boolean; type: string; ord: number | null };

let stepInfo: StepInfo = { valid: true, type: '', ord: null };

// The base map for the iteration mode: a snapshot of the coefficients at
// the moment iteration starts or the map is edited; the screen shows Mⁿ.
let baseFp: FpSet = { ...state.fp };
let baseFp2: Fp2Set = { ...state.fp2 };

// Step matrix over F_p (scalars). fp2 walk matrices use the same entries
// embedded into the prime subfield, except ×g and iteration.
function stepMatFp(): [number, number, number, number] | null {
  const p = curP();
  if (state.stepMode === 'add') return [1, 1, 0, 1];
  if (state.stepMode === 'mul') return [rootP, 0, 0, 1];
  const src = state.stepMode === 'iter' ? baseFp : state.T;
  const { a, b, c, d } = src;
  const det = mod(a * d - b * c, p);
  if (det === 0) return null;
  return [mod(a, p), mod(b, p), mod(c, p), mod(d, p)];
}

function stepMatFp2(): [F2, F2, F2, F2] | null {
  if (state.stepMode === 'mul') return [gen, [0, 0], [0, 0], [1, 0]];
  if (state.stepMode === 'iter') {
    const p = state.p2;
    const A: F2 = [baseFp2.a0, baseFp2.a1];
    const B: F2 = [baseFp2.b0, baseFp2.b1];
    const C: F2 = [baseFp2.c0, baseFp2.c1];
    const D: F2 = [baseFp2.d0, baseFp2.d1];
    const det = f2sub(f2mul(A, D, ns, p), f2mul(B, C, ns, p), p);
    if (f2isZero(det)) return null;
    return [A, B, C, D];
  }
  const m = stepMatFp();
  if (m === null) return null;
  return [[m[0], 0], [m[1], 0], [m[2], 0], [m[3], 0]];
}

// M ← S·M (dir > 0) or S⁻¹·M (dir < 0); matrix product = Möbius composition.
function applyStep(dir: number) {
  if (state.mode === 'fp') {
    let m = stepMatFp();
    if (m === null) return;
    const p = state.p;
    if (dir < 0) {
      const inv = modInverse(mod(m[0] * m[3] - m[1] * m[2], p), p)!;
      m = [mod(m[3] * inv, p), mod(-m[1] * inv, p), mod(-m[2] * inv, p), mod(m[0] * inv, p)];
    }
    const { a, b, c, d } = state.fp;
    state.fp.a = mod(m[0] * a + m[1] * c, p);
    state.fp.b = mod(m[0] * b + m[1] * d, p);
    state.fp.c = mod(m[2] * a + m[3] * c, p);
    state.fp.d = mod(m[2] * b + m[3] * d, p);
    return;
  }
  let m = stepMatFp2();
  if (m === null) return;
  const p = state.p2;
  if (dir < 0) {
    const det = f2sub(f2mul(m[0], m[3], ns, p), f2mul(m[1], m[2], ns, p), p);
    const inv = f2inv(det, ns, p)!;
    const neg = (u: F2): F2 => [mod(-u[0], p), mod(-u[1], p)];
    m = [f2mul(m[3], inv, ns, p), f2mul(neg(m[1]), inv, ns, p), f2mul(neg(m[2]), inv, ns, p), f2mul(m[0], inv, ns, p)];
  }
  const cf = state.fp2;
  const A: F2 = [cf.a0, cf.a1];
  const B: F2 = [cf.b0, cf.b1];
  const C: F2 = [cf.c0, cf.c1];
  const D: F2 = [cf.d0, cf.d1];
  const na = f2add(f2mul(m[0], A, ns, p), f2mul(m[1], C, ns, p), p);
  const nb = f2add(f2mul(m[0], B, ns, p), f2mul(m[1], D, ns, p), p);
  const nc = f2add(f2mul(m[2], A, ns, p), f2mul(m[3], C, ns, p), p);
  const nd = f2add(f2mul(m[2], B, ns, p), f2mul(m[3], D, ns, p), p);
  cf.a0 = na[0]; cf.a1 = na[1];
  cf.b0 = nb[0]; cf.b1 = nb[1];
  cf.c0 = nc[0]; cf.c1 = nc[1];
  cf.d0 = nd[0]; cf.d1 = nd[1];
}

// Δ = tr² − 4·det classifies S: square — hyperbolic (two fixed points on the
// line), zero — parabolic (one), non-square — elliptic (fixed points live in
// the quadratic extension). The projective order bounds the loop: element
// orders in PGL(2, q) divide p, q−1 or q+1.
function computeStepInfo(): StepInfo {
  if (state.stepMode === 'coef') return { valid: true, type: '', ord: null };
  if (state.mode === 'fp') return stepInfoFp();
  return stepInfoFp2();
}

function stepInfoFp(): StepInfo {
  const m = stepMatFp();
  if (m === null) return { valid: false, type: 'det ≡ 0', ord: null };
  const p = state.p;
  const [a, b, c, d] = m;
  const tr = mod(a + d, p);
  const det = mod(a * d - b * c, p);
  const delta = mod(tr * tr - 4 * det, p);
  const type =
    delta === 0 ? 'parabolic' : powMod(delta, (p - 1) / 2, p) === 1 ? 'hyperbolic' : 'elliptic';
  let x = [a, b, c, d];
  let ord: number | null = null;
  const bound = p + 2;
  for (let k = 1; k <= bound; k++) {
    // at the top of iteration k, x = S^k; projective identity: b = c = 0, a = d
    if (x[1] === 0 && x[2] === 0 && x[0] === x[3]) {
      ord = k;
      break;
    }
    x = [
      mod(a * x[0] + b * x[2], p),
      mod(a * x[1] + b * x[3], p),
      mod(c * x[0] + d * x[2], p),
      mod(c * x[1] + d * x[3], p),
    ];
  }
  return { valid: true, type, ord };
}

function stepInfoFp2(): StepInfo {
  const m = stepMatFp2();
  if (m === null) return { valid: false, type: 'det ≡ 0', ord: null };
  const p = state.p2;
  const q1 = p * p - 1;
  const [A, B, C, D] = m;
  const tr = f2add(A, D, p);
  const det = f2sub(f2mul(A, D, ns, p), f2mul(B, C, ns, p), p);
  const delta = f2sub(f2mul(tr, tr, ns, p), f2mul([4 % p, 0], det, ns, p), p);
  let type: string;
  if (f2isZero(delta)) type = 'parabolic';
  else {
    const e = f2pow(delta, q1 / 2, ns, p);
    type = e[0] === 1 && e[1] === 0 ? 'hyperbolic' : 'elliptic';
  }
  // brute-force projective order with inlined pair arithmetic
  const a0 = A[0], a1 = A[1], b0 = B[0], b1 = B[1];
  const c0 = C[0], c1 = C[1], d0 = D[0], d1 = D[1];
  let xa0 = a0, xa1 = a1, xb0 = b0, xb1 = b1;
  let xc0 = c0, xc1 = c1, xd0 = d0, xd1 = d1;
  let ord: number | null = null;
  const bound = p * p + 2;
  const mul0 = (u0: number, u1: number, v0: number, v1: number) => (u0 * v0 + ns * u1 * v1) % p;
  const mul1 = (u0: number, u1: number, v0: number, v1: number) => (u0 * v1 + u1 * v0) % p;
  for (let k = 1; k <= bound; k++) {
    if (xb0 === 0 && xb1 === 0 && xc0 === 0 && xc1 === 0 && xa0 === xd0 && xa1 === xd1) {
      ord = k;
      break;
    }
    const na0 = (mul0(a0, a1, xa0, xa1) + mul0(b0, b1, xc0, xc1)) % p;
    const na1 = (mul1(a0, a1, xa0, xa1) + mul1(b0, b1, xc0, xc1)) % p;
    const nb0 = (mul0(a0, a1, xb0, xb1) + mul0(b0, b1, xd0, xd1)) % p;
    const nb1 = (mul1(a0, a1, xb0, xb1) + mul1(b0, b1, xd0, xd1)) % p;
    const nc0 = (mul0(c0, c1, xa0, xa1) + mul0(d0, d1, xc0, xc1)) % p;
    const nc1 = (mul1(c0, c1, xa0, xa1) + mul1(d0, d1, xc0, xc1)) % p;
    const nd0 = (mul0(c0, c1, xb0, xb1) + mul0(d0, d1, xd0, xd1)) % p;
    const nd1 = (mul1(c0, c1, xb0, xb1) + mul1(d0, d1, xd0, xd1)) % p;
    xa0 = na0; xa1 = na1; xb0 = nb0; xb1 = nb1;
    xc0 = nc0; xc1 = nc1; xd0 = nd0; xd1 = nd1;
  }
  return { valid: true, type, ord };
}

function resetWalk() {
  if (state.stepMode === 'iter') {
    baseFp = { ...state.fp };
    baseFp2 = { ...state.fp2 };
  }
  stepInfo = computeStepInfo();
  walkInt = 0;
  if (state.stepMode === 'coef') animValue = armedValue();
  else animValue = 0;
}

// ---------- components ----------

const panel = document.querySelector('control-panel') as ControlPanel;
const formula = document.querySelector('map-formula') as MapFormula;
const canvas = document.querySelector<HTMLCanvasElement>('#glcanvas')!;

function syncPanel() {
  panel.mode = state.mode;
  panel.p = curP();
  panel.pMax = state.mode === 'fp' ? P_MAX : P2_MAX;
  panel.coefs = { ...curCoefs() };
  panel.animKey = curAnimKey();
  panel.animValue = animValue;
  panel.playing = state.playing;
  panel.speed = state.speed;
  panel.showChords = state.showChords;
  panel.showPoints = state.showPoints;
  panel.showExt = state.showExt;
  panel.showIn = state.showIn;
  panel.showSrc = state.showSrc;
  panel.sceneOk = sceneOk();
  panel.frame = state.frame;
  panel.frameNote = frameNote;
  panel.srcNote = srcNote;
  panel.zoom = state.zoom;
  panel.exposure = state.exposure;
  panel.waveOn = state.waveOn;
  panel.wave = state.wave;
  panel.i2 = state.mode === 'fp2' ? ns : 0;
  panel.coefForm = state.mode === 'fp2' ? state.coefForm : 'cart';
  panel.gDisp = state.mode === 'fp' ? String(rootP) : fmtF2(gen);
  panel.expMax = state.p2 * state.p2 - 2;
  panel.stepMode = state.stepMode;
  panel.phaseMode = state.phaseMode;
  panel.T = { ...state.T };
  panel.tInfo = stepText();
  panel.tWarn = !stepInfo.valid;
  if (state.mode === 'fp2' && state.coefForm === 'exp') {
    const c = state.fp2;
    panel.exps = {
      a: dlogOf(c.a0, c.a1),
      b: dlogOf(c.b0, c.b1),
      c: dlogOf(c.c0, c.c1),
      d: dlogOf(c.d0, c.d1),
    };
  } else {
    panel.exps = {};
  }
  syncStatus();
  formula.mode = state.mode;
  updateUrl();
}

function stepText(): string {
  if (state.stepMode === 'coef') return '';
  const name = state.stepMode === 'iter' ? 'M' : 'S';
  if (!stepInfo.valid) return `det ${state.stepMode === 'iter' ? 'M' : 'T'} ≡ 0 — not invertible`;
  const ord = stepInfo.ord === null ? '' : ` · ord ${stepInfo.ord}`;
  return `${name}: ${stepInfo.type}${ord}`;
}

function fmtF2(u: F2): string {
  if (u[1] === 0) return String(u[0]);
  const it = u[1] === 1 ? 'i' : `${u[1]}i`;
  return u[0] === 0 ? it : `${u[0]}+${it}`;
}

function syncStatus() {
  if (state.mode === 'fp') {
    const { a, b, c, d } = state.fp;
    const det = mod(a * d - b * c, state.p);
    panel.detText = `det ≡ ${det} (mod ${state.p})${det === 0 ? ' — degenerate map' : ''}`;
    panel.detWarn = det === 0;
    panel.pole = poleTextFp();
  } else {
    const { a0, a1, b0, b1, c0, c1, d0, d1 } = state.fp2;
    const p = state.p2;
    const det = f2sub(
      f2mul([a0, a1], [d0, d1], ns, p),
      f2mul([b0, b1], [c0, c1], ns, p),
      p,
    );
    const zero = f2isZero(det);
    panel.detText = `det ≡ ${fmtF2(det)} (mod ${p})${zero ? ' — degenerate map' : ''}`;
    panel.detWarn = zero;
    panel.pole = poleTextFp2();
  }
}

// The pole of the map: the point where the denominator vanishes. Its image
// is the point at infinity, so its chord is not drawn.
function poleTextFp(): string {
  const { p } = state;
  const { c, d } = state.fp;
  if (c === 0) return d === 0 ? 'denominator ≡ 0 everywhere' : '';
  const x0 = mod(-d * modInverse(c, p)!, p);
  return `pole: x = ${x0} ↦ ∞`;
}

function poleTextFp2(): string {
  const p = state.p2;
  const C: F2 = [state.fp2.c0, state.fp2.c1];
  const D: F2 = [state.fp2.d0, state.fp2.d1];
  if (f2isZero(C)) return f2isZero(D) ? 'denominator ≡ 0 everywhere' : '';
  const cinv = f2inv(C, ns, p)!;
  const z0 = f2mul([mod(-D[0], p), mod(-D[1], p)], cinv, ns, p);
  return `pole: z = ${fmtF2(z0)} ↦ ∞`;
}

// the optics scene exists for F_p only: it is put away on the way to F_p²
// and brought back on the way home
let sceneSaved: { showSrc: boolean; waveOn: boolean } | null = null;

ui.rx.on(':mode', (m) => {
  if (m === state.mode) return;
  state.mode = m;
  if (zoomByFit) setZoom(1);
  if (m === 'fp2') {
    sceneSaved = { showSrc: state.showSrc, waveOn: state.waveOn };
    state.showSrc = false;
    state.waveOn = false;
    state.frame = 'value';
  } else if (sceneSaved) {
    state.showSrc = sceneSaved.showSrc;
    state.waveOn = sceneSaved.waveOn;
    sceneSaved = null;
    srcFit = state.showSrc;
  }
  canvas.style.cursor = m === 'fp2' ? 'grab' : 'default';
  reallocBuffers();
  rebuildPoints();
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':coef', (key, value) => {
  srcFit = state.showSrc;
  const pp = curP();
  curCoefs()[key] = Number.isFinite(value) ? (((Math.round(value) % pp) + pp) % pp) : 0;
  if (state.stepMode === 'coef' && key === curAnimKey()) animValue = value;
  if (state.stepMode === 'iter') resetWalk(); // an edited map restarts its iteration
  dirty = true;
  syncPanel();
});

ui.rx.on(':p-raw', (value) => {
  const lo = state.mode === 'fp' ? 2 : P2_MIN;
  const hi = state.mode === 'fp' ? P_MAX : P2_MAX;
  let p = nearestPrime(Math.min(hi, Math.max(lo, Math.round(value || lo))));
  if (p < lo) p = nextPrime(lo - 1);
  panel.pNote = p === value ? '' : `snapped to prime ${p}`;
  applyP(p);
  panel.requestUpdate(); // live() resets the input even when p is unchanged
});

ui.rx.on(':p-step', (delta) => {
  const p = delta < 0 ? prevPrime(curP()) : nextPrime(curP());
  const lo = state.mode === 'fp' ? 2 : P2_MIN;
  const hi = state.mode === 'fp' ? P_MAX : P2_MAX;
  if (p < lo || p > hi) return;
  panel.pNote = '';
  applyP(p);
});

ui.rx.on(':anim', (key) => {
  if (state.mode === 'fp') state.animFp = key as FpKey;
  else if (state.coefForm === 'exp') state.animFp2Exp = key as 'a' | 'b' | 'c' | 'd';
  else state.animFp2 = key as Fp2Key;
  if (state.stepMode === 'coef') animValue = armedValue();
  dirty = true;
  syncPanel();
});

ui.rx.on(':form', (form) => {
  state.coefForm = form;
  if (state.stepMode === 'coef') animValue = armedValue();
  syncPanel();
});

ui.rx.on(':ns-step', (delta) => {
  stepNs(delta);
  resetWalk();
  dirty = true; // the basis {1, i} and with it the arithmetic changed
  syncPanel();
});

ui.rx.on(':g-step', (delta) => {
  if (state.mode !== 'fp2') return; // in F_p the generator is fixed
  stepGenerator(delta);
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':exp', (key, kRaw) => {
  const m = state.p2 * state.p2 - 1;
  const k = Number.isFinite(kRaw) ? ((Math.round(kRaw) % m) + m) % m : 0;
  const w = f2pow(gen, k, ns, state.p2);
  state.fp2[`${key}0` as Fp2Key] = w[0];
  state.fp2[`${key}1` as Fp2Key] = w[1];
  if (state.stepMode === 'coef' && state.animFp2Exp === key) animValue = k;
  if (state.stepMode === 'iter') resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':exp-zero', (key) => {
  const k0 = `${key}0` as Fp2Key;
  const k1 = `${key}1` as Fp2Key;
  const zero = state.fp2[k0] === 0 && state.fp2[k1] === 0;
  state.fp2[k0] = zero ? 1 : 0; // toggles between 0 and g⁰ = 1
  state.fp2[k1] = 0;
  if (state.stepMode === 'coef') animValue = armedValue();
  if (state.stepMode === 'iter') resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':step-mode', (m) => {
  state.stepMode = m;
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':phase-mode', (m) => {
  state.phaseMode = m;
  dirty = true;
  syncPanel();
});

ui.rx.on(':tset', (key, value) => {
  state.T[key] = mod(Math.round(value) || 0, curP());
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':play', () => togglePlay());

ui.rx.on(':step', (delta) => step(delta));

ui.rx.on(':speed', (value) => {
  state.speed = value;
  syncPanel();
});

ui.rx.on(':view', (key, value) => {
  state[key] = value;
  if (key === 'waveOn' || key === 'showSrc') dirty = true; // computed with the scene
  if (key === 'showSrc' && value) srcFit = true;
  if (key === 'showSrc' && !value && zoomByFit) setZoom(1);
  invalidate();
  syncPanel();
});

ui.rx.on(':preset', (coefs) => {
  Object.assign(curCoefs(), coefs);
  srcFit = state.showSrc;
  if (state.stepMode === 'coef') animValue = armedValue();
  if (state.stepMode === 'iter') resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':exposure', (value) => {
  state.exposure = value;
  invalidate();
  syncPanel();
});

ui.rx.on(':wave-len', (value) => {
  state.wave = Math.min(WAVE_MAX, Math.max(WAVE_MIN, value));
  dirty = true; // the source amplitudes on the mirror depend on k
  invalidate();
  syncPanel();
});

ui.rx.on(':frame', (frame) => {
  state.frame = frame;
  srcFit = state.showSrc;
  dirty = true;
  invalidate();
  syncPanel();
});

ui.rx.on(':reset', () => {
  // the defaults are what a bare address gives; the reload rebuilds every
  // table from them
  location.href = location.pathname;
});

// Wheel and trackpad pinch (Ctrl+wheel) zoom around the scene center;
// double-click resets zoom and, on the torus, the orientation.
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    setZoom(state.zoom * Math.exp(-px * (e.ctrlKey ? 0.008 : 0.0015)));
  },
  { passive: false },
);

canvas.addEventListener('dblclick', () => {
  setZoom(1);
  if (state.mode === 'fp2') resetRot();
  invalidate();
});

// Drag orbits the torus: horizontal movement yaws, vertical pitches.
let dragging = false;
let dragX = 0;
let dragY = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (state.mode !== 'fp2') return;
  dragging = true;
  dragX = e.clientX;
  dragY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  rotateView((e.clientX - dragX) * 0.006, (e.clientY - dragY) * 0.006);
  dragX = e.clientX;
  dragY = e.clientY;
  invalidate();
});

canvas.addEventListener('pointerup', () => {
  dragging = false;
});

canvas.addEventListener('pointercancel', () => {
  dragging = false;
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  // composedPath sees through the panel's shadow DOM; a focused control keeps
  // its own Space behavior.
  const target = e.composedPath()[0];
  if (target instanceof HTMLElement && target.closest('input, button, select, textarea')) return;
  e.preventDefault();
  togglePlay();
});

function togglePlay() {
  state.playing = !state.playing;
  syncPanel();
}

// The armed integer the transport advances in 'coef' step mode.
function armedValue(): number {
  if (state.mode === 'fp') return state.fp[state.animFp];
  if (state.coefForm === 'cart') return state.fp2[state.animFp2];
  const k = state.animFp2Exp;
  return dlogOf(state.fp2[`${k}0` as Fp2Key], state.fp2[`${k}1` as Fp2Key]) ?? 0;
}

function armedIsZero(): boolean {
  if (state.mode !== 'fp2' || state.coefForm !== 'exp') return false;
  const k = state.animFp2Exp;
  return state.fp2[`${k}0` as Fp2Key] === 0 && state.fp2[`${k}1` as Fp2Key] === 0;
}

function wrapLimit(): number {
  if (state.stepMode !== 'coef') return stepInfo.ord ?? 1 << 20;
  if (state.mode === 'fp') return state.p;
  return state.coefForm === 'exp' ? state.p2 * state.p2 - 1 : state.p2;
}

function stepBlocked(): boolean {
  if (state.stepMode === 'coef') return armedIsZero();
  return !stepInfo.valid;
}

function applyArmedInteger(n: number) {
  if (state.mode === 'fp') {
    state.fp[state.animFp] = n;
    return;
  }
  if (state.coefForm === 'cart') {
    state.fp2[state.animFp2] = n;
    return;
  }
  const k = state.animFp2Exp;
  const w = f2pow(gen, n, ns, state.p2);
  state.fp2[`${k}0` as Fp2Key] = w[0];
  state.fp2[`${k}1` as Fp2Key] = w[1];
}

function step(delta: number) {
  if (stepBlocked()) return;
  if (state.stepMode === 'coef') {
    const n = mod(armedValue() + delta, wrapLimit());
    applyArmedInteger(n);
    animValue = n;
  } else {
    applyStep(delta);
    const lim = wrapLimit();
    walkInt = ((walkInt + delta) % lim + lim) % lim;
    animValue = walkInt;
  }
  dirty = true;
  syncPanel();
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

// A zoom set by fitSources() is undone when the scene goes away: on a
// mode switch and when the sources are hidden. A zoom the user set stays.
let zoomByFit = false;

function setZoom(z: number, byFit = false) {
  state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  zoomByFit = byFit;
  invalidate();
  syncPanel();
}

function applyP(p: number) {
  if (state.mode === 'fp') {
    state.p = p;
    rootP = primitiveRoot(p);
    for (const k of FP_KEYS) state.fp[k] = mod(state.fp[k], p);
  } else {
    state.p2 = p;
    ns = nonResidue(p);
    invTab = invTable(p);
    nsFactors = primeFactors(p * p - 1);
    gen = firstGenerator();
    genIsDefault = true;
    dlogTab = buildDlog();
    for (const k of FP2_KEYS) state.fp2[k] = mod(state.fp2[k], p);
  }
  for (const k of ['a', 'b', 'c', 'd'] as const) state.T[k] = mod(state.T[k], p);
  reallocBuffers();
  rebuildPoints();
  resetWalk();
  dirty = true;
  syncPanel();
}

// ---------- WebGL ----------

// WebGL2 lets the scene accumulate in a half-float framebuffer and pass
// through a tone map, so dense charts compress smoothly instead of clipping
// to white. Without WebGL2 or float rendering the scene draws directly and
// the glow slider scales line alpha instead.
const gl2 = canvas.getContext('webgl2', { antialias: true, alpha: false });
const glAny =
  gl2 ?? (canvas.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null);
if (!glAny) throw new Error('WebGL is not available');
const gl: WebGLRenderingContext | WebGL2RenderingContext = glAny;
let post =
  !!gl2 &&
  !!(gl2.getExtension('EXT_color_buffer_float') || gl2.getExtension('EXT_color_buffer_half_float'));

// One 3D pipeline for both modes: flat geometry (z = 0) under the identity
// rotation has a perspective factor of exactly 1.
const VS = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat3 uRot;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform float uDist;
uniform float uPointSize;
varying vec3 vColor;
void main() {
  vec3 v = uRot * aPos;
  float w = (uDist - v.z) / uDist;
  gl_Position = vec4(v.xy * uScale + uOffset * w, 0.0, w);
  gl_PointSize = uPointSize / w;
  vColor = aColor;
}
`;

// uPoint separates points from lines: gl_PointCoord is defined only for points.
const FS = `
precision mediump float;
varying vec3 vColor;
uniform float uAlpha;
uniform float uPoint;
void main() {
  if (uPoint > 0.5) {
    vec2 q = gl_PointCoord - 0.5;
    if (dot(q, q) > 0.25) discard;
  }
  gl_FragColor = vec4(vColor * uAlpha, 1.0);
}
`;

const prog = createProgram(gl, VS, FS);
gl.useProgram(prog);
const locPos = gl.getAttribLocation(prog, 'aPos');
const locColor = gl.getAttribLocation(prog, 'aColor');
const locRot = gl.getUniformLocation(prog, 'uRot');
const locScale = gl.getUniformLocation(prog, 'uScale');
const locOffset = gl.getUniformLocation(prog, 'uOffset');
const locDist = gl.getUniformLocation(prog, 'uDist');
const locAlpha = gl.getUniformLocation(prog, 'uAlpha');
const locSize = gl.getUniformLocation(prog, 'uPointSize');
const locPoint = gl.getUniformLocation(prog, 'uPoint');

// Chord pass: instanced lines. Per-instance attributes carry the chord's
// start, end and color; a per-vertex role template selects which of the six
// chord/extension vertices the shader emits, so extension geometry and the
// static halves of the data never touch the CPU after setup.
const LINE_VS = `
attribute float aRole;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aColorI;
uniform mat3 uRot;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform float uDist;
uniform float uROut;
varying vec3 vColor;

float rayOut(vec3 pnt, vec3 dir) {
  float pu = dot(pnt, dir);
  return -pu + sqrt(max(pu * pu + uROut * uROut - dot(pnt, pnt), 0.0));
}

void main() {
  vec3 d = aEnd - aStart;
  float len = length(d);
  vec3 pos = aStart;
  if (len > 1e-6) {
    vec3 u = d / len;
    if (aRole < 0.5) pos = aStart;
    else if (aRole < 1.5) pos = aEnd;
    else if (aRole < 2.5) pos = aStart;
    else if (aRole < 3.5) pos = aStart - u * rayOut(aStart, -u);
    else if (aRole < 4.5) pos = aEnd;
    else pos = aEnd + u * rayOut(aEnd, u);
  }
  vec3 v = uRot * pos;
  float w = (uDist - v.z) / uDist;
  gl_Position = vec4(v.xy * uScale + uOffset * w, 0.0, w);
  vColor = aColorI;
}
`;

type LineLocs = {
  prog: WebGLProgram;
  role: number;
  start: number;
  end: number;
  colI: number;
  rot: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  offset: WebGLUniformLocation | null;
  dist: WebGLUniformLocation | null;
  rOut: WebGLUniformLocation | null;
  alpha: WebGLUniformLocation | null;
};

function lineLocs(g: WebGLRenderingContext | WebGL2RenderingContext, prog: WebGLProgram): LineLocs {
  return {
    prog,
    role: g.getAttribLocation(prog, 'aRole'),
    start: g.getAttribLocation(prog, 'aStart'),
    end: g.getAttribLocation(prog, 'aEnd'),
    colI: g.getAttribLocation(prog, 'aColorI'),
    rot: g.getUniformLocation(prog, 'uRot'),
    scale: g.getUniformLocation(prog, 'uScale'),
    offset: g.getUniformLocation(prog, 'uOffset'),
    dist: g.getUniformLocation(prog, 'uDist'),
    rOut: g.getUniformLocation(prog, 'uROut'),
    alpha: g.getUniformLocation(prog, 'uAlpha'),
  };
}

const lineL = lineLocs(gl, createProgram(gl, LINE_VS, FS));

const instAngle = gl2 ? null : gl.getExtension('ANGLE_instanced_arrays');
if (!gl2 && !instAngle) throw new Error('instanced rendering is not available');
let nInst = 0;

function setDivisor(loc: number, d: number) {
  if (gl2) gl2.vertexAttribDivisor(loc, d);
  else instAngle!.vertexAttribDivisorANGLE(loc, d);
}

function drawInstanced(first: number, nVerts: number, n = nInst) {
  if (gl2) gl2.drawArraysInstanced(gl.LINES, first, nVerts, n);
  else instAngle!.drawArraysInstancedANGLE(gl.LINES, first, nVerts, n);
}

gl.enableVertexAttribArray(locPos);
gl.enableVertexAttribArray(locColor);
gl.disable(gl.DEPTH_TEST);
// Additive blending: brightness accumulates where chords cross.
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE);
gl.clearColor(0.039, 0.047, 0.063, 1);

// ---------- tone-map pass (WebGL2 + float rendering only) ----------

const TM_VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const TM_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform sampler2D uExt;
uniform vec2 uInvSize;
uniform float uExposure;
uniform float uExtOn;
uniform vec3 uBg;
void main() {
  vec2 uv = gl_FragCoord.xy * uInvSize;
  vec3 c = texture2D(uTex, uv).rgb + texture2D(uExt, uv).rgb * uExtOn;
  gl_FragColor = vec4(uBg + (1.0 - exp(-c * uExposure)), 1.0);
}
`;

type TmLocs = {
  prog: WebGLProgram;
  pos: number;
  tex: WebGLUniformLocation | null;
  ext: WebGLUniformLocation | null;
  inv: WebGLUniformLocation | null;
  exp: WebGLUniformLocation | null;
  extOn: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
};

function tmLocs(g: WebGL2RenderingContext, fs: string): TmLocs {
  const prog = createProgram(g, TM_VS, fs);
  return {
    prog,
    pos: g.getAttribLocation(prog, 'aPos'),
    tex: g.getUniformLocation(prog, 'uTex'),
    ext: g.getUniformLocation(prog, 'uExt'),
    inv: g.getUniformLocation(prog, 'uInvSize'),
    exp: g.getUniformLocation(prog, 'uExposure'),
    extOn: g.getUniformLocation(prog, 'uExtOn'),
    bg: g.getUniformLocation(prog, 'uBg'),
  };
}

// ---------- wave field of the sources: Huygens sum ----------
// Every mirror element lit by a source is a secondary source with the
// complex amplitude c it receives (sum over sources of e^{iks}/√dist, s the
// signed optical path). The field at a pixel is Σ c·e^{ik r}/√r over the
// elements, the intensity its squared modulus — the Kirchhoff integral over
// the mirror without the obliquity factor. The reflected rays, caustics,
// Airy fringes and diffraction all come out of the sum; the element spacing
// must stay below λ/2 or the array shows grating lobes.
const HUY_FS = `
precision highp float;
uniform highp sampler2D uEl;
uniform int uCount;
uniform float uInvCount;
uniform float uK;
uniform float uRMin;
uniform float uInvR;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform vec2 uSize;
uniform float uNorm;
uniform vec3 uTint;
void main() {
  vec2 ndc = (gl_FragCoord.xy / uSize) * 2.0 - 1.0;
  vec2 r = (ndc - uOffset) / uScale;
  vec2 acc = vec2(0.0);
  for (int i = 0; i < ${HUY_MAX}; i++) {
    if (i >= uCount) break;
    vec4 e = texture2D(uEl, vec2((float(i) + 0.5) * uInvCount, 0.5));
    vec2 dv = r - e.xy;
    float d = max(length(dv), uRMin);
    // Kirchhoff obliquity: an element radiates inwards, not through the mirror
    float obl = 0.5 * (1.0 - dot(e.xy * uInvR, dv) / d);
    float ph = uK * d;
    vec2 w = vec2(cos(ph), sin(ph)) * (obl * inversesqrt(d));
    acc += vec2(e.z * w.x - e.w * w.y, e.z * w.y + e.w * w.x);
  }
  float I = dot(acc, acc) * uNorm;
  gl_FragColor = vec4(uTint * I, 1.0);
}
`;

type HuyLocs = {
  prog: WebGLProgram;
  pos: number;
  el: WebGLUniformLocation | null;
  count: WebGLUniformLocation | null;
  invCount: WebGLUniformLocation | null;
  k: WebGLUniformLocation | null;
  rMin: WebGLUniformLocation | null;
  invR: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  offset: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  norm: WebGLUniformLocation | null;
  tint: WebGLUniformLocation | null;
};

let tmL: TmLocs | null = null;
let huyL: HuyLocs | null = null;
let huyTex: WebGLTexture | null = null;
let quadBuf: WebGLBuffer | null = null;
let fbo: WebGLFramebuffer | null = null;
let fboTex: WebGLTexture | null = null;
let fboW = 0;
let fboH = 0;
// Chord extensions accumulate in a separate half-size target: they are the
// long faint lines, and their fill cost scales with the target area. The
// wave field renders into the same target.
let extFbo: WebGLFramebuffer | null = null;
let extTex: WebGLTexture | null = null;
let extW = 0;
let extH = 0;
let halfExt = false;

if (post && gl2) {
  tmL = tmLocs(gl2, TM_FS);
  const hp = createProgram(gl2, TM_VS, HUY_FS);
  huyL = {
    prog: hp,
    pos: gl2.getAttribLocation(hp, 'aPos'),
    el: gl2.getUniformLocation(hp, 'uEl'),
    count: gl2.getUniformLocation(hp, 'uCount'),
    invCount: gl2.getUniformLocation(hp, 'uInvCount'),
    k: gl2.getUniformLocation(hp, 'uK'),
    rMin: gl2.getUniformLocation(hp, 'uRMin'),
    invR: gl2.getUniformLocation(hp, 'uInvR'),
    scale: gl2.getUniformLocation(hp, 'uScale'),
    offset: gl2.getUniformLocation(hp, 'uOffset'),
    size: gl2.getUniformLocation(hp, 'uSize'),
    norm: gl2.getUniformLocation(hp, 'uNorm'),
    tint: gl2.getUniformLocation(hp, 'uTint'),
  };
  huyTex = gl2.createTexture();
  gl2.bindTexture(gl2.TEXTURE_2D, huyTex);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.NEAREST);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.NEAREST);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
  quadBuf = gl2.createBuffer();
  gl2.bindBuffer(gl2.ARRAY_BUFFER, quadBuf);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl2.STATIC_DRAW);
  fbo = gl2.createFramebuffer();
  fboTex = gl2.createTexture();
  extFbo = gl2.createFramebuffer();
  extTex = gl2.createTexture();
}

// (Re)allocates a linear-filtered RGBA16F texture of the given size as the
// framebuffer's color attachment; false when the combination is unsupported.
function attachFloatTarget(fb: WebGLFramebuffer | null, tex: WebGLTexture | null, w: number, h: number): boolean {
  const g = gl2!;
  g.bindTexture(g.TEXTURE_2D, tex);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA16F, w, h, 0, g.RGBA, g.HALF_FLOAT, null);
  g.bindFramebuffer(g.FRAMEBUFFER, fb);
  g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
  const ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
  g.bindFramebuffer(g.FRAMEBUFFER, null);
  return ok;
}

function ensureFbo(w: number, h: number): boolean {
  if (!post || !gl2) return false;
  if (fboW === w && fboH === h) return true;
  if (!attachFloatTarget(fbo, fboTex, w, h)) {
    post = false;
    return false;
  }
  extW = Math.ceil(w / 2);
  extH = Math.ceil(h / 2);
  halfExt = attachFloatTarget(extFbo, extTex, extW, extH);
  fboW = w;
  fboH = h;
  return true;
}

const roleBuf = gl.createBuffer()!;
const startBuf = gl.createBuffer()!;
const colorBuf = gl.createBuffer()!;
// The optics scene's rays: four instance sets (start, end, color), the
// light after the mirror and before it, each with its outer part — the
// outer light is drawn with the extensions switch, the light before the
// mirror with the incoming switch.
type RaySet = { s: Float32Array; e: Float32Array; c: Float32Array; n: number; bs: WebGLBuffer; be: WebGLBuffer; bc: WebGLBuffer };
const newRaySet = (): RaySet => ({
  s: new Float32Array(0),
  e: new Float32Array(0),
  c: new Float32Array(0),
  n: 0,
  bs: gl.createBuffer()!,
  be: gl.createBuffer()!,
  bc: gl.createBuffer()!,
});
const raysR = newRaySet(); // reflected: the chords
const raysI = newRaySet(); // incoming: from the emitter to the mirror
const outR = newRaySet(); // after it leaves through the wall
const outI = newRaySet(); // before it enters, and the virtual continuation towards the caustic
const spBuf = gl.createBuffer()!;
const endBufA = gl.createBuffer()!;
const endBufB = gl.createBuffer()!;
const pointBuf = gl.createBuffer()!;
const circleBuf = gl.createBuffer()!;

// Vertex roles: [0,1] — the chord's two ends; [2..5] — the four extension
// vertices. Instanced draws read a 2- or 4-vertex slice of this template.
gl.bindBuffer(gl.ARRAY_BUFFER, roleBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 2, 3, 4, 5]), gl.STATIC_DRAW);

const R = 0.92;
const R_OUT = 30.0; // extensions stay longer than the viewport even at minimum zoom
const R_MAJ = 0.62; // torus: distance from the axis to the tube center
const R_MIN = 0.3; // torus: tube radius
const CAM_DIST = 4.0;
const STRIDE = 24; // 6 float32 per vertex: x, y, z, r, g, b
const CIRCLE_SEG = 512;
const PANEL_OCCUPIED = 332; // CSS px: floating panel width + margins

// ---------- rotation (column-major mat3) ----------

const IDENT3: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
let rot: Float32Array = IDENT3;

function rotXm(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, c, s, 0, -s, c]);
}

function rotYm(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]);
}

function mat3mul(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      r[col * 3 + row] =
        a[row] * b[col * 3] + a[3 + row] * b[col * 3 + 1] + a[6 + row] * b[col * 3 + 2];
    }
  }
  return r;
}

// Increments rotate around the screen axes, so the torus follows the mouse
// regardless of its current orientation.
function rotateView(yaw: number, pitch: number) {
  rot = mat3mul(mat3mul(rotYm(yaw), rotXm(pitch)), rot);
}

function resetRot() {
  rot = rotXm(-1.05);
}

resetRot();

// ---------- geometry ----------

function bindAttribs(buf: WebGLBuffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, STRIDE, 0);
  gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, STRIDE, 12);
}

{
  const data = new Float32Array(CIRCLE_SEG * 6);
  for (let i = 0; i < CIRCLE_SEG; i++) {
    const a = (TAU * i) / CIRCLE_SEG;
    data.set([R * Math.cos(a), R * Math.sin(a), 0, 0.11, 0.125, 0.153], i * 6);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, circleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

// Element 0 sits at the top of the circle; numbering runs clockwise.
function angle(k: number, p: number): number {
  return Math.PI / 2 - (TAU * k) / p;
}

// Angle interpolation along the shorter arc: a chord end slides on the
// circle (or around the torus) instead of cutting across.
function lerpAngle(a0: number, a1: number, t: number): number {
  let d = (a1 - a0) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a0 + d * t;
}

function hueColor(t: number): [number, number, number] {
  const h = t * 6;
  const i = Math.floor(h) % 6;
  const f = h - Math.floor(h);
  const s = 0.75;
  const lo = 1 - s;
  const q = 1 - s * f;
  const u = 1 - s * (1 - f);
  switch (i) {
    case 0: return [1, u, lo];
    case 1: return [q, 1, lo];
    case 2: return [lo, 1, u];
    case 3: return [lo, q, 1];
    case 4: return [u, lo, 1];
    default: return [1, lo, q];
  }
}

// z = x + y·i sits on the torus at angles θ = 2πx/p (around the axis) and
// φ = 2πy/p (around the tube).
function torusPos(th: number, ph: number): [number, number, number] {
  const rho = R_MAJ + R_MIN * Math.cos(ph);
  return [rho * Math.cos(th), rho * Math.sin(th), R_MIN * Math.sin(ph)];
}

// Hue follows x; value follows y, so the two coordinates stay readable.
function f2color(x: number, y: number, p: number): [number, number, number] {
  const [r, g, b] = hueColor(x / p);
  const v = 0.55 + 0.45 * (y / p);
  return [r * v, g * v, b * v];
}

let posTab = new Float32Array(0); // element positions, ·3 (fp: by x; fp2: by x·p+y)
let colTab = new Float32Array(0); // element colors, same indexing
let normTab = new Float32Array(0); // surface normals at the elements (0 at the ring center)
let endsA = new Float32Array(0); // chord end positions, ·3 per element
let endsB = new Float32Array(0); // the second diagram of a cross-fade
let endsBLive = false;

function reallocBuffers() {
  nInst = state.mode === 'fp' ? state.p : state.p2 * state.p2;
  endsA = new Float32Array(nInst * 3);
  endsB = new Float32Array(nInst * 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, endBufA);
  gl.bufferData(gl.ARRAY_BUFFER, endsA.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, endBufB);
  gl.bufferData(gl.ARRAY_BUFFER, endsB.byteLength, gl.DYNAMIC_DRAW);
}

let pointCount = 0;

// Fills the point buffer and the position/color caches.
function rebuildPoints() {
  if (state.mode === 'fp') {
    const p = state.p;
    posTab = new Float32Array(p * 3);
    colTab = new Float32Array(p * 3);
    normTab = new Float32Array(p * 3);
    const data = new Float32Array(p * 6);
    if (angTab.length !== p || state.frame !== 'eigen' || !eigen) {
      // the value frame: element x at angle 2πx/p
      angTab = new Float32Array(p);
      onRim = new Uint8Array(p);
      for (let x = 0; x < p; x++) {
        angTab[x] = angle(x, p);
        onRim[x] = 1;
      }
    }
    for (let x = 0; x < p; x++) {
      let px = 0;
      let py = 0;
      let cr = 0.45;
      let cg = 0.47;
      let cb = 0.5;
      {
        if (onRim[x]) {
          px = R * Math.cos(angTab[x]);
          py = R * Math.sin(angTab[x]);
        }
        [cr, cg, cb] = hueColor(x / p);
      }
      posTab.set([px, py, 0], x * 3);
      normTab.set([px / R, py / R, 0], x * 3);
      colTab.set([cr, cg, cb], x * 3);
      data.set([px, py, 0, cr * 0.55, cg * 0.55, cb * 0.55], x * 6);
    }
    pointCount = p;
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    uploadInstanceStatics();
    return;
  }
  const p = state.p2;
  posTab = new Float32Array(p * p * 3);
  colTab = new Float32Array(p * p * 3);
  normTab = new Float32Array(p * p * 3);
  const data = new Float32Array(p * p * 6);
  let n = 0;
  for (let x = 0; x < p; x++) {
    for (let y = 0; y < p; y++) {
      let px = 0;
      let py = 0;
      let pz = 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let cr = 0.45;
      let cg = 0.47;
      let cb = 0.5;
      {
        const th = (TAU * x) / p;
        const ph = (TAU * y) / p;
        [px, py, pz] = torusPos(th, ph);
        nx = Math.cos(ph) * Math.cos(th);
        ny = Math.cos(ph) * Math.sin(th);
        nz = Math.sin(ph);
        [cr, cg, cb] = f2color(x, y, p);
      }
      posTab.set([px, py, pz], n * 3);
      normTab.set([nx, ny, nz], n * 3);
      colTab.set([cr, cg, cb], n * 3);
      data.set([px, py, pz, cr * 0.5, cg * 0.5, cb * 0.5], n * 6);
      n++;
    }
  }
  pointCount = n;
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  uploadInstanceStatics();
}

// Chord starts and colors are the elements' own positions and colors: they
// change only with p, mode or layout, never per frame.
function uploadInstanceStatics() {
  gl.bindBuffer(gl.ARRAY_BUFFER, startBuf);
  gl.bufferData(gl.ARRAY_BUFFER, posTab, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, colTab, gl.STATIC_DRAW);
}

// ---------- next-step coefficient sets ----------

function nextSetFp(): FpSet {
  const cur = state.fp;
  if (state.stepMode === 'coef') {
    const next = { ...cur };
    next[state.animFp] = (next[state.animFp] + 1) % state.p;
    return next;
  }
  const m = stepMatFp();
  if (m === null) return cur;
  const p = state.p;
  return {
    a: mod(m[0] * cur.a + m[1] * cur.c, p),
    b: mod(m[0] * cur.b + m[1] * cur.d, p),
    c: mod(m[2] * cur.a + m[3] * cur.c, p),
    d: mod(m[2] * cur.b + m[3] * cur.d, p),
  };
}

function nextSetFp2(): Fp2Set {
  const cur = state.fp2;
  const p = state.p2;
  if (state.stepMode === 'coef') {
    const next = { ...cur };
    if (state.coefForm === 'exp') {
      const kk = state.animFp2Exp;
      const u = cur[`${kk}0` as Fp2Key];
      const v = cur[`${kk}1` as Fp2Key];
      next[`${kk}0` as Fp2Key] = (u * gen[0] + ns * (v * gen[1])) % p;
      next[`${kk}1` as Fp2Key] = (u * gen[1] + v * gen[0]) % p;
    } else {
      const kk = state.animFp2;
      next[kk] = (next[kk] + 1) % p;
    }
    return next;
  }
  const m = stepMatFp2();
  if (m === null) return cur;
  const A: F2 = [cur.a0, cur.a1];
  const B: F2 = [cur.b0, cur.b1];
  const C: F2 = [cur.c0, cur.c1];
  const D: F2 = [cur.d0, cur.d1];
  const na = f2add(f2mul(m[0], A, ns, p), f2mul(m[1], C, ns, p), p);
  const nb = f2add(f2mul(m[0], B, ns, p), f2mul(m[1], D, ns, p), p);
  const nc = f2add(f2mul(m[2], A, ns, p), f2mul(m[3], C, ns, p), p);
  const nd = f2add(f2mul(m[2], B, ns, p), f2mul(m[3], D, ns, p), p);
  return {
    a0: na[0], a1: na[1], b0: nb[0], b1: nb[1],
    c0: nc[0], c1: nc[1], d0: nd[0], d1: nd[1],
  };
}

// ---------- chord end positions ----------
// The start of every chord is the element's own static position; the CPU
// recomputes only the 3-float end per element each frame. A pole or a fixed
// point gets end = start: the zero-length chord and its extensions rasterize
// nothing.

function phase(): number {
  return animValue - Math.floor(animValue);
}

function fillEndsFp(setA: FpSet, setB: FpSet, t: number, out: Float32Array) {
  const p = state.p;
  for (let x = 0; x < p; x++) {
    const si = x * 3;
    let ex = posTab[si];
    let ey = posTab[si + 1];
    const y0 = mobius(x, setA.a, setA.b, setA.c, setA.d, p);
    if (y0 !== null) {
      const y1 = t === 0 ? y0 : mobius(x, setB.a, setB.b, setB.c, setB.d, p);
      if (y1 !== null) {
        if (t === 0 || y0 === y1) {
          ex = posTab[y0 * 3];
          ey = posTab[y0 * 3 + 1];
        } else if (onRim[y0] && onRim[y1]) {
          const ay = lerpAngle(angTab[y0], angTab[y1], t);
          ex = R * Math.cos(ay);
          ey = R * Math.sin(ay);
        } else {
          // an end is the element at the frame's infinity, drawn at the centre
          ex = posTab[y0 * 3] + (posTab[y1 * 3] - posTab[y0 * 3]) * t;
          ey = posTab[y0 * 3 + 1] + (posTab[y1 * 3 + 1] - posTab[y0 * 3 + 1]) * t;
        }
      }
    }
    out[si] = ex;
    out[si + 1] = ey;
    out[si + 2] = 0;
  }
}

// The hot loop: p² evaluations per frame. Inlined scalar arithmetic, an
// inverse-table lookup instead of extended Euclid, cached positions — an
// animated frame at p = 499 stays allocation-free. The algebra is identical
// to f2mobius; the test suite compares the two.
function fillEndsFp2(setA: Fp2Set, setB: Fp2Set, t: number, out: Float32Array) {
  const p = state.p2;
  const inv = invTab;
  const pos = posTab;
  const anim = t > 0;
  const tau = TAU / p;

  const a0 = setA.a0, a1 = setA.a1, b0 = setA.b0, b1 = setA.b1;
  const c0 = setA.c0, c1 = setA.c1, d0 = setA.d0, d1 = setA.d1;
  const na0 = setB.a0, na1 = setB.a1, nb0 = setB.b0, nb1 = setB.b1;
  const nc0 = setB.c0, nc1 = setB.c1, nd0 = setB.d0, nd1 = setB.d1;

  let n = 0;
  for (let x = 0; x < p; x++) {
    for (let y = 0; y < p; y++) {
      const o = n * 3;
      let ex = pos[o];
      let ey = pos[o + 1];
      let ez = pos[o + 2];
      // w0 = (A·z + B)/(C·z + D) for z = x + y·i, inlined over pairs.
      let de0 = (c0 * x + ns * c1 * y + d0) % p;
      let de1 = (c0 * y + c1 * x + d1) % p;
      let nrm = (de0 * de0 - ns * de1 * de1) % p;
      if (nrm < 0) nrm += p;
      if (nrm === 0) {
        out[o] = ex; out[o + 1] = ey; out[o + 2] = ez;
        n++;
        continue;
      }
      let ninv = inv[nrm];
      const di0 = (de0 * ninv) % p;
      const di1 = (((p - de1) % p) * ninv) % p;
      const nu0 = (a0 * x + ns * a1 * y + b0) % p;
      const nu1 = (a0 * y + a1 * x + b1) % p;
      const w0x = (nu0 * di0 + ns * nu1 * di1) % p;
      const w0y = (nu0 * di1 + nu1 * di0) % p;

      let w1x = w0x;
      let w1y = w0y;
      if (anim) {
        de0 = (nc0 * x + ns * nc1 * y + nd0) % p;
        de1 = (nc0 * y + nc1 * x + nd1) % p;
        nrm = (de0 * de0 - ns * de1 * de1) % p;
        if (nrm < 0) nrm += p;
        if (nrm === 0) {
          out[o] = ex; out[o + 1] = ey; out[o + 2] = ez;
          n++;
          continue;
        }
        ninv = inv[nrm];
        const e0 = (de0 * ninv) % p;
        const e1 = (((p - de1) % p) * ninv) % p;
        const m0 = (na0 * x + ns * na1 * y + nb0) % p;
        const m1 = (na0 * y + na1 * x + nb1) % p;
        w1x = (m0 * e0 + ns * m1 * e1) % p;
        w1y = (m0 * e1 + m1 * e0) % p;
      }

      const same = !anim || (w0x === w1x && w0y === w1y);
      if (same) {
        const wi = (w0x * p + w0y) * 3;
        ex = pos[wi];
        ey = pos[wi + 1];
        ez = pos[wi + 2];
      } else {
        const th = lerpAngle(tau * w0x, tau * w1x, t);
        const ph = lerpAngle(tau * w0y, tau * w1y, t);
        const rho = R_MAJ + R_MIN * Math.cos(ph);
        ex = rho * Math.cos(th);
        ey = rho * Math.sin(th);
        ez = R_MIN * Math.sin(ph);
      }
      out[o] = ex;
      out[o + 1] = ey;
      out[o + 2] = ez;
      n++;
    }
  }
}

function rebuildScene() {
  const t = phase();
  const fade = state.phaseMode === 'fade' && t > 0;
  if (state.mode === 'fp') {
    ensureFrame();
    const A = state.fp;
    const B = t > 0 ? nextSetFp() : A;
    if (fade) {
      fillEndsFp(A, A, 0, endsA);
      fillEndsFp(B, B, 0, endsB);
    } else {
      fillEndsFp(A, B, state.phaseMode === 'arc' ? t : 0, endsA);
    }
  } else {
    const A = state.fp2;
    const B = t > 0 ? nextSetFp2() : A;
    if (fade) {
      fillEndsFp2(A, A, 0, endsA);
      fillEndsFp2(B, B, 0, endsB);
    } else {
      fillEndsFp2(A, B, state.phaseMode === 'arc' ? t : 0, endsA);
    }
  }
  endsBLive = fade;
  gl.bindBuffer(gl.ARRAY_BUFFER, endBufA);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, endsA);
  if (fade) {
    gl.bindBuffer(gl.ARRAY_BUFFER, endBufB);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, endsB);
  }
  if (state.showSrc) {
    computeSources();
    for (const set of [raysR, raysI, outR, outI]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, set.bs);
      gl.bufferData(gl.ARRAY_BUFFER, set.s.subarray(0, set.n * 3), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, set.be);
      gl.bufferData(gl.ARRAY_BUFFER, set.e.subarray(0, set.n * 3), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, set.bc);
      gl.bufferData(gl.ARRAY_BUFFER, set.c.subarray(0, set.n * 3), gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.bufferData(gl.ARRAY_BUFFER, spData.subarray(0, (spCount + cuspCount) * 6), gl.DYNAMIC_DRAW);
    if (gl2 && huyTex && huyCount > 0) {
      gl2.activeTexture(gl2.TEXTURE0);
      gl2.bindTexture(gl2.TEXTURE_2D, huyTex);
      gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA32F, huyCount, 1, 0, gl2.RGBA, gl2.FLOAT, huyData.subarray(0, huyCount * 4));
    }
    if (panel.srcNote !== srcNote) panel.srcNote = srcNote;
    if (panel.sceneOk !== sceneOk()) panel.sceneOk = sceneOk();
  }
}

// ---------- the eigen frame ----------
// A projective map x ↦ (ax + b)/(cx + d) is not continuous in the value
// layout, but it is conjugate to a multiplication or a rotation. With two
// fixed points u, v in F_p the coordinate y = (x − u)/(x − v) makes it
// y ↦ K·y; with one fixed point u, y = 1/(x − u) makes it y ↦ y + τ; with
// fixed points in F_p² the coordinate y = (x − u)/(x − ū) has norm 1 and
// the map is a rotation of the p + 1 norm-one elements. The eigen frame
// lays the elements out by y — the element sent to ∞ sits at the centre —
// and there the chords form a continuous family with a source curve.
type EigenInfo =
  | { type: 'hyperbolic'; u: number; v: number; K: number }
  | { type: 'parabolic'; u: number; tau: number }
  | { type: 'elliptic'; step: number; slots: number };
let eigen: EigenInfo | null = null;
let frameNote = '';
let frameKey = '';
let angTab = new Float32Array(0); // element angle in the current frame
let onRim = new Uint8Array(0); // 0 for the element at the frame's infinity

function sqrtMod(n: number, p: number): number | null {
  n = mod(n, p);
  for (let r = 0; r <= p >> 1; r++) if ((r * r) % p === n) return r;
  return null;
}

// Fills eigen, angTab and onRim for the current fp map; null when the map
// is affine (the value frame is already its own) or degenerate.
function computeEigen(): EigenInfo | null {
  const p = state.p;
  const { a, b, c, d } = state.fp;
  angTab = new Float32Array(p);
  onRim = new Uint8Array(p);
  if (c === 0) {
    for (let x = 0; x < p; x++) {
      angTab[x] = angle(x, p);
      onRim[x] = 1;
    }
    frameNote = 'c = 0: the value frame is the map\'s own';
    return null;
  }
  const inv2c = modInverse(mod(2 * c, p), p);
  if (inv2c === null) return null;
  const f = (x: number) => mobius(x, a, b, c, d, p);
  const disc = mod((a - d) * (a - d) + 4 * b * c, p);
  if (disc === 0) {
    const u = mod((a - d) * inv2c, p);
    const y = (x: number): number | null => (x === u ? null : modInverse(mod(x - u, p), p));
    let tau = 0;
    for (let x0 = 0; x0 < p; x0++) {
      const y0 = y(x0);
      const fx = f(x0);
      if (y0 === null || fx === null) continue;
      const y1 = y(fx);
      if (y1 === null) continue;
      tau = mod(y1 - y0, p);
      break;
    }
    for (let x = 0; x < p; x++) {
      const yx = y(x);
      if (yx === null) continue;
      angTab[x] = angle(yx, p);
      onRim[x] = 1;
    }
    frameNote = `eigen: one fixed point ${u}; y = 1/(x − ${u}), the map is y ↦ y + ${tau}`;
    return { type: 'parabolic', u, tau };
  }
  const r = sqrtMod(disc, p);
  if (r !== null) {
    const u = mod((a - d + r) * inv2c, p);
    const v = mod((a - d - r) * inv2c, p);
    const y = (x: number): number | null => (x === v ? null : mod((x - u) * modInverse(mod(x - v, p), p)!, p));
    let K = 1;
    for (let x0 = 0; x0 < p; x0++) {
      const y0 = y(x0);
      const fx = f(x0);
      if (y0 === null || y0 === 0 || fx === null) continue;
      const y1 = y(fx);
      if (y1 === null) continue;
      K = mod(y1 * modInverse(y0, p)!, p);
      break;
    }
    for (let x = 0; x < p; x++) {
      const yx = y(x);
      if (yx === null) continue;
      angTab[x] = angle(yx, p);
      onRim[x] = 1;
    }
    frameNote = `eigen: fixed points ${u}, ${v}; y = (x − ${u})/(x − ${v}), the map is y ↦ ${K}·y`;
    return { type: 'hyperbolic', u, v, K };
  }
  // elliptic: work in F_p(√disc), the fixed points are u and its conjugate
  const D = disc;
  const u0 = mod((a - d) * inv2c, p);
  const u1 = inv2c;
  const y = (x: number): F2 => {
    // (x − u)/(x − ū) = (x − u)² / N(x − ū)
    const w: F2 = [mod(x - u0, p), mod(-u1, p)];
    const nrm = mod(w[0] * w[0] - D * w[1] * w[1], p);
    const sq = f2mul(w, w, D, p);
    const inv = modInverse(nrm, p)!;
    return [mod(sq[0] * inv, p), mod(sq[1] * inv, p)];
  };
  // a generator of the norm-one group: w/w̄ = w²/N(w) has norm one
  const slots = p + 1;
  const factors = primeFactors(slots);
  let g: F2 = [1, 0];
  for (let t = 1; t < p; t++) {
    const w: F2 = [1, t];
    const nrm = mod(1 - D * t * t, p);
    const inv = modInverse(nrm, p);
    if (inv === null) continue;
    const sq = f2mul(w, w, D, p);
    const z: F2 = [mod(sq[0] * inv, p), mod(sq[1] * inv, p)];
    if (factors.every((q) => { const e = f2pow(z, slots / q, D, p); return !(e[0] === 1 && e[1] === 0); })) {
      g = z;
      break;
    }
  }
  const logs = new Map<number, number>();
  let z: F2 = [1, 0];
  for (let k = 0; k < slots; k++) {
    logs.set(z[0] * p + z[1], k);
    z = f2mul(z, g, D, p);
  }
  let step = 0;
  for (let x0 = 0; x0 < p; x0++) {
    const fx = f(x0);
    if (fx === null) continue;
    const k0 = logs.get(y(x0)[0] * p + y(x0)[1]);
    const k1 = logs.get(y(fx)[0] * p + y(fx)[1]);
    if (k0 === undefined || k1 === undefined) continue;
    step = mod(k1 - k0, slots);
    break;
  }
  for (let x = 0; x < p; x++) {
    const yx = y(x);
    const k = logs.get(yx[0] * p + yx[1]);
    if (k === undefined) continue;
    angTab[x] = angle(k, slots);
    onRim[x] = 1;
  }
  frameNote = `eigen: fixed points in F_p²; the map is a rotation by ${step} of ${slots} slots`;
  return { type: 'elliptic', step, slots };
}

function ensureFrame() {
  const { a, b, c, d } = state.fp;
  const key = `${state.frame}|${state.p}|${a},${b},${c},${d}`;
  if (key === frameKey) return;
  const wasEigen = frameKey.startsWith('eigen');
  frameKey = key;
  if (state.frame === 'eigen') {
    eigen = computeEigen();
    rebuildPoints();
  } else {
    eigen = null;
    frameNote = '';
    if (wasEigen) rebuildPoints();
  }
  panel.frameNote = frameNote;
}

// ---------- the optics scene ----------
// What lights the mirror so that its reflections are the chords. The chord
// leaving x with unit direction d is the reflection of a ray arriving along
// u = d − 2(d·n)n, so the incoming lines are known exactly. For x ↦ a·x + b
// on the circle they are the family θ → mθ, m = 2 − a, after the rotation
// c0 that absorbs b; their envelope is the caustic of the incoming light
// E(θ) = R/(m+1)·(m·e^{iθ} + e^{imθ}), with |m − 1| cusps where
// e^{i(m−1)θ} = −1, at radius R·(m−1)/(m+1). The scene has nothing to do
// with p: the mirror is sampled uniformly, the algebra only picks its p
// chords out of the continuous family.
//
// The emitter is a wavefront of that light: W, the involute of E unwound
// from an arc midpoint — a cycloid similar to E with the ratio
// |m+1|/|m−1| and its cusps on the mirror. Every point of W radiates
// along the normal of W, which is a tangent of E, and the mirror point ϑ
// reflects that ray into the chord ϑ → aϑ + β. W lies inside the disk for
// a ≥ 4, light runs from it straight to the mirror; for a ≤ 0 it lies
// outside, light enters through the wall and touches E on the way. For
// a = 2 the emitter is the point on the rim, for a = 3 the plane fronts
// tangent to the mirror, the beam coming from both sides. In wave mode
// each mirror element re-emits the incoming wave with the phase of its
// path from the emitter.
//
// Drawn: the emitter (marks) and its light, before and after the mirror
// in the same colour. The outer light, shown with the extensions switch,
// is the ray before it enters through the wall and after it leaves, and,
// for a caustic behind the mirror, the virtual continuation of the
// incoming ray up to it. The caustic itself is not marked: it is where
// the light gathers.
let spData = new Float32Array(0); // source marks: the curve's points, then the point sources
let spCount = 0;
let cuspCount = 0;
let srcNote = '';
// Huygens elements: position ·2 and complex amplitude ·2 per lit element
let huyData = new Float32Array(0);
let huyCount = 0;
let huyPower = 1; // Σ|c|² over the lit elements, the field's normalisation
let huyX = new Float32Array(0);
let huyY = new Float32Array(0);
let huyRe = new Float32Array(0);
let huyIm = new Float32Array(0);

// One light, one colour: the emitter's marks and its rays share a teal;
// the wave field is tinted by its wavelength instead (waveTint)
const LIGHT_TINT: [number, number, number] = [0.55, 0.9, 0.85];
const EMITTER_MARK = [0.45, 0.95, 0.85];

// What the scene sees: an affine map y ↦ ar·y + br on a circle of `slots`
// elements (small representatives: x ↦ (p−2)x is ×(−2)), or a rotation by
// alpha, or nothing — a projective map in the value frame.
type Affine = { ar: number; br: number; slots: number };

// The scene exists for the maps x ↦ ax + b only: denominator 1
const sceneOk = () => state.mode === 'fp' && state.fp.c === 0 && state.fp.d === 1;

function sceneMap(): Affine {
  const { a, b } = state.fp;
  const p = state.p;
  const small = (x: number, n: number) => (x > n / 2 ? x - n : x);
  return { ar: small(a, p), br: small(b, p), slots: p };
}

// The source curve of y ↦ a·y + b: m, its cusp count, radius and rotation;
// null when the curve degenerates.
function sourceCurve(rp: Affine): { m: number; nc: number; rho: number; c0: number } | null {
  const m = 2 - rp.ar;
  if (m === 1 || m === -1) return null; // identity; parallel beam, curve at infinity
  return { m, nc: Math.abs(m - 1), rho: (R * (m - 1)) / (m + 1), c0: (TAU * rp.br) / rp.slots / (m - 1) };
}

// standard frame (element 0 at angle 0, counterclockwise) → the panel's
// frame (element 0 at the top, clockwise)
const toPanel = (re: number, im: number): [number, number] => [im, re];
// a mirror point at the standard angle ϑ, in the panel's frame
const mirrorAt = (th: number): [number, number] => toPanel(R * Math.cos(th), R * Math.sin(th));

function reserve(set: RaySet, rays: number) {
  if (set.s.length >= rays * 3) return;
  const grow = (a: Float32Array) => {
    const b = new Float32Array(rays * 3);
    b.set(a);
    return b;
  };
  set.s = grow(set.s);
  set.e = grow(set.e);
  set.c = grow(set.c);
}

function ensureSourceArrays(rays: number, marks: number, elements: number) {
  reserve(raysR, rays);
  reserve(raysI, rays);
  if (spData.length < marks * 6) spData = new Float32Array(marks * 6);
  if (huyX.length < elements) {
    huyX = new Float32Array(elements);
    huyY = new Float32Array(elements);
    huyRe = new Float32Array(elements);
    huyIm = new Float32Array(elements);
    huyData = new Float32Array(elements * 4);
  }
}

function push(set: RaySet, sx: number, sy: number, ex: number, ey: number, tint: [number, number, number]) {
  if (set.s.length < (set.n + 1) * 3) reserve(set, Math.max(1024, set.n * 2));
  const o = set.n * 3;
  set.s[o] = sx;
  set.s[o + 1] = sy;
  set.s[o + 2] = 0;
  set.e[o] = ex;
  set.e[o + 1] = ey;
  set.e[o + 2] = 0;
  set.c[o] = tint[0];
  set.c[o + 1] = tint[1];
  set.c[o + 2] = tint[2];
  set.n++;
}

// distance from (x, y) along the unit direction (ux, uy) to the circle R_OUT
function farOut(x: number, y: number, ux: number, uy: number) {
  const pu = x * ux + y * uy;
  return -pu + Math.sqrt(Math.max(pu * pu + R_OUT * R_OUT - x * x - y * y, 0));
}

// A reflected ray: the chord from the mirror point to its far end and, in
// the outer light, its exit through the wall; `back` > 0 adds the ray's
// virtual continuation behind the mirror point, towards the virtual image
// the reflected light seems to come from.
function pushReflected(px: number, py: number, ex: number, ey: number, tint: [number, number, number], back = 0) {
  const dx = ex - px;
  const dy = ey - py;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  push(raysR, px, py, ex, ey, tint);
  const t = farOut(ex, ey, dx / len, dy / len);
  push(outR, ex, ey, ex + (dx / len) * t, ey + (dy / len) * t, tint);
  if (back > 0) push(outR, px - (dx / len) * back, py - (dy / len) * back, px, py, tint);
}

// The light before the mirror point (px, py), arriving along the unit
// direction (ux, uy). Light from a point source S inside the disk starts
// at S; any other light enters through the wall at the chord's far end,
// and the outer light shows it before the entry. `beyond` > 0 draws the
// virtual continuation past the mirror point, towards a source behind it.
function pushIncoming(px: number, py: number, ux: number, uy: number, from: [number, number] | null, beyond: number, origin?: [number, number]) {
  if (from) {
    push(raysI, from[0], from[1], px, py, LIGHT_TINT);
  } else {
    const s = 2 * (px * ux + py * uy);
    const qx = px - ux * s;
    const qy = py - uy * s;
    push(raysI, qx, qy, px, py, LIGHT_TINT);
    if (origin) push(outI, origin[0], origin[1], qx, qy, LIGHT_TINT);
    else {
      const t = farOut(qx, qy, -ux, -uy);
      push(outI, qx - ux * t, qy - uy * t, qx, qy, LIGHT_TINT);
    }
  }
  if (beyond > 0) push(outI, px, py, px + ux * beyond, py + uy * beyond, LIGHT_TINT);
}

function computeSources() {
  const wave = state.waveOn;
  const k = TAU / (state.wave * R);
  // mirror samples: a quarter wavelength apart for the field, fixed for rays
  let n = wave ? Math.min(HUY_MAX, Math.max(512, Math.ceil((8 * Math.PI) / state.wave))) : state.rays;
  raysR.n = 0;
  raysI.n = 0;
  outR.n = 0;
  outI.n = 0;
  spCount = 0;
  cuspCount = 0;
  huyCount = 0;
  if (!sceneOk()) {
    srcNote = 'sources: the maps x ↦ ax + b only';
    return;
  }
  const sm = sceneMap();
  if (sm.ar === 1) {
    srcNote = 'sources: identity map, no rays';
    return;
  }
  frontSource(sm, n, wave, k);
  if (wave) {
    packHuygens(n);
    // the mirror must be sampled closer than λ/2 or the array shows grating lobes
    const lamMin = (4 * Math.PI) / n;
    if (state.wave < lamMin) srcNote += `; λ < ${lamMin.toFixed(4)}: ${n} elements undersample the field`;
  }
  if (srcFit) {
    srcFit = false;
    fitSources();
  }
}

function frontSource(rp: Affine, n: number, wave: boolean, k: number) {
  const beta = (TAU * rp.br) / rp.slots;
  const m = 2 - rp.ar;
  const cv = sourceCurve(rp); // null for a = 3: the caustic is at infinity
  const kind: 'point' | 'beam' | 'cycloid' = m === 0 ? 'point' : m === -1 ? 'beam' : 'cycloid';
  const c0 = beta / (m - 1); // the rotation absorbing b
  const cs = Math.cos(c0);
  const sn = Math.sin(c0);
  // E(ϑ) in the panel's frame
  const curve = (ph: number): [number, number] => {
    const re = (R / (m + 1)) * (m * Math.cos(ph) + Math.cos(m * ph));
    const im = (R / (m + 1)) * (m * Math.sin(ph) + Math.sin(m * ph));
    return toPanel(re * cs - im * sn, re * sn + im * cs);
  };
  // W(ϑ): E(ϑ) − σ·T(ϑ), σ the arc length of E from the midpoint of its arc,
  // T its unit tangent; the involute with its cusps on the mirror
  const frontAt = (ph: number): [number, number] => {
    let psi = ((m - 1) * ph) / 2;
    let c = Math.cos(psi);
    if (Math.abs(c) < 1e-6) {
      ph += 1e-5; // a cusp of E: step off it, both sides give the same point of W
      psi = ((m - 1) * ph) / 2;
      c = Math.cos(psi);
    }
    const kk = Math.round(psi / Math.PI);
    const sigma = ((2 * R * Math.abs(m)) / Math.abs(m + 1)) * (2 / (m - 1)) * Math.sin(psi - kk * Math.PI);
    const sg = Math.sign(m / (m + 1)) * Math.sign(c);
    const ang = ((m + 1) * ph) / 2; // the unit tangent of E is sg·i·e^{i·ang}
    const tx = -Math.sin(ang) * sg;
    const ty = Math.cos(ang) * sg;
    const re = (R / (m + 1)) * (m * Math.cos(ph) + Math.cos(m * ph)) - sigma * tx;
    const im = (R / (m + 1)) * (m * Math.sin(ph) + Math.sin(m * ph)) - sigma * ty;
    return toPanel(re * cs - im * sn, re * sn + im * cs);
  };
  ensureSourceArrays(n, kind === 'cycloid' ? 1024 : kind === 'point' ? 1 : 512, n);
  const virtual = kind === 'cycloid' && !!cv && Math.abs(cv.rho) > R * 1.001; // the caustic lies behind the mirror
  const rim = mirrorAt(-beta); // a = 2: the point on the rim, the element −b
  // a = 3: the chords ϑ → −ϑ − β are parallel; the beam's direction from a generic one
  let bx = 0;
  let by = 0;
  if (kind === 'beam') {
    const [x0, y0] = mirrorAt(0.3);
    const [x1, y1] = mirrorAt(-0.3 - beta);
    const l = Math.hypot(x0 - x1, y0 - y1);
    bx = (x0 - x1) / l;
    by = (y0 - y1) / l;
  }
  for (let i = 0; i < n; i++) {
    const th = (TAU * i) / n;
    const [px, py] = mirrorAt(th);
    const [ex, ey] = mirrorAt(rp.ar * th + beta);
    // for a ≤ −2 the reflected rays diverge from a hypocycloid behind the
    // mirror, the virtual image of the emitter: the outer light shows the
    // ray's continuation back to it
    let back = 0;
    if (rp.ar <= -2) {
      const a = rp.ar;
      const ca = -beta / (a - 1);
      const ph = th - ca;
      const re = (R / (a + 1)) * (a * Math.cos(ph) + Math.cos(a * ph));
      const im = (R / (a + 1)) * (a * Math.sin(ph) + Math.sin(a * ph));
      const [tx, ty] = toPanel(re * Math.cos(ca) - im * Math.sin(ca), re * Math.sin(ca) + im * Math.cos(ca));
      const l = Math.hypot(ex - px, ey - py);
      if (l > 1e-9) back = ((px - tx) * (ex - px) + (py - ty) * (ey - py)) / l;
    }
    pushReflected(px, py, ex, ey, LIGHT_TINT, back);
    huyX[i] = px;
    huyY[i] = py;
    huyRe[i] = 0;
    huyIm[i] = 0;
    // the incoming ray runs along the chord from mϑ − β to ϑ
    const [qx, qy] = mirrorAt(m * th - beta);
    const ql = Math.hypot(px - qx, py - qy);
    if (ql < 1e-9) continue; // a fixed point: the chord degenerates
    const ux = (px - qx) / ql;
    const uy = (py - qy) / ql;
    let path = 0; // the optical path from the emitter to this mirror point
    if (kind === 'point') {
      pushIncoming(px, py, ux, uy, rim, 0);
      path = ql;
    } else if (kind === 'beam') {
      pushIncoming(px, py, ux, uy, null, 0);
      path = px * ux + py * uy; // a plane wave: the path grows along its direction
    } else {
      const w = frontAt(th - c0);
      let beyond = 0;
      if (virtual) {
        const [tx, ty] = curve(th - c0);
        beyond = (tx - px) * ux + (ty - py) * uy;
      }
      // from W straight to the mirror when W is inside, through the wall otherwise
      if (Math.hypot(w[0], w[1]) > R * (1 + 1e-6)) pushIncoming(px, py, ux, uy, null, beyond, w);
      else pushIncoming(px, py, ux, uy, w, beyond);
      path = Math.hypot(px - w[0], py - w[1]);
    }
    if (wave) {
      huyRe[i] = Math.cos(k * path);
      huyIm[i] = Math.sin(k * path);
    }
  }
  // marks: the emitter
  if (kind === 'cycloid') {
    for (let i = 0; i < 1024; i++) {
      const [x, y] = frontAt((TAU * (i + 0.5)) / 1024);
      spData.set([x, y, 0, ...EMITTER_MARK], spCount * 6);
      spCount++;
    }
  } else if (kind === 'beam') {
    // the plane fronts tangent to the mirror where each beam enters
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 256; i++) {
        const t = (-1.2 + (2.4 * (i + 0.5)) / 256) * R;
        spData.set([-side * bx * R - by * t, -side * by * R + bx * t, 0, ...EMITTER_MARK], spCount * 6);
        spCount++;
      }
    }
  }
  if (kind === 'point') {
    spData.set([rim[0], rim[1], 0, ...EMITTER_MARK], (spCount + cuspCount) * 6);
    cuspCount++;
  }
  if (kind === 'point') srcNote = 'the emitter is the point on the rim, the element −b';
  else if (kind === 'beam') srcNote = 'a = 3: the emitter is at infinity, plane fronts from both sides';
  else if (cv) {
    const rho = Math.abs(cv.rho) / R;
    const ratio = Math.abs(m + 1) / Math.abs(m - 1);
    srcNote = `the emitter: the wavefront with its cusps on the mirror, a cycloid similar to the caustic (ratio ${ratio.toFixed(3)}), ${ratio < 1 ? 'inside' : 'outside'} the disk; the caustic: ${cv.nc} cusps at ${rho.toFixed(2)} R, light ${rho > 1.001 ? 'converges towards it' : 'diverges from it'}`;
  }
}

function packHuygens(n: number) {
  huyPower = 0;
  for (let i = 0; i < n; i++) {
    if (huyRe[i] === 0 && huyIm[i] === 0) continue;
    huyData.set([huyX[i], huyY[i], huyRe[i], huyIm[i]], huyCount * 4);
    huyPower += huyRe[i] * huyRe[i] + huyIm[i] * huyIm[i];
    huyCount++;
  }
  if (huyPower <= 0) huyPower = 1;
}

// The source marks lie outside the circle for a ≥ 4 (the cusps at
// R·(a−1)/(a−3)). When the sources are switched on or the map changes, the
// view zooms out until they fit — never in.
let srcFit = false;

function fitSources() {
  let maxR = 0;
  const n = spCount + cuspCount;
  for (let i = 0; i < n; i++) maxR = Math.max(maxR, Math.hypot(spData[i * 6], spData[i * 6 + 1]));
  if (maxR <= 0) return;
  const need = Math.min(1, 0.9 / maxR);
  if (state.zoom > need) setZoom(need, true);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}

function draw() {
  resize();
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;

  // Center the scene in the area left of the floating panel; a window too
  // narrow for that falls back to the full viewport.
  const occ = PANEL_OCCUPIED * dpr;
  let freeW = w - occ;
  let offX = -occ / w;
  if (freeW < 240 * dpr) {
    freeW = w;
    offX = 0;
  }
  const m = Math.min(freeW, h);

  // The offscreen pass has no MSAA; on low-dpi screens it supersamples 2×
  // instead and the linear-filtered tone-map pass box-downsamples.
  const ss = post && dpr < 1.5 ? 2 : 1;
  const usePost = ensureFbo(w * ss, h * ss);
  const flat = state.mode === 'fp';
  const scaleX = (m / w) * state.zoom;
  const scaleY = (m / h) * state.zoom;

  // Without the tone map the glow control falls back to scaling alpha.
  const alphaMul = usePost ? 1 : state.exposure;

  const chordAlpha =
    (state.mode === 'fp'
      ? Math.min(0.8, 0.12 + 30 / state.p)
      : Math.min(0.45, 0.025 + 7 / state.p2)) * alphaMul;

  const t = phase();
  const passes: Array<[WebGLBuffer, number]> = endsBLive
    ? [[endBufA, 1 - t], [endBufB, t]]
    : [[endBufA, 1]];

  // The wave field of the sources takes the half-size target; extensions
  // then draw at full size into the main pass.
  const huy = usePost && halfExt && !!gl2 && !!huyL && state.showSrc && state.waveOn && huyCount > 0 && flat;
  if (huy && gl2 && huyL) {
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, extFbo);
    gl.viewport(0, 0, extW, extH);
    gl.disable(gl.BLEND);
    gl.useProgram(huyL.prog);
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.bindTexture(gl2.TEXTURE_2D, huyTex);
    gl.uniform1i(huyL.el, 0);
    gl.uniform1i(huyL.count, huyCount);
    gl.uniform1f(huyL.invCount, 1 / huyCount);
    gl.uniform1f(huyL.k, TAU / (state.wave * R));
    gl.uniform1f(huyL.rMin, state.wave * R * 0.5);
    gl.uniform1f(huyL.invR, 1 / R);
    gl.uniform2f(huyL.scale, scaleX, scaleY);
    gl.uniform2f(huyL.offset, offX, 0);
    gl.uniform2f(huyL.size, extW, extH);
    // an incoherent sum of the lit elements lands near 0.5 before the tone map
    gl.uniform1f(huyL.norm, 0.5 / huyPower);
    gl.uniform3fv(huyL.tint, waveTint(state.wave));
    // only the quad's position attribute may stay enabled for this draw
    gl.disableVertexAttribArray(locPos);
    gl.disableVertexAttribArray(locColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.vertexAttribPointer(huyL.pos, 2, gl.FLOAT, false, 8, 0);
    gl.enableVertexAttribArray(huyL.pos);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(huyL.pos);
    gl.enable(gl.BLEND);
  }

  // Chords and extensions draw instanced; the extension geometry comes out
  // of the vertex shader, so a fade pass only rebinds the end buffer.
  const L = lineL;
  gl.useProgram(L.prog);
  gl.uniformMatrix3fv(L.rot, false, flat ? IDENT3 : rot);
  gl.uniform2f(L.scale, scaleX, scaleY);
  gl.uniform2f(L.offset, offX, 0);
  gl.uniform1f(L.dist, CAM_DIST);
  gl.uniform1f(L.rOut, R_OUT);
  gl.bindBuffer(gl.ARRAY_BUFFER, roleBuf);
  gl.vertexAttribPointer(L.role, 1, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(L.role);
  gl.bindBuffer(gl.ARRAY_BUFFER, startBuf);
  gl.vertexAttribPointer(L.start, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(L.start);
  setDivisor(L.start, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.vertexAttribPointer(L.colI, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(L.colI);
  setDivisor(L.colI, 1);
  gl.enableVertexAttribArray(L.end);
  setDivisor(L.end, 1);

  // Extensions render into the half-size target. Its 1-px line is twice as
  // wide after the linear upsample, so the alpha is halved to keep the
  // accumulated brightness of the full-size line.
  const extHalf = usePost && halfExt && state.showExt && state.showChords && !huy;
  if (extHalf && gl2) {
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, extFbo);
    gl.viewport(0, 0, extW, extH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const [buf, weight] of passes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(L.end, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(L.alpha, chordAlpha * 0.45 * 0.5 * weight);
      drawInstanced(2, 4);
    }
  }

  if (usePost && gl2) {
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w * ss, h * ss);
    gl.clearColor(0, 0, 0, 1); // the background is added after tone mapping
  } else {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.039, 0.047, 0.063, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);

  for (const [buf, weight] of passes) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(L.end, 3, gl.FLOAT, false, 0, 0);
    if (state.showExt && !extHalf && state.showChords) {
      gl.uniform1f(L.alpha, chordAlpha * 0.45 * weight);
      drawInstanced(2, 4);
    }
    if (state.showChords) {
      gl.uniform1f(L.alpha, chordAlpha * weight);
      drawInstanced(0, 2);
    }
  }

  if (state.showSrc && raysR.n + raysI.n > 0 && !huy) {
    // the scene's rays: the same pipeline over its instance sets; the wave
    // field replaces them when it is on
    const drawSet = (set: RaySet, alpha: number) => {
      if (set.n === 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, set.bs);
      gl.vertexAttribPointer(L.start, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, set.be);
      gl.vertexAttribPointer(L.end, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, set.bc);
      gl.vertexAttribPointer(L.colI, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(L.alpha, alpha);
      drawInstanced(0, 2, set.n);
    };
    // the scene has a fixed number of rays, so its brightness does not
    // follow p the way the chords' does
    const srcAlpha = 0.22 * alphaMul;
    if (state.showExt) {
      drawSet(outR, srcAlpha * 0.45);
      if (state.showIn) drawSet(outI, srcAlpha * 0.45);
    }
    drawSet(raysR, srcAlpha);
    if (state.showIn) drawSet(raysI, srcAlpha);
  }

  // restore non-instanced attribute state for the point and tone-map passes
  setDivisor(L.start, 0);
  setDivisor(L.colI, 0);
  setDivisor(L.end, 0);
  gl.disableVertexAttribArray(L.role);
  gl.disableVertexAttribArray(L.start);
  gl.disableVertexAttribArray(L.colI);
  gl.disableVertexAttribArray(L.end);
  gl.enableVertexAttribArray(locPos);
  gl.enableVertexAttribArray(locColor);
  gl.useProgram(prog);
  gl.uniformMatrix3fv(locRot, false, flat ? IDENT3 : rot);
  gl.uniform2f(locScale, scaleX, scaleY);
  gl.uniform2f(locOffset, offX, 0);
  gl.uniform1f(locDist, CAM_DIST);
  gl.uniform1f(locPoint, 0);

  if (flat) {
    bindAttribs(circleBuf);
    gl.uniform1f(locAlpha, 1);
    gl.drawArrays(gl.LINE_LOOP, 0, CIRCLE_SEG);
  }

  if (state.showPoints) {
    bindAttribs(pointBuf);
    // Dense point grids on the torus washed the image out; their alpha
    // falls with p so the surface stays a hint, not a light source.
    const pointAlpha = state.mode === 'fp' ? 1 : Math.min(1, 40 / state.p2) * alphaMul;
    gl.uniform1f(locAlpha, pointAlpha);
    gl.uniform1f(locPoint, 1);
    const size =
      state.mode === 'fp'
        ? Math.max(2, Math.min(7, 1200 / state.p))
        : Math.max(1.2, Math.min(5, 160 / state.p2));
    gl.uniform1f(locSize, size * dpr * (usePost ? ss : 1));
    gl.drawArrays(gl.POINTS, 0, pointCount);
  }

  if (usePost && gl2 && tmL) {
    const T = tmL;
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    gl2.viewport(0, 0, w, h);
    gl2.disable(gl2.BLEND);
    gl2.useProgram(T.prog);
    gl2.activeTexture(gl2.TEXTURE1);
    gl2.bindTexture(gl2.TEXTURE_2D, extTex);
    gl2.uniform1i(T.ext, 1);
    gl2.uniform1f(T.extOn, extHalf || huy ? 1 : 0);
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.bindTexture(gl2.TEXTURE_2D, fboTex);
    gl2.uniform1i(T.tex, 0);
    gl2.uniform2f(T.inv, 1 / w, 1 / h);
    gl2.uniform1f(T.exp, state.exposure);
    gl2.uniform3f(T.bg, 0.039, 0.047, 0.063);
    gl2.disableVertexAttribArray(locColor);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, quadBuf);
    gl2.vertexAttribPointer(T.pos, 2, gl2.FLOAT, false, 8, 0);
    gl2.enableVertexAttribArray(T.pos);
    gl2.drawArrays(gl2.TRIANGLES, 0, 3);
    gl2.enable(gl2.BLEND);
    gl2.enableVertexAttribArray(locColor);
  }

  if (state.showSrc && spCount + cuspCount > 0) {
    // the source marks go on top of the finished image, opaque, so that no
    // haze of chords can hide them: the curve as small dots, the point
    // sources as large ones
    if (usePost && gl2) {
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
    }
    gl.useProgram(prog);
    gl.uniformMatrix3fv(locRot, false, flat ? IDENT3 : rot);
    gl.uniform2f(locScale, scaleX, scaleY);
    gl.uniform2f(locOffset, offX, 0);
    gl.uniform1f(locDist, CAM_DIST);
    gl.uniform1f(locPoint, 1);
    gl.uniform1f(locAlpha, 1);
    gl.blendFunc(gl.ONE, gl.ZERO);
    bindAttribs(spBuf);
    if (spCount > 0) {
      gl.uniform1f(locSize, 2.5 * dpr);
      gl.drawArrays(gl.POINTS, 0, spCount);
    }
    if (cuspCount > 0) {
      gl.uniform1f(locSize, 8 * dpr);
      gl.drawArrays(gl.POINTS, spCount, cuspCount);
    }
    gl.blendFunc(gl.ONE, gl.ONE);
  }
}

// ---------- loop ----------

let last = performance.now();

// Frame time: the interval from a drawn frame to the next callback, which
// grows with the GPU's back-pressure; averaged over a few frames and shown
// in the panel a few times a second.
let drawnAt = -1;
let frameMs = 0;
let fpsShownAt = 0;
const fpsEl = document.getElementById('fps')!;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (drawnAt >= 0) {
    const sample = now - drawnAt;
    frameMs = frameMs > 0 ? frameMs * 0.7 + sample * 0.3 : sample;
    drawnAt = -1;
    if (now - fpsShownAt > 250) {
      fpsShownAt = now;
      fpsEl.textContent = `${(1000 / frameMs).toFixed(frameMs > 100 ? 1 : 0)} fps · ${frameMs.toFixed(0)} ms`;
    }
  }

  if (state.playing && !stepBlocked()) {
    animValue += dt * state.speed;
    const lim = wrapLimit();
    if (animValue >= lim) animValue -= lim;
    const nInt = Math.floor(animValue);
    if (state.stepMode === 'coef') {
      if (nInt !== armedValue()) {
        applyArmedInteger(nInt);
        syncPanel();
      }
    } else if (nInt !== walkInt) {
      let delta = nInt - walkInt;
      if (delta < 0) delta += lim;
      for (let i = 0; i < Math.min(delta, 4); i++) applyStep(1);
      walkInt = nInt;
      syncPanel();
    }
    panel.animValue = animValue; // phase strip in the panel
    dirty = true;
  }

  if (dirty) {
    rebuildScene();
    dirty = false;
    needsDraw = true;
  }
  if (needsDraw) {
    needsDraw = false;
    drawnAt = now;
    draw();
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', invalidate);

// Initial state from the URL query, e.g. ?mode=fp2&p=101&a1=1&play=1&speed=1.
// Unknown or malformed values fall back to the defaults.
function initFromQuery() {
  const q = new URLSearchParams(location.search);
  const num = (key: string): number | null => {
    const s = q.get(key);
    if (s === null || s === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  if (q.get('mode') === 'fp2') state.mode = 'fp2';
  const pq = num('p');
  if (pq !== null) {
    const lo = state.mode === 'fp' ? 2 : P2_MIN;
    const hi = state.mode === 'fp' ? P_MAX : P2_MAX;
    const p = nearestPrime(Math.min(hi, Math.max(lo, Math.round(pq))));
    if (state.mode === 'fp') state.p = p;
    else state.p2 = Math.max(P2_MIN, p);
  }
  for (const k of FP_KEYS) {
    const v = num(k);
    if (v !== null) state.fp[k] = mod(Math.round(v), state.p);
  }
  for (const k of FP2_KEYS) {
    const v = num(k);
    if (v !== null) state.fp2[k] = mod(Math.round(v), state.p2);
  }
  if (q.get('form') === 'exp') state.coefForm = 'exp';
  const nsq = num('ns');
  if (nsq !== null) queryNs = Math.round(nsq);
  const gq = q.get('g');
  if (gq) {
    const parts = gq.split(',').map(Number);
    if (parts.length === 2 && parts.every((v) => Number.isFinite(v) && v >= 0)) {
      queryG = [Math.round(parts[0]), Math.round(parts[1])];
    }
  }
  const sm = q.get('step');
  if (sm === 'add' || sm === 'mul' || sm === 'T' || sm === 'iter') state.stepMode = sm;
  const tq = q.get('t');
  if (tq) {
    const parts = tq.split(',').map(Number);
    if (parts.length === 4 && parts.every((v) => Number.isFinite(v))) {
      state.T = {
        a: Math.round(parts[0]),
        b: Math.round(parts[1]),
        c: Math.round(parts[2]),
        d: Math.round(parts[3]),
      };
    }
  }
  if (q.get('phase') === 'fade') state.phaseMode = 'fade';
  if (q.get('frame') === 'eigen') state.frame = 'eigen';
  queryArm = q.get('arm');
  if (q.get('chords') === '0') state.showChords = false;
  if (q.get('points') === '0') state.showPoints = false;
  if (q.get('ext') === '0') state.showExt = false;
  if (q.get('in') === '0') state.showIn = false;
  if (q.get('src') === '1') state.showSrc = true;
  const rays = num('rays');
  if (rays !== null) state.rays = Math.round(Math.min(8192, Math.max(64, rays)));
  const gl = num('glow');
  if (gl !== null) state.exposure = Math.min(2.5, Math.max(0.2, gl));
  const wv = num('wave');
  if (wv !== null && wv > 0 && state.showSrc) {
    state.waveOn = true;
    state.wave = Math.min(WAVE_MAX, Math.max(WAVE_MIN, wv));
  }
  const zm = num('zoom');
  if (zm !== null) state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zm));
  // the source marks may lie outside the frame: zoom out to them unless the
  // address fixes the zoom itself
  if (state.showSrc && zm === null) srcFit = true;
  if (q.get('play') === '1') state.playing = true;
  if (state.mode !== 'fp') {
    state.showSrc = false;
    state.waveOn = false;
    state.frame = 'value';
  }
  const sp = num('speed');
  if (sp !== null && sp > 0) state.speed = Math.min(4, sp);
}

initFromQuery();
ns = nonResidue(state.p2);
if (queryNs !== null && queryNs >= 2 && queryNs < state.p2 && isNonResidue(queryNs, state.p2)) {
  ns = queryNs;
}
invTab = invTable(state.p2);
nsFactors = primeFactors(state.p2 * state.p2 - 1);
gen = firstGenerator();
genIsDefault = true;
dlogTab = buildDlog();
if (
  queryG !== null &&
  queryG[0] < state.p2 &&
  queryG[1] < state.p2 &&
  isGenerator(queryG, ns, state.p2, nsFactors)
) {
  gen = queryG;
  genIsDefault = false;
  dlogTab = buildDlog();
}
rootP = primitiveRoot(state.p);
for (const k of ['a', 'b', 'c', 'd'] as const) state.T[k] = mod(state.T[k], curP());
if (queryArm !== null && state.stepMode === 'coef') {
  const a = queryArm;
  const letter = a === 'a' || a === 'b' || a === 'c' || a === 'd';
  if (state.mode === 'fp') {
    if (letter) state.animFp = a as FpKey;
  } else if (state.coefForm === 'exp') {
    if (letter) state.animFp2Exp = a as 'a' | 'b' | 'c' | 'd';
  } else if ((FP2_KEYS as readonly string[]).includes(a)) {
    state.animFp2 = a as Fp2Key;
  }
}
canvas.style.cursor = state.mode === 'fp2' ? 'grab' : 'default';
reallocBuffers();
rebuildPoints();
resetWalk();
syncPanel();
requestAnimationFrame(frame);
