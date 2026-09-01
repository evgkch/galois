import { describe, it, expect } from 'vitest';
import {
  mod,
  isPrime,
  nearestPrime,
  nextPrime,
  prevPrime,
  powMod,
  modInverse,
  invTable,
  nonResidue,
  isNonResidue,
  primitiveRoot,
  primeFactors,
  f2add,
  f2sub,
  f2mul,
  f2inv,
  f2isZero,
  f2pow,
  isGenerator,
  mobius,
  f2mobius,
  type F2,
} from './field';

// Deterministic LCG: a failing case reproduces from the seed.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SMALL_PRIMES = [3, 7, 11, 31];
const LARGE_PRIMES = [257, 499, 1009];

// ---------- independent projective implementation ----------
// Reference evaluation on P¹ through homogeneous coordinates [u : v]. It
// shares no code with mobius()/f2mobius(), so agreement is a real check.

type Mat = [number, number, number, number];
type P1 = number | 'inf';

function evalP1(m: Mat, x: P1, p: number): P1 {
  const [a, b, c, d] = m;
  const u = x === 'inf' ? a : mod(a * x + b, p);
  const v = x === 'inf' ? c : mod(c * x + d, p);
  if (v === 0) return u === 0 ? 'inf' : 'inf'; // det ≠ 0 keeps [0:0] unreachable
  return mod(u * modInverse(v, p)!, p);
}

function matMul(m: Mat, n: Mat, p: number): Mat {
  return [
    mod(m[0] * n[0] + m[1] * n[2], p),
    mod(m[0] * n[1] + m[1] * n[3], p),
    mod(m[2] * n[0] + m[3] * n[2], p),
    mod(m[2] * n[1] + m[3] * n[3], p),
  ];
}

type MatQ = [F2, F2, F2, F2];
type P1Q = F2 | 'inf';

function evalP1Q(m: MatQ, z: P1Q, ns: number, p: number): P1Q {
  const [A, B, C, D] = m;
  const u = z === 'inf' ? A : f2add(f2mul(A, z, ns, p), B, p);
  const v = z === 'inf' ? C : f2add(f2mul(C, z, ns, p), D, p);
  if (f2isZero(v)) return 'inf';
  return f2mul(u, f2inv(v, ns, p)!, ns, p);
}

function matMulQ(m: MatQ, n: MatQ, ns: number, p: number): MatQ {
  const mul = (u: F2, v: F2) => f2mul(u, v, ns, p);
  const add = (u: F2, v: F2) => f2add(u, v, p);
  return [
    add(mul(m[0], n[0]), mul(m[1], n[2])),
    add(mul(m[0], n[1]), mul(m[1], n[3])),
    add(mul(m[2], n[0]), mul(m[3], n[2])),
    add(mul(m[2], n[1]), mul(m[3], n[3])),
  ];
}

// ---------- prime helpers ----------

describe('mod / primes', () => {
  it('mod normalizes negatives into [0, p)', () => {
    expect(mod(7, 5)).toBe(2);
    expect(mod(-3, 5)).toBe(2);
    expect(mod(-10, 5)).toBe(0);
    expect(mod(0, 5)).toBe(0);
  });

  it('isPrime agrees with a naive sieve up to 1000', () => {
    const sieve = new Array(1001).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i <= 1000; i++) {
      if (sieve[i]) for (let j = i * i; j <= 1000; j += i) sieve[j] = false;
    }
    for (let n = 0; n <= 1000; n++) expect(isPrime(n), `n=${n}`).toBe(sieve[n]);
    expect(isPrime(20011)).toBe(true);
    expect(isPrime(20009)).toBe(false);
  });

  it('nearest/next/prev prime', () => {
    expect(nearestPrime(1)).toBe(2);
    expect(nearestPrime(4)).toBe(3);
    expect(nearestPrime(9)).toBe(7);
    expect(nearestPrime(257)).toBe(257);
    expect(nextPrime(2)).toBe(3);
    expect(nextPrime(257)).toBe(263);
    expect(prevPrime(257)).toBe(251);
    expect(prevPrime(3)).toBe(2);
  });

  it('primeFactors returns the distinct prime divisors', () => {
    expect(primeFactors(1)).toEqual([]);
    expect(primeFactors(12)).toEqual([2, 3]);
    expect(primeFactors(97)).toEqual([97]);
    const n = 499 * 499 - 1;
    const fs = primeFactors(n);
    for (const q of fs) {
      expect(isPrime(q)).toBe(true);
      expect(n % q).toBe(0);
    }
    // the list is complete: dividing out all listed primes leaves 1
    let m = n;
    for (const q of fs) while (m % q === 0) m /= q;
    expect(m).toBe(1);
  });
});

