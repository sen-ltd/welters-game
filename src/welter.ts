/**
 * Welter's game.
 *
 * Coins sit on squares 0, 1, 2, … of a strip, at most one per square. A move
 * slides one coin to any empty square with a lower number (jumping over other
 * coins is fine). Whoever cannot move loses. Equivalently: Nim in which no two
 * heaps may ever have the same size.
 *
 * Sato's view: read the strip as a Maya diagram. The coins at x¹ > x² > … > xᵐ
 * give the partition λᵢ = xⁱ − (m − i) (i = 1..m, zeros dropped), and sliding a
 * coin from a to an empty b < a removes a rim hook of length a − b.
 *
 * A position is a strictly increasing array of non-negative integers
 * ("set representation"), never mutated in place.
 */

export type Pos = readonly number[];

/** N₂(x) = x ⊕ (x − 1) = 2^(ord₂ x + 1) − 1 for x ≠ 0; symmetric in ±x. */
export function n2(x: number): number {
  const d = Math.abs(x);
  if (d === 0) throw new Error('n2(0) is undefined');
  return d ^ (d - 1);
}

export function normalize(xs: readonly number[]): number[] {
  const s = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < s.length; i++) {
    if (!Number.isInteger(s[i]) || s[i] < 0) throw new Error(`bad square ${s[i]}`);
    if (i > 0 && s[i] === s[i - 1]) throw new Error(`two coins on square ${s[i]}`);
  }
  return s;
}

/** Welter (1954): x¹ ⊕ … ⊕ xᵐ ⊕ (⊕_{i<j} N₂(xⁱ − xʲ)). */
export function welterFormula(xs: Pos): number {
  let g = 0;
  for (let i = 0; i < xs.length; i++) {
    g ^= xs[i];
    for (let j = i + 1; j < xs.length; j++) g ^= n2(xs[i] - xs[j]);
  }
  return g;
}

/** λ(X): partition (largest part first, zeros dropped). */
export function partitionOf(xs: Pos): number[] {
  const m = xs.length;
  const out: number[] = [];
  // xs ascending: xs[m-1] is the largest coin, i = 1
  for (let i = 1; i <= m; i++) {
    const part = xs[m - i] - (m - i);
    if (part > 0) out.push(part);
  }
  return out;
}

/** The position with m = λ.length coins whose partition is λ (no coin is idle). */
export function positionOf(lambda: readonly number[]): number[] {
  const m = lambda.length;
  const xs: number[] = [];
  for (let i = 1; i <= m; i++) xs.push(lambda[i - 1] + (m - i));
  return xs.reverse();
}

export function size(lambda: readonly number[]): number {
  let s = 0;
  for (const p of lambda) s += p;
  return s;
}

/** conjugate partition */
export function conjugate(lambda: readonly number[]): number[] {
  const out: number[] = [];
  const w = lambda.length ? lambda[0] : 0;
  for (let j = 0; j < w; j++) {
    let c = 0;
    while (c < lambda.length && lambda[c] > j) c++;
    out.push(c);
  }
  return out;
}

/** hook lengths, row by row: hooks[i][j] for cell (i, j), 0-indexed */
export function hookLengths(lambda: readonly number[]): number[][] {
  const conj = conjugate(lambda);
  return lambda.map((row, i) => {
    const r: number[] = [];
    for (let j = 0; j < row; j++) r.push(row - j - 1 + (conj[j] - i - 1) + 1);
    return r;
  });
}

/** Sato: ⊕ over all cells of N₂(hook length). */
export function hookFormula(lambda: readonly number[]): number {
  let g = 0;
  for (const row of hookLengths(lambda)) for (const h of row) g ^= h ^ (h - 1);
  return g;
}

/** p-adic order of a positive integer */
export function ordp(x: number, p: number): number {
  let k = 0;
  while (x % p === 0) {
    x /= p;
    k++;
  }
  return k;
}

/**
 * Irie's b-tower: digit L (base p) is the number of hooks whose length is a
 * multiple of p^L, taken mod p. For p = 2 this is the Sprague–Grundy value of
 * Welter's game; for p > 2 it is the value of a p-saturation of it.
 */
export function btower(lambda: readonly number[], p: number): number {
  const counts: number[] = [];
  for (const row of hookLengths(lambda))
    for (const h of row) {
      const o = ordp(h, p);
      for (let L = 0; L <= o; L++) counts[L] = (counts[L] ?? 0) + 1;
    }
  let v = 0;
  let pw = 1;
  for (let L = 0; L < counts.length; L++) {
    v += (counts[L] % p) * pw;
    pw *= p;
  }
  return v;
}

