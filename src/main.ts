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
import { ui, type Mode, type StepMode, type PhaseMode, type Layout } from './bus';
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
  layout: 'geom' as Layout,
  T: { a: 1, b: 1, c: 0, d: 1 },
  playing: false,
  speed: 0.5,
  showPoints: true,
  showExt: true,
  zoom: 1,
  exposure: 1,
};

let ns = nonResidue(state.p2); // i² in the current F_{p²}
let invTab = invTable(state.p2); // inverse table of F_p for the torus hot loop
let rootP = primitiveRoot(state.p); // generator of F*_p for the ×g walk and log layout

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
    if (state.layout === 'log') q.set('layout', 'log');
    const armDef = state.mode === 'fp' || state.coefForm === 'exp' ? 'a' : 'a0';
    if (state.stepMode === 'coef' && curAnimKey() !== armDef) q.set('arm', curAnimKey());
    if (!state.showPoints) q.set('points', '0');
    if (!state.showExt) q.set('ext', '0');
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
// exponential form gᵏ, the ×g steps and the log layout order.

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

// The same table for F_p over the primitive root, used by the log layout.
function buildDlogP(): Int32Array {
  const p = state.p;
  const t = new Int32Array(p);
  let a = 1;
  for (let k = 0; k < p - 1; k++) {
    t[a] = k + 1;
    a = (a * rootP) % p;
  }
  return t;
}

let dlogP = buildDlogP();

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
  panel.showPoints = state.showPoints;
  panel.showExt = state.showExt;
  panel.zoom = state.zoom;
  panel.exposure = state.exposure;
  panel.i2 = state.mode === 'fp2' ? ns : 0;
  panel.coefForm = state.mode === 'fp2' ? state.coefForm : 'cart';
  panel.gDisp = state.mode === 'fp' ? String(rootP) : fmtF2(gen);
  panel.expMax = state.p2 * state.p2 - 2;
  panel.stepMode = state.stepMode;
  panel.phaseMode = state.phaseMode;
  panel.layout = state.layout;
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