describe('powMod / inverses', () => {
  it('powMod agrees with BigInt exponentiation', () => {
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const p = LARGE_PRIMES[i % LARGE_PRIMES.length];
      const b = Math.floor(r() * p);
      const e = Math.floor(r() * 5000);
      const want = Number(BigInt(b) ** BigInt(e) % BigInt(p));
      expect(powMod(b, e, p), `b=${b} e=${e} p=${p}`).toBe(want);
    }
  });

  it('every nonzero element of F_p is invertible; zero is not', () => {
    for (const p of [...SMALL_PRIMES, 257]) {
      expect(modInverse(0, p)).toBeNull();
      for (let x = 1; x < p; x++) {
        const inv = modInverse(x, p);
        expect(inv).not.toBeNull();
        expect(mod(x * inv!, p)).toBe(1);
      }
    }
    expect(modInverse(2, 4)).toBeNull(); // non-coprime with a composite modulus
  });

  it('invTable matches modInverse', () => {
    for (const p of [...SMALL_PRIMES, ...LARGE_PRIMES]) {
      const t = invTable(p);
      for (let x = 1; x < p; x++) expect(t[x], `p=${p} x=${x}`).toBe(modInverse(x, p));
    }
    const t = invTable(20011);
    const r = rng(2);
    for (let i = 0; i < 1000; i++) {
      const x = 1 + Math.floor(r() * 20010);
      expect(mod(x * t[x], 20011)).toBe(1);
    }
  });
});

describe('quadratic residues / generators of F_p', () => {
  it('exactly (p−1)/2 non-residues; nonResidue() is the smallest and has no root', () => {
    for (const p of [...SMALL_PRIMES, 257, 499]) {
      let count = 0;
      let smallest = 0;
      for (let n = 1; n < p; n++) {
        if (isNonResidue(n, p)) {
          count++;
          if (smallest === 0) smallest = n;
        }
      }
      expect(count).toBe((p - 1) / 2);
      expect(nonResidue(p)).toBe(smallest);
      for (let t = 0; t < p; t++) expect(mod(t * t, p)).not.toBe(nonResidue(p));
    }
  });

  it('primitiveRoot has exact multiplicative order p−1', () => {
    for (const p of [...SMALL_PRIMES, 257, 499, 20011]) {
      const g = primitiveRoot(p);
      expect(powMod(g, p - 1, p)).toBe(1);
      for (const q of primeFactors(p - 1)) {
        expect(powMod(g, (p - 1) / q, p), `p=${p} q=${q}`).not.toBe(1);
      }
    }
  });
});

