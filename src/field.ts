// Arithmetic mod p. Intermediate products never exceed p², so double
// precision is sufficient for p ≤ 20011.

export function mod(n: number, p: number): number {
  const r = n % p;
  return r < 0 ? r + p : r;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false;
  }
  return true;
}

export function nearestPrime(n: number): number {
  if (n <= 2) return 2;
  for (let k = 0; ; k++) {
    if (n - k >= 2 && isPrime(n - k)) return n - k;
    if (isPrime(n + k)) return n + k;
  }
}

export function nextPrime(n: number): number {
  for (let k = n + 1; ; k++) {
    if (isPrime(k)) return k;
  }
}

export function prevPrime(n: number): number {
  for (let k = n - 1; k >= 2; k--) {
    if (isPrime(k)) return k;
  }
  return 2;
}

// Table of every inverse mod a prime p in O(p): inv[i] = −⌊p/i⌋·inv[p mod i].
// Rebuilding chords calls for an inverse per point per frame; the table
// replaces an extended-Euclid run with one lookup.
export function invTable(p: number): Int32Array {
  const inv = new Int32Array(p);
  if (p > 1) inv[1] = 1;
  for (let i = 2; i < p; i++) {
    inv[i] = mod(-Math.floor(p / i) * inv[p % i], p);
  }
  return inv;
}

// Extended Euclid. Returns null when the element is not invertible.
export function modInverse(a: number, p: number): number | null {
  a = mod(a, p);
  if (a === 0) return null;
  let r0 = a;
  let r1 = p;
  let s0 = 1;
  let s1 = 0;
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1) return null;
  return mod(s0, p);
}

export function powMod(base: number, exp: number, p: number): number {
  let r = 1;
  let b = mod(base, p);
  let e = exp;
  while (e > 0) {
    if (e & 1) r = mod(r * b, p);
    b = mod(b * b, p);
    e >>>= 1;
  }
  return r;
}

// ---------- F_{p²} = F_p(i) with i² = ns, a quadratic non-residue ----------
// Elements are pairs [re, im] meaning re + im·i. p must be an odd prime:
// in characteristic 2 every element is a square and x² − ns is reducible.

export type F2 = readonly [number, number];

// Smallest quadratic non-residue by Euler's criterion: ns^((p−1)/2) ≡ −1.
export function nonResidue(p: number): number {
  for (let n = 2; n < p; n++) {
    if (powMod(n, (p - 1) / 2, p) === p - 1) return n;
  }
  throw new Error(`no quadratic non-residue mod ${p}`);
}

export function f2add(u: F2, v: F2, p: number): F2 {
  return [mod(u[0] + v[0], p), mod(u[1] + v[1], p)];
}

export function f2sub(u: F2, v: F2, p: number): F2 {
  return [mod(u[0] - v[0], p), mod(u[1] - v[1], p)];
}

// (u0 + u1·i)(v0 + v1·i) = u0·v0 + ns·u1·v1 + (u0·v1 + u1·v0)·i
export function f2mul(u: F2, v: F2, ns: number, p: number): F2 {
  return [mod(u[0] * v[0] + ns * (u[1] * v[1]), p), mod(u[0] * v[1] + u[1] * v[0], p)];
}

export function f2isZero(u: F2): boolean {
  return u[0] === 0 && u[1] === 0;
}

// Inverse via the norm N(u) = u·ū = u0² − ns·u1² ∈ F_p. Because ns is a
// non-residue, N(u) = 0 only for u = 0, so every nonzero element inverts:
// u⁻¹ = (u0 − u1·i) / N(u).
export function f2inv(u: F2, ns: number, p: number): F2 | null {
  const n = mod(u[0] * u[0] - ns * (u[1] * u[1]), p);
  const ninv = modInverse(n, p);
  if (ninv === null) return null;
  return [mod(u[0] * ninv, p), mod(-u[1] * ninv, p)];
}

// Smallest generator of the cyclic group F*_p.
export function primitiveRoot(p: number): number {
  if (p === 2) return 1;
  const factors = primeFactors(p - 1);
  for (let r = 2; r < p; r++) {
    let ok = true;
    for (const q of factors) {
      if (powMod(r, (p - 1) / q, p) === 1) {
        ok = false;
        break;
      }
    }
    if (ok) return r;
  }
  return 1;
}

export function f2pow(u: F2, k: number, ns: number, p: number): F2 {
  let r: F2 = [1, 0];
  let b = u;
  let e = k;
  while (e > 0) {
    if (e & 1) r = f2mul(r, b, ns, p);
    b = f2mul(b, b, ns, p);
    e >>>= 1;
  }
  return r;
}

export function isNonResidue(n: number, p: number): boolean {
  return powMod(n, (p - 1) / 2, p) === p - 1;
}

export function primeFactors(n: number): number[] {
  const out: number[] = [];
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    if (m % d === 0) {
      out.push(d);
      while (m % d === 0) m /= d;
    }
  }
  if (m > 1) out.push(m);
  return out;
}

// g generates F*_{p²} iff its order is p²−1: g^((p²−1)/q) ≠ 1 for every
// prime q dividing p²−1.
export function isGenerator(g: F2, ns: number, p: number, factors: number[]): boolean {
  if (f2isZero(g)) return false;
  const m = p * p - 1;
  for (const q of factors) {
    const r = f2pow(g, m / q, ns, p);
    if (r[0] === 1 && r[1] === 0) return false;
  }
  return true;
}

// w = (A·z + B) / (C·z + D) in F_{p²}. Returns null when the denominator is
// zero: the image of z is the point at infinity of the projective line.
export function f2mobius(
  z: F2,
  A: F2,
  B: F2,
  C: F2,
  D: F2,
  ns: number,
  p: number,
): F2 | null {
  const den = f2add(f2mul(C, z, ns, p), D, p);
  const dinv = f2inv(den, ns, p);
  if (dinv === null) return null;
  return f2mul(f2add(f2mul(A, z, ns, p), B, p), dinv, ns, p);
}

// f(x) = (a·x + b) / (c·x + d) mod p. Returns null when the denominator is
// zero: the image of x is the point at infinity of the projective line.
export function mobius(
  x: number,
  a: number,
  b: number,
  c: number,
  d: number,
  p: number,
): number | null {
  const inv = modInverse(c * x + d, p);
  if (inv === null) return null;
  return mod(mod(a * x + b, p) * inv, p);
}