/** base-p digit-wise addition / subtraction without carry */
export function pAdd(a: number, b: number, p: number, sign = 1): number {
  let v = 0;
  let pw = 1;
  while (a > 0 || b > 0) {
    const d = (((a % p) + sign * (b % p)) % p + p) % p;
    v += d * pw;
    pw *= p;
    a = Math.floor(a / p);
    b = Math.floor(b / p);
  }
  return v;
}

/** N_p(x) = x ⊖_p (x − 1) = Σ_{L=0}^{ord_p x} p^L (x > 0) */
export function np(x: number, p: number): number {
  return pAdd(x, x - 1, p, -1);
}

/** Irie's base-p Welter formula x¹ ⊕ₚ … ⊕ₚ xᵐ ⊖ₚ (⊕ₚ_{i<j} Nₚ(xⁱ − xʲ)), xⁱ descending */
export function welterFormulaP(xs: Pos, p: number): number {
  const d = [...xs].sort((a, b) => b - a);
  let s = 0;
  for (const x of d) s = pAdd(s, x, p);
  let t = 0;
  for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) t = pAdd(t, np(d[i] - d[j], p), p);
  return pAdd(s, t, p, -1);
}

export type Move = { from: number; to: number };

export function legalMoves(xs: Pos): Move[] {
  const occ = new Set(xs);
  const out: Move[] = [];
  for (const a of xs) for (let b = a - 1; b >= 0; b--) if (!occ.has(b)) out.push({ from: a, to: b });
  return out;
}

export function applyMove(xs: Pos, mv: Move): number[] {
  if (!xs.includes(mv.from)) throw new Error(`no coin on ${mv.from}`);
  if (mv.to < 0 || mv.to >= mv.from || xs.includes(mv.to)) throw new Error(`illegal move ${mv.from}→${mv.to}`);
  return normalize(xs.map((x) => (x === mv.from ? mv.to : x)));
}

export const grundy = welterFormula;

/** every move to a position of value 0 (empty iff the position is a P-position) */
export function winningMoves(xs: Pos): Move[] {
  return legalMoves(xs).filter((mv) => welterFormula(applyMove(xs, mv)) === 0);
}

/**
 * Brute-force Sprague–Grundy values of every coin set inside [0, n), indexed
 * by bitmask (bit a set ⇔ coin on square a). A move lowers the mask, so one
 * increasing pass is a valid evaluation order.
 */
export function bruteForceTable(n: number): Uint8Array {
  if (n > 26) throw new Error('window too large');
  const N = 1 << n;
  const g = new Uint8Array(N);
  const seen = new Uint32Array(256);
  let stamp = 0;
  for (let mask = 1; mask < N; mask++) {
    stamp++;
    for (let a = 1; a < n; a++) {
      const ba = 1 << a;
      if (!(mask & ba)) continue;
      const without = mask ^ ba;
      for (let b = 0; b < a; b++) {
        const bb = 1 << b;
        if (mask & bb) continue;
        seen[g[without | bb]] = stamp;
      }
    }
    let v = 0;
    while (seen[v] === stamp) v++;
    g[mask] = v;
  }
  return g;
}

export function maskToPos(mask: number): number[] {
  const out: number[] = [];
  for (let a = 0; mask >> a; a++) if ((mask >> a) & 1) out.push(a);
  return out;
}

/** 2-adic order of n! (Legendre) */
export function ord2Factorial(n: number): number {
  let s = 0;
  for (let q = n >> 1; q > 0; q >>= 1) s += q;
  return s;
}

/** degree of the irreducible character χ^λ of S_|λ| (hook length formula), exact */
export function degree(lambda: readonly number[]): bigint {
  const n = size(lambda);
  let num = 1n;
  for (let k = 2; k <= n; k++) num *= BigInt(k);
  let den = 1n;
  for (const row of hookLengths(lambda)) for (const h of row) den *= BigInt(h);
  return num / den;
}

/** χ^λ(1) is odd ⇔ ord₂ n! = Σ ord₂(hook) */
export function degreeIsOdd(lambda: readonly number[]): boolean {
  let s = 0;
  for (const row of hookLengths(lambda)) for (const h of row) s += ordp(h, 2);
  return s === ord2Factorial(size(lambda));
}

/** all partitions of n, largest part first, in reverse-lexicographic order */
export function* partitions(n: number, maxPart = n): Generator<number[]> {
  if (n === 0) {
    yield [];
    return;
  }
  for (let k = Math.min(n, maxPart); k >= 1; k--) for (const rest of partitions(n - k, k)) yield [k, ...rest];
}