describe('F_{p²} field axioms', () => {
  it('ring axioms, exhaustive for p = 3', () => {
    const p = 3;
    const ns = nonResidue(p);
    const els: F2[] = [];
    for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) els.push([x, y]);
    for (const u of els) {
      for (const v of els) {
        const uv = f2mul(u, v, ns, p);
        const vu = f2mul(v, u, ns, p);
        expect(uv).toEqual(vu);
        expect(f2sub(f2add(u, v, p), v, p)).toEqual(u);
        for (const w of els) {
          expect(f2mul(uv, w, ns, p)).toEqual(f2mul(u, f2mul(v, w, ns, p), ns, p));
          expect(f2mul(u, f2add(v, w, p), ns, p)).toEqual(
            f2add(f2mul(u, v, ns, p), f2mul(u, w, ns, p), p),
          );
        }
      }
    }
  });

  it('sampled ring axioms for larger p', () => {
    const r = rng(3);
    for (const p of [31, 257, 499]) {
      const ns = nonResidue(p);
      const rand = (): F2 => [Math.floor(r() * p), Math.floor(r() * p)];
      for (let i = 0; i < 300; i++) {
        const [u, v, w] = [rand(), rand(), rand()];
        expect(f2mul(u, v, ns, p)).toEqual(f2mul(v, u, ns, p));
        expect(f2mul(f2mul(u, v, ns, p), w, ns, p)).toEqual(
          f2mul(u, f2mul(v, w, ns, p), ns, p),
        );
        expect(f2mul(u, f2add(v, w, p), ns, p)).toEqual(
          f2add(f2mul(u, v, ns, p), f2mul(u, w, ns, p), p),
        );
      }
    }
  });

  it('every nonzero element inverts, exhaustively up to p = 31', () => {
    for (const p of SMALL_PRIMES) {
      const ns = nonResidue(p);
      expect(f2inv([0, 0], ns, p)).toBeNull();
      for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
          if (x === 0 && y === 0) continue;
          const inv = f2inv([x, y], ns, p);
          expect(inv).not.toBeNull();
          expect(f2mul([x, y], inv!, ns, p)).toEqual([1, 0]);
        }
      }
    }
  });

  it('the norm is multiplicative and vanishes only at zero', () => {
    const r = rng(4);
    for (const p of [7, 31, 257]) {
      const ns = nonResidue(p);
      const N = (z: F2) => mod(z[0] * z[0] - ns * z[1] * z[1], p);
      for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
          expect(N([x, y]) === 0).toBe(x === 0 && y === 0);
        }
      }
      for (let i = 0; i < 300; i++) {
        const u: F2 = [Math.floor(r() * p), Math.floor(r() * p)];
        const v: F2 = [Math.floor(r() * p), Math.floor(r() * p)];
        expect(N(f2mul(u, v, ns, p))).toBe(mod(N(u) * N(v), p));
      }
    }
  });

  it('Frobenius: z^p is the conjugate x − yi', () => {
    for (const p of SMALL_PRIMES) {
      const ns = nonResidue(p);
      for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
          expect(f2pow([x, y], p, ns, p)).toEqual([x, mod(-y, p)]);
        }
      }
    }
  });

  it('Fermat: z^(p²−1) = 1 for nonzero z', () => {
    const p = 7;
    const ns = nonResidue(p);
    for (let x = 0; x < p; x++) {
      for (let y = 0; y < p; y++) {
        if (x === 0 && y === 0) continue;
        expect(f2pow([x, y], p * p - 1, ns, p)).toEqual([1, 0]);
      }
    }
  });

  it('f2pow agrees with iterated multiplication', () => {
    const p = 31;
    const ns = nonResidue(p);
    const z: F2 = [5, 17];
    let acc: F2 = [1, 0];
    for (let k = 0; k < 200; k++) {
      expect(f2pow(z, k, ns, p)).toEqual(acc);
      acc = f2mul(acc, z, ns, p);
    }
  });
});

describe('generators of F_{p²}*', () => {
  // Euler's totient, naively.
  function phi(n: number): number {
    let out = 1;
    let m = n;
    for (let d = 2; d * d <= m; d++) {
      if (m % d === 0) {
        let pk = 1;
        while (m % d === 0) {
          m /= d;
          pk *= d;
        }
        out *= pk - pk / d;
      }
    }
    if (m > 1) out *= m - 1;
    return out;
  }

  it('the number of generators is φ(p²−1)', () => {
    for (const p of [3, 7, 11]) {
      const ns = nonResidue(p);
      const factors = primeFactors(p * p - 1);
      let count = 0;
      for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
          if (isGenerator([x, y], ns, p, factors)) count++;
        }
      }
      expect(count, `p=${p}`).toBe(phi(p * p - 1));
    }
  });

  it('powers of a generator enumerate every nonzero element exactly once', () => {
    const p = 7;
    const ns = nonResidue(p);
    const factors = primeFactors(p * p - 1);
    let gen: F2 | null = null;
    outer: for (let x = 0; x < p; x++) {
      for (let y = 0; y < p; y++) {
        if (isGenerator([x, y], ns, p, factors)) {
          gen = [x, y];
          break outer;
        }
      }
    }
    expect(gen).not.toBeNull();
    const seen = new Set<number>();
    let acc: F2 = [1, 0];
    for (let k = 0; k < p * p - 1; k++) {
      seen.add(acc[0] * p + acc[1]);
      acc = f2mul(acc, gen!, ns, p);
    }
    expect(acc).toEqual([1, 0]); // closes exactly at the group order
    expect(seen.size).toBe(p * p - 1);
  });
});

