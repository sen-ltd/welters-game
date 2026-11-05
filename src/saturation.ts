/**
 * Irie's p-saturations of Welter's game (J. Algebraic Combin. 48, 2018).
 *
 * W^m_{p,k}: same positions as Welter's game with m coins. A move lowers
 * between 1 and k − 1 coins at once (coins keep their identity, so two coins
 * may pass each other), and is legal iff
 *     ord_p(Σ (xⁱ − yⁱ)) = min ord_p(xⁱ − yⁱ)   over the coins that moved.
 * For p = 2, k = 2 this is Welter's game itself. Irie proves that for k large
 * enough (k = m + 1 always suffices) the Sprague–Grundy value is the base-p
 * b-tower of λ(X); the least such k is sat_p(W^m), known to be ≥ min(p, m + 1)
 * and unknown in general for 3 ≤ p ≤ m.
 *
 * Positions inside the window [0, n) are closed under moves, so every value
 * computed here is exact (not an approximation of the infinite strip).
 */

import { btower, ordp } from './welter.ts';

export type SatTable = {
  p: number;
  m: number;
  k: number;
  n: number;
  /** positions, each ascending, in an order where every option comes earlier */
  positions: Int32Array; // flattened, m per position
  sg: Uint16Array; // per position (same order)
  count: number;
};

/** binom[v][j] = C(v, j) */
function binomials(n: number, m: number): Float64Array[] {
  const b: Float64Array[] = [];
  for (let v = 0; v <= n; v++) {
    const row = new Float64Array(m + 2);
    row[0] = 1;
    for (let j = 1; j <= m + 1; j++) row[j] = v === 0 ? 0 : b[v - 1][j - 1] + b[v - 1][j];
    b.push(row);
  }
  return b;
}

/** all m-subsets of [0, n), ascending inside, sorted by coin sum */
function subsetsBySum(m: number, n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === m) {
      out.push([...cur]);
      return;
    }
    for (let v = start; v <= n - (m - cur.length); v++) {
      cur.push(v);
      rec(v + 1);
      cur.pop();
    }
  };
  rec(0);
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  return out.map((a) => [sum(a), a] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
}

export function saturationTable(p: number, m: number, k: number, n: number): SatTable {
  if (n > 31) throw new Error('window must fit in 31 bits');
  const subs = subsetsBySum(m, n);
  const count = subs.length;
  const positions = new Int32Array(count * m);
  const sg = new Uint16Array(count);
  // colex rank of an ascending m-set: Σ C(xᵢ, i + 1)
  const C = binomials(n, m);
  const value = new Int32Array(count).fill(-1); // rank → sg
  const ordTab = new Int8Array(n * m + 1);
  for (let d = 1; d < ordTab.length; d++) ordTab[d] = ordp(d, p);
  const seen = new Uint32Array(65536);
  let stamp = 0;
  const xs = new Int32Array(m);

  // recursion state
  const rec = (i: number, moved: number, used: number, minOrd: number, dsum: number) => {
    if (i === m) {
      if (moved === 0) return;
      if (ordTab[dsum] !== minOrd) return;
      // used is the bitmask of final squares; read them ascending
      let key = 0;
      let j = 1;
      let u = used;
      while (u) {
        const low = u & -u;
        key += C[31 - Math.clz32(low)][j++];
        u ^= low;
      }
      const v = value[key];
      if (v < 0) throw new Error('option evaluated before its value was known');
      seen[v] = stamp;
      return;
    }
    const x = xs[i];
    // stay
    if (!(used & (1 << x))) rec(i + 1, moved, used | (1 << x), minOrd, dsum);
    if (moved === k - 1) return;
    for (let y = 0; y < x; y++) {
      if (used & (1 << y)) continue;
      const o = ordTab[x - y];
      rec(i + 1, moved + 1, used | (1 << y), o < minOrd ? o : minOrd, dsum + (x - y));
    }
  };

  for (let idx = 0; idx < count; idx++) {
    const a = subs[idx];
    for (let i = 0; i < m; i++) {
      xs[i] = a[i];
      positions[idx * m + i] = a[i];
    }
    stamp++;
    // `used` holds the final squares of coins 0..i-1, so every collision
    // (moved onto moved, moved onto a coin that stays) is caught when the
    // later of the two coins is placed.
    rec(0, 0, 0, 127, 0);
    let v = 0;
    while (seen[v] === stamp) v++;
    sg[idx] = v;
    let r = 0;
    for (let i = 0; i < m; i++) r += C[a[i]][i + 1];
    value[r] = v;
  }
  return { p, m, k, n, positions, sg, count };
}

/** options of X in W^m_{p,k} as sets (slow, direct from the definition; for tests and the demo) */
export function satOptions(xs: readonly number[], p: number, k: number): number[][] {
  const m = xs.length;
  const out = new Map<string, number[]>();
  const fin: number[] = [];
  const rec = (i: number, moved: number, minOrd: number, dsum: number) => {
    if (i === m) {
      if (moved === 0 || new Set(fin).size !== m) return;
      if (ordp(dsum, p) !== minOrd) return;
      const s = [...fin].sort((a, b) => a - b);
      out.set(s.join(','), s);
      return;
    }
    fin.push(xs[i]);
    rec(i + 1, moved, minOrd, dsum);
    fin.pop();
    if (moved === k - 1) return;
    for (let y = 0; y < xs[i]; y++) {
      fin.push(y);
      rec(i + 1, moved + 1, Math.min(minOrd, ordp(xs[i] - y, p)), dsum + xs[i] - y);
      fin.pop();
    }
  };
  rec(0, 0, Infinity, 0);
  return [...out.values()];
}

/** every sub-diagram μ ⊆ λ (as partitions, λ itself included) */
export function subDiagrams(lambda: readonly number[]): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (i: number, max: number) => {
    if (i === lambda.length || max === 0) {
      out.push([...cur]);
      return;
    }
    for (let v = Math.min(max, lambda[i]); v >= 0; v--) {
      if (v === 0) {
        out.push([...cur]);
        continue;
      }
      cur.push(v);
      rec(i + 1, v);
      cur.pop();
    }
  };
  rec(0, Infinity);
  return out;
}

/** Irie's msg: the largest |μ| over sub-diagrams μ ⊆ λ with b_p(μ) = |μ| */
export function msg(lambda: readonly number[], p: number): number {
  let best = 0;
  for (const mu of subDiagrams(lambda)) {
    const s = mu.reduce((a, b) => a + b, 0);
    if (s > best && btower(mu, p) === s) best = s;
  }
  return best;
}