ui.rx.on(':mode', (m) => {
  if (m === state.mode) return;
  state.mode = m;
  canvas.style.cursor = m === 'fp2' ? 'grab' : 'default';
  reallocBuffers();
  rebuildPoints();
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':coef', (key, value) => {
  curCoefs()[key] = value;
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
  rebuildPoints(); // the log layout order follows the new generator
  resetWalk();
  dirty = true; // the basis {1, i} and with it the arithmetic changed
  syncPanel();
});

ui.rx.on(':g-step', (delta) => {
  if (state.mode !== 'fp2') return; // in F_p the generator is fixed
  stepGenerator(delta);
  rebuildPoints(); // the log layout order follows the new generator
  resetWalk();
  dirty = true;
  syncPanel();
});

ui.rx.on(':exp', (key, k) => {
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

ui.rx.on(':layout', (layout) => {
  state.layout = layout;
  rebuildPoints();
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
  invalidate();
  syncPanel();
});

ui.rx.on(':preset', (coefs) => {
  Object.assign(curCoefs(), coefs);
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

ui.rx.on(':zoom-reset', () => setZoom(1));

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

function setZoom(z: number) {
  state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  invalidate();
  syncPanel();
}

function applyP(p: number) {
  if (state.mode === 'fp') {
    state.p = p;
    rootP = primitiveRoot(p);
    dlogP = buildDlogP();
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
    if (aRole < 0.5) pos = aStart;
    else if (aRole < 1.5) pos = aEnd;
    else {
      vec3 u = d / len;
      if (aRole < 2.5) pos = aStart;
      else if (aRole < 3.5) pos = aStart - u * rayOut(aStart, -u);
      else if (aRole < 4.5) pos = aEnd;
      else pos = aEnd + u * rayOut(aEnd, u);
    }
  }
  vec3 v = uRot * pos;
  float w = (uDist - v.z) / uDist;
  gl_Position = vec4(v.xy * uScale + uOffset * w, 0.0, w);
  vColor = aColorI;
}
`;

const lineProg = createProgram(gl, LINE_VS, FS);
const locRole = gl.getAttribLocation(lineProg, 'aRole');
const locStart = gl.getAttribLocation(lineProg, 'aStart');
const locEnd = gl.getAttribLocation(lineProg, 'aEnd');
const locColI = gl.getAttribLocation(lineProg, 'aColorI');
const locLRot = gl.getUniformLocation(lineProg, 'uRot');
const locLScale = gl.getUniformLocation(lineProg, 'uScale');
const locLOffset = gl.getUniformLocation(lineProg, 'uOffset');
const locLDist = gl.getUniformLocation(lineProg, 'uDist');
const locLROut = gl.getUniformLocation(lineProg, 'uROut');
const locLAlpha = gl.getUniformLocation(lineProg, 'uAlpha');

const instAngle = gl2 ? null : gl.getExtension('ANGLE_instanced_arrays');
if (!gl2 && !instAngle) throw new Error('instanced rendering is not available');
let nInst = 0;

function setDivisor(loc: number, d: number) {
  if (gl2) gl2.vertexAttribDivisor(loc, d);
  else instAngle!.vertexAttribDivisorANGLE(loc, d);
}

function drawInstanced(first: number, nVerts: number) {
  if (gl2) gl2.drawArraysInstanced(gl.LINES, first, nVerts, nInst);
  else instAngle!.drawArraysInstancedANGLE(gl.LINES, first, nVerts, nInst);
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
uniform vec2 uInvSize;
uniform float uExposure;
uniform vec3 uBg;
void main() {
  vec3 c = texture2D(uTex, gl_FragCoord.xy * uInvSize).rgb;
  gl_FragColor = vec4(uBg + (1.0 - exp(-c * uExposure)), 1.0);
}
`;

let tmProg: WebGLProgram | null = null;
let locTmPos = 0;
let locTmTex: WebGLUniformLocation | null = null;
let locTmInv: WebGLUniformLocation | null = null;
let locTmExp: WebGLUniformLocation | null = null;
let locTmBg: WebGLUniformLocation | null = null;
let quadBuf: WebGLBuffer | null = null;
let fbo: WebGLFramebuffer | null = null;
let fboTex: WebGLTexture | null = null;
let fboW = 0;
let fboH = 0;

if (post && gl2) {
  tmProg = createProgram(gl2, TM_VS, TM_FS);
  locTmPos = gl2.getAttribLocation(tmProg, 'aPos');
  locTmTex = gl2.getUniformLocation(tmProg, 'uTex');
  locTmInv = gl2.getUniformLocation(tmProg, 'uInvSize');
  locTmExp = gl2.getUniformLocation(tmProg, 'uExposure');
  locTmBg = gl2.getUniformLocation(tmProg, 'uBg');
  quadBuf = gl2.createBuffer();
  gl2.bindBuffer(gl2.ARRAY_BUFFER, quadBuf);
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl2.STATIC_DRAW);
  fbo = gl2.createFramebuffer();
  fboTex = gl2.createTexture();
}

function ensureFbo(w: number, h: number): boolean {
  if (!post || !gl2) return false;
  if (fboW === w && fboH === h) return true;
  gl2.bindTexture(gl2.TEXTURE_2D, fboTex);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
  gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
  gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA16F, w, h, 0, gl2.RGBA, gl2.HALF_FLOAT, null);
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, fbo);
  gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, fboTex, 0);
  const ok = gl2.checkFramebufferStatus(gl2.FRAMEBUFFER) === gl2.FRAMEBUFFER_COMPLETE;
  gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
  if (!ok) {
    post = false;
    return false;
  }
  fboW = w;
  fboH = h;
  return true;
}

const roleBuf = gl.createBuffer()!;
const startBuf = gl.createBuffer()!;
const colorBuf = gl.createBuffer()!;
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

// Fills the point buffer and the position/color caches. In the log layout
// the nonzero elements are ordered by discrete log on a flat ring — powers
// of the generator march around it uniformly — and zero sits at the center.
function rebuildPoints() {
  if (state.mode === 'fp') {
    const p = state.p;
    posTab = new Float32Array(p * 3);
    colTab = new Float32Array(p * 3);
    const data = new Float32Array(p * 6);
    for (let x = 0; x < p; x++) {
      let px = 0;
      let py = 0;
      let cr = 0.45;
      let cg = 0.47;
      let cb = 0.5;
      if (state.layout === 'geom') {
        const a = angle(x, p);
        px = R * Math.cos(a);
        py = R * Math.sin(a);
        [cr, cg, cb] = hueColor(x / p);
      } else if (x !== 0) {
        const a = angle(dlogP[x] - 1, p - 1);
        px = R * Math.cos(a);
        py = R * Math.sin(a);
        [cr, cg, cb] = hueColor((dlogP[x] - 1) / (p - 1));
      }
      posTab.set([px, py, 0], x * 3);
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
  const m = p * p - 1;
  posTab = new Float32Array(p * p * 3);
  colTab = new Float32Array(p * p * 3);
  const data = new Float32Array(p * p * 6);
  let n = 0;
  for (let x = 0; x < p; x++) {
    for (let y = 0; y < p; y++) {
      let px = 0;
      let py = 0;
      let pz = 0;
      let cr = 0.45;
      let cg = 0.47;
      let cb = 0.5;
      if (state.layout === 'geom') {
        [px, py, pz] = torusPos((TAU * x) / p, (TAU * y) / p);
        [cr, cg, cb] = f2color(x, y, p);
      } else {
        const k = dlogTab[x * p + y];
        if (k !== 0) {
          const a = angle(k - 1, m);
          px = R * Math.cos(a);
          py = R * Math.sin(a);
          [cr, cg, cb] = hueColor((k - 1) / m);
        }
      }
      posTab.set([px, py, pz], n * 3);
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
  const log = state.layout === 'log';
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
        } else if (!log) {
          const ay = lerpAngle(angle(y0, p), angle(y1, p), t);
          ex = R * Math.cos(ay);
          ey = R * Math.sin(ay);
        } else if (y0 !== 0 && y1 !== 0) {
          // on the log ring interpolation runs over exponents
          const ay = lerpAngle(angle(dlogP[y0] - 1, p - 1), angle(dlogP[y1] - 1, p - 1), t);
          ex = R * Math.cos(ay);
          ey = R * Math.sin(ay);
        } else {
          // an endpoint is the zero element (ring center): interpolate linearly
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
  const q1 = p * p - 1;
  const log = state.layout === 'log';
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
      } else if (!log) {
        const th = lerpAngle(tau * w0x, tau * w1x, t);
        const ph = lerpAngle(tau * w0y, tau * w1y, t);
        const rho = R_MAJ + R_MIN * Math.cos(ph);
        ex = rho * Math.cos(th);
        ey = rho * Math.sin(th);
        ez = R_MIN * Math.sin(ph);
      } else {
        const k0 = dlogTab[w0x * p + w0y];
        const k1 = dlogTab[w1x * p + w1y];
        if (k0 !== 0 && k1 !== 0) {
          // on the log ring a ×g step is a uniform one-notch rotation
          const ay = lerpAngle(angle(k0 - 1, q1), angle(k1 - 1, q1), t);
          ex = R * Math.cos(ay);
          ey = R * Math.sin(ay);
          ez = 0;
        } else {
          const i0 = (w0x * p + w0y) * 3;
          const i1 = (w1x * p + w1y) * 3;
          ex = pos[i0] + (pos[i1] - pos[i0]) * t;
          ey = pos[i0 + 1] + (pos[i1 + 1] - pos[i0 + 1]) * t;
          ez = pos[i0 + 2] + (pos[i1 + 2] - pos[i0 + 2]) * t;
        }
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
}

// ---------- drawing ----------

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

  if (usePost && gl2) {
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w * ss, h * ss);
    gl.clearColor(0, 0, 0, 1); // the background is added after tone mapping
  } else {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.039, 0.047, 0.063, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog);
  const flat = state.mode === 'fp' || state.layout === 'log';
  gl.uniformMatrix3fv(locRot, false, flat ? IDENT3 : rot);
  gl.uniform2f(locScale, (m / w) * state.zoom, (m / h) * state.zoom);
  gl.uniform2f(locOffset, offX, 0);
  gl.uniform1f(locDist, CAM_DIST);
  gl.uniform1f(locPoint, 0);

  // Without the tone map the glow control falls back to scaling alpha.
  const alphaMul = usePost ? 1 : state.exposure;

  if (flat) {
    bindAttribs(circleBuf);
    gl.uniform1f(locAlpha, 1);
    gl.drawArrays(gl.LINE_LOOP, 0, CIRCLE_SEG);
  }

  const chordAlpha =
    (state.mode === 'fp'
      ? Math.min(0.8, 0.12 + 30 / state.p)
      : Math.min(0.45, 0.025 + 7 / state.p2)) * alphaMul;

  // Chords and extensions draw instanced; the extension geometry comes out
  // of the vertex shader, so a fade pass only rebinds the end buffer.
  gl.useProgram(lineProg);
  gl.uniformMatrix3fv(locLRot, false, flat ? IDENT3 : rot);
  gl.uniform2f(locLScale, (m / w) * state.zoom, (m / h) * state.zoom);
  gl.uniform2f(locLOffset, offX, 0);
  gl.uniform1f(locLDist, CAM_DIST);
  gl.uniform1f(locLROut, R_OUT);
  gl.bindBuffer(gl.ARRAY_BUFFER, roleBuf);
  gl.vertexAttribPointer(locRole, 1, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locRole);
  gl.bindBuffer(gl.ARRAY_BUFFER, startBuf);
  gl.vertexAttribPointer(locStart, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locStart);
  setDivisor(locStart, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
  gl.vertexAttribPointer(locColI, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locColI);
  setDivisor(locColI, 1);
  gl.enableVertexAttribArray(locEnd);
  setDivisor(locEnd, 1);

  const t = phase();
  const passes: Array<[WebGLBuffer, number]> = endsBLive
    ? [[endBufA, 1 - t], [endBufB, t]]
    : [[endBufA, 1]];
  for (const [buf, weight] of passes) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(locEnd, 3, gl.FLOAT, false, 0, 0);
    if (state.showExt) {
      gl.uniform1f(locLAlpha, chordAlpha * 0.45 * weight);
      drawInstanced(2, 4);
    }
    gl.uniform1f(locLAlpha, chordAlpha * weight);
    drawInstanced(0, 2);
  }

  // restore non-instanced attribute state for the point and tone-map passes
  setDivisor(locStart, 0);
  setDivisor(locColI, 0);
  setDivisor(locEnd, 0);
  gl.disableVertexAttribArray(locRole);
  gl.disableVertexAttribArray(locStart);
  gl.disableVertexAttribArray(locColI);
  gl.disableVertexAttribArray(locEnd);
  gl.enableVertexAttribArray(locPos);
  gl.enableVertexAttribArray(locColor);
  gl.useProgram(prog);

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

  if (usePost && gl2 && tmProg) {
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    gl2.viewport(0, 0, w, h);
    gl2.disable(gl2.BLEND);
    gl2.useProgram(tmProg);
    gl2.activeTexture(gl2.TEXTURE0);
    gl2.bindTexture(gl2.TEXTURE_2D, fboTex);
    gl2.uniform1i(locTmTex, 0);
    gl2.uniform2f(locTmInv, 1 / w, 1 / h);
    gl2.uniform1f(locTmExp, state.exposure);
    gl2.uniform3f(locTmBg, 0.039, 0.047, 0.063);
    gl2.disableVertexAttribArray(locColor);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, quadBuf);
    gl2.vertexAttribPointer(locTmPos, 2, gl2.FLOAT, false, 8, 0);
    gl2.enableVertexAttribArray(locTmPos);
    gl2.drawArrays(gl2.TRIANGLES, 0, 3);
    gl2.enable(gl2.BLEND);
    gl2.enableVertexAttribArray(locColor);
  }
}

// ---------- loop ----------

let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

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
  if (q.get('layout') === 'log') state.layout = 'log';
  queryArm = q.get('arm');
  if (q.get('points') === '0') state.showPoints = false;
  if (q.get('ext') === '0') state.showExt = false;
  const gl = num('glow');
  if (gl !== null) state.exposure = Math.min(2.5, Math.max(0.2, gl));
  const zm = num('zoom');
  if (zm !== null) state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zm));
  if (q.get('play') === '1') state.playing = true;
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
dlogP = buildDlogP();
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