describe('Möbius maps over F_p', () => {
  it('mobius agrees with the projective reference and satisfies w·(cx+d) = ax+b', () => {
    const r = rng(5);
    for (const p of [7, 31, 257]) {
      for (let i = 0; i < 50; i++) {
        const m: Mat = [0, 0, 0, 0].map(() => Math.floor(r() * p)) as unknown as Mat;
        if (mod(m[0] * m[3] - m[1] * m[2], p) === 0) continue;
        for (let x = 0; x < p; x++) {
          const got = mobius(x, m[0], m[1], m[2], m[3], p);
          const ref = evalP1(m, x, p);
          expect(got === null ? 'inf' : got, `p=${p} m=${m} x=${x}`).toEqual(ref);
          if (got !== null) {
            expect(mod(got * (m[2] * x + m[3]), p)).toBe(mod(m[0] * x + m[1], p));
          }
        }
      }
    }
  });

  it('composition is the matrix product, including through the pole', () => {
    const r = rng(6);
    const p = 31;
    for (let i = 0; i < 100; i++) {
      const A: Mat = [0, 0, 0, 0].map(() => Math.floor(r() * p)) as unknown as Mat;
      const B: Mat = [0, 0, 0, 0].map(() => Math.floor(r() * p)) as unknown as Mat;
      if (mod(A[0] * A[3] - A[1] * A[2], p) === 0) continue;
      if (mod(B[0] * B[3] - B[1] * B[2], p) === 0) continue;
      const AB = matMul(A, B, p);
      const points: P1[] = ['inf'];
      for (let x = 0; x < p; x++) points.push(x);
      for (const x of points) {
        expect(evalP1(AB, x, p)).toEqual(evalP1(A, evalP1(B, x, p), p));
      }
    }
  });

  it('a nondegenerate map permutes the p+1 points of P¹', () => {
    const r = rng(7);
    const p = 31;
    for (let i = 0; i < 50; i++) {
      const m: Mat = [0, 0, 0, 0].map(() => Math.floor(r() * p)) as unknown as Mat;
      if (mod(m[0] * m[3] - m[1] * m[2], p) === 0) continue;
      const images = new Set<string>();
      images.add(String(evalP1(m, 'inf', p)));
      for (let x = 0; x < p; x++) images.add(String(evalP1(m, x, p)));
      expect(images.size).toBe(p + 1);
    }
  });
});

describe('Möbius maps over F_{p²}', () => {
  function randMat(r: () => number, p: number, ns: number): MatQ | null {
    const e = (): F2 => [Math.floor(r() * p), Math.floor(r() * p)];
    const m: MatQ = [e(), e(), e(), e()];
    const det = f2sub(f2mul(m[0], m[3], ns, p), f2mul(m[1], m[2], ns, p), p);
    return f2isZero(det) ? null : m;
  }

  it('f2mobius agrees with the projective reference', () => {
    const r = rng(8);
    for (const p of [7, 31]) {
      const ns = nonResidue(p);
      for (let i = 0; i < 20; i++) {
        const m = randMat(r, p, ns);
        if (!m) continue;
        for (let x = 0; x < p; x++) {
          for (let y = 0; y < p; y++) {
            const got = f2mobius([x, y], m[0], m[1], m[2], m[3], ns, p);
            const ref = evalP1Q(m, [x, y], ns, p);
            expect(got === null ? 'inf' : got, `p=${p} z=${x}+${y}i`).toEqual(ref);
          }
        }
      }
    }
  });

  it('composition is the matrix product over F_{p²}', () => {
    const r = rng(9);
    const p = 11;
    const ns = nonResidue(p);
    for (let i = 0; i < 40; i++) {
      const A = randMat(r, p, ns);
      const B = randMat(r, p, ns);
      if (!A || !B) continue;
      const AB = matMulQ(A, B, ns, p);
      const points: P1Q[] = ['inf'];
      for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) points.push([x, y]);
      for (const z of points) {
        expect(evalP1Q(AB, z, ns, p)).toEqual(evalP1Q(A, evalP1Q(B, z, ns, p), ns, p));
      }
    }
  });

  it('a nondegenerate map permutes the p²+1 points of P¹(F_{p²})', () => {
    const r = rng(10);
    const p = 7;
    const ns = nonResidue(p);
    for (let i = 0; i < 20; i++) {
      const m = randMat(r, p, ns);
      if (!m) continue;
      const images = new Set<string>();
      images.add(JSON.stringify(evalP1Q(m, 'inf', ns, p)));
      for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
          images.add(JSON.stringify(evalP1Q(m, [x, y], ns, p)));
        }
      }
      expect(images.size).toBe(p * p + 1);
    }
  });
});

describe('the inlined hot-loop arithmetic (rebuildChordsFp2)', () => {
  // Verbatim replica of the scalar Möbius evaluation from src/main.ts.
  function inline(
    x: number, y: number,
    a0: number, a1: number, b0: number, b1: number,
    c0: number, c1: number, d0: number, d1: number,
    ns: number, p: number, inv: Int32Array,
  ): F2 | null {
    const de0 = (c0 * x + ns * c1 * y + d0) % p;
    const de1 = (c0 * y + c1 * x + d1) % p;
    let nrm = (de0 * de0 - ns * de1 * de1) % p;
    if (nrm < 0) nrm += p;
    if (nrm === 0) return null;
    const ninv = inv[nrm];
    const di0 = (de0 * ninv) % p;
    const di1 = (((p - de1) % p) * ninv) % p;
    const nu0 = (a0 * x + ns * a1 * y + b0) % p;
    const nu1 = (a0 * y + a1 * x + b1) % p;
    return [(nu0 * di0 + ns * nu1 * di1) % p, (nu0 * di1 + nu1 * di0) % p];
  }

  it('matches f2mobius on random inputs across the full p range', () => {
    const r = rng(11);
    for (const p of [3, 31, 257, 499]) {
      const ns = nonResidue(p);
      const inv = invTable(p);
      for (let i = 0; i < 2000; i++) {
        const v = () => Math.floor(r() * p);
        const [x, y, a0, a1, b0, b1, c0, c1, d0, d1] =
          [v(), v(), v(), v(), v(), v(), v(), v(), v(), v()];
        const ref = f2mobius([x, y], [a0, a1], [b0, b1], [c0, c1], [d0, d1], ns, p);
        const got = inline(x, y, a0, a1, b0, b1, c0, c1, d0, d1, ns, p, inv);
        expect(got, `p=${p} z=${x}+${y}i`).toEqual(ref);
      }
    }
  });

  it('the inlined ×g step matches f2mul', () => {
    const r = rng(12);
    const p = 499;
    const ns = nonResidue(p);
    for (let i = 0; i < 2000; i++) {
      const u = Math.floor(r() * p);
      const v = Math.floor(r() * p);
      const g0 = Math.floor(r() * p);
      const g1 = Math.floor(r() * p);
      const w0 = (u * g0 + ns * (v * g1)) % p;
      const w1 = (u * g1 + v * g0) % p;
      expect([w0, w1]).toEqual(f2mul([u, v], [g0, g1], ns, p));
    }
  });

  it('intermediate products stay inside the double-precision integer range', () => {
    // The worst product in the hot loop is ns·c1·y ≤ (p−1)³ at p = P2_MAX.
    const p = 499;
    expect(Math.pow(p - 1, 3)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    // and the norm term de0² ≤ (p−1)² plus ns·de1² stays far below 2⁵³ too
    expect((p - 1) ** 2 * (p - 1)).toBeLessThan(2 ** 53);
  });
});
