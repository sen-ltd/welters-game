/**
 * Measurements behind the README and the articles. Every subcommand writes a
 * JSON file under runs/ and prints a one-line summary.
 *
 *   node tools/compute.mts brute <n>          every coin set in [0, n): brute-force mex vs the formulas
 *   node tools/compute.mts full <nmax>        partitions of n ≤ nmax with sg = n vs odd degree vs OEIS A059867
 *   node tools/compute.mts sat <p> <m> <k> <n>  W^m_{p,k} on [0, n) vs Irie's b-tower
 *   node tools/compute.mts msg <p> <nmax>     Irie's Theorem 1 sub-diagram claim for every partition
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { bruteForceTable, btower, degreeIsOdd, hookFormula, partitionOf, maskToPos } from '../src/welter.ts';
import { saturationTable } from '../src/saturation.ts';

mkdirSync('runs', { recursive: true });
const [cmd, ...args] = process.argv.slice(2);
const t0 = Date.now();
const secs = () => +((Date.now() - t0) / 1000).toFixed(1);
const save = (name: string, obj: unknown) => writeFileSync(`runs/${name}.json`, JSON.stringify(obj, null, 1) + '\n');

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Welter's pairwise formula straight from the mask */
function welterMask(mask: number, n: number): number {
  let g = 0;
  for (let a = 0; a < n; a++) {
    if (!((mask >> a) & 1)) continue;
    g ^= a;
    for (let b = 0; b < a; b++) if ((mask >> b) & 1) { const d = a - b; g ^= d ^ (d - 1); }
  }
  return g;
}

/** hook form from the strip: one hook per (coin a, empty b < a), length a − b */
function hooksMask(mask: number, n: number): { g: number; size: number } {
  let g = 0;
  let size = 0;
  for (let a = 0; a < n; a++) {
    if (!((mask >> a) & 1)) continue;
    for (let b = 0; b < a; b++) if (!((mask >> b) & 1)) { const d = a - b; g ^= d ^ (d - 1); size++; }
  }
  return { g, size };
}

function readA059867(): number[] {
  const out: number[] = [0];
  for (const line of readFileSync('data/a059867-b.txt', 'utf8').split('\n')) {
    const m = line.match(/^(\d+)\s+(\d+)/);
    if (m) out[+m[1]] = +m[2];
  }
  return out;
}

if (cmd === 'brute') {
  const n = +args[0];
  const g = bruteForceTable(n);
  const tDp = secs();
  let welterBad = 0;
  let hookBad = 0;
  const pByCoins: number[] = new Array(n + 1).fill(0);
  const byCoins: number[] = new Array(n + 1).fill(0);
  let maxSg = 0;
  // full positions by |λ|, one canonical mask per partition (no coin on square 0)
  const partitionsBySize: number[] = new Array(n).fill(0);
  const fullBySize: number[] = new Array(n).fill(0);
  const firstBad: number[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const v = g[mask];
    if (v > maxSg) maxSg = v;
    const c = popcount(mask);
    byCoins[c]++;
    if (v === 0) pByCoins[c]++;
    if (welterMask(mask, n) !== v) { welterBad++; if (firstBad.length < 5) firstBad.push(maskToPos(mask)); }
    const h = hooksMask(mask, n);
    if (h.g !== v) hookBad++;
    if (!(mask & 1) && h.size < n) {
      partitionsBySize[h.size]++;
      if (v === h.size) fullBySize[h.size]++;
    }
  }
  // the partition-based hook formula and b-tower on a smaller window
  const small = Math.min(n, 18);
  let partBad = 0;
  for (let mask = 0; mask < 1 << small; mask++) {
    const lam = partitionOf(maskToPos(mask));
    if (hookFormula(lam) !== g[mask] || btower(lam, 2) !== g[mask]) partBad++;
  }
  const a = readA059867();
  const fullVsOeis = fullBySize.slice(1).map((v, i) => ({ n: i + 1, partitions: partitionsBySize[i + 1], full: v, oeis: a[i + 1], ok: v === a[i + 1] }));
  const res = {
    n, positions: 1 << n, dpSeconds: tDp, seconds: secs(), maxSg,
    welterFormulaMismatches: welterBad, hookFormulaMismatches: hookBad,
    partitionFormulaWindow: small, partitionFormulaMismatches: partBad, firstBad,
    pPositionsByCoins: pByCoins.map((p, c) => ({ coins: c, positions: byCoins[c], p })).filter((r) => r.positions > 0),
    fullVsOeis,
    fullAllMatch: fullVsOeis.every((r) => r.ok),
  };
  save(`brute-n${n}`, res);
  console.log(`brute n=${n}: ${res.positions} positions, welter≠${welterBad} hook≠${hookBad} partition≠${partBad}, full matches OEIS for n<${n}: ${res.fullAllMatch}, ${res.seconds}s`);
} else if (cmd === 'full') {
  const nmax = +args[0];
  const a = readA059867();
  const rows: { n: number; partitions: number; full: number; oddDegree: number; oeis: number; ok: boolean }[] = [];
  const parts = new Int32Array(nmax + 1);
  for (let n = 1; n <= nmax; n++) {
    let count = 0, full = 0, odd = 0, disagree = 0;
    // iterative enumeration of partitions of n (descending parts)
    let len = 1;
    parts[0] = n;
    for (;;) {
      count++;
      const lam = Array.from(parts.subarray(0, len));
      const sg = hookFormula(lam);
      const isFull = sg === n;
      const isOdd = degreeIsOdd(lam);
      if (isFull) full++;
      if (isOdd) odd++;
      if (isFull !== isOdd) disagree++;
      // next partition: find rightmost part > 1
      let i = len - 1;
      let rem = 0;
      while (i >= 0 && parts[i] === 1) { rem++; i--; }
      if (i < 0) break;
      parts[i]--;
      rem++;
      const k = parts[i];
      len = i + 1;
      while (rem > 0) { const take = Math.min(k, rem); parts[len++] = take; rem -= take; }
    }
    rows.push({ n, partitions: count, full, oddDegree: odd, oeis: a[n], ok: full === a[n] && odd === a[n] && disagree === 0 });
    if (n % 5 === 0) {
      console.log(`full n=${n} partitions=${count} full=${full} odd=${odd} oeis=${a[n]} ${secs()}s`);
      save('full', { nmax: n, seconds: secs(), allMatch: rows.every((r) => r.ok), rows });
    }
  }
  save('full', { nmax, seconds: secs(), allMatch: rows.every((r) => r.ok), rows });
  console.log(`full up to ${nmax}: all match ${rows.every((r) => r.ok)}, ${secs()}s`);
} else if (cmd === 'sat') {
  const [p, m, k, n] = args.map(Number);
  const t = saturationTable(p, m, k, n);
  const tDp = secs();
  let mismatches = 0;
  const examples: { x: number[]; sg: number; btower: number; size: number }[] = [];
  for (let i = 0; i < t.count; i++) {
    const x = Array.from(t.positions.subarray(i * m, i * m + m));
    const lam = partitionOf(x);
    const b = btower(lam, p);
    if (b !== t.sg[i]) {
      mismatches++;
      if (examples.length < 8) examples.push({ x, sg: t.sg[i], btower: b, size: lam.reduce((s, v) => s + v, 0) });
    }
  }
  const res = { p, m, k, n, positions: t.count, dpSeconds: tDp, seconds: secs(), mismatches, examples };
  save(`sat-p${p}-m${m}-k${k}-n${n}`, res);
  console.log(`sat p=${p} m=${m} k=${k} n=${n}: ${t.count} positions, ${mismatches} differ from the b-tower${examples[0] ? ` (first ${JSON.stringify(examples[0])})` : ''}, ${secs()}s`);
} else if (cmd === 'msg') {
  // Irie, Theorem 1: some sub-diagram μ ⊆ λ has |μ| = b(μ) = b(λ). Also msg(λ) = max |μ| over such μ.
  const p = +args[0];
  const nmax = +args[1];
  const key = (l: number[]) => l.join(',');
  const fullSet = new Map<string, number>(); // partition → b-tower
  const all: number[][][] = [];
  for (let n = 0; n <= nmax; n++) {
    const list: number[][] = [];
    const rec = (rem: number, max: number, cur: number[]) => {
      if (rem === 0) { list.push([...cur]); return; }
      for (let k = Math.min(rem, max); k >= 1; k--) { cur.push(k); rec(rem - k, k, cur); cur.pop(); }
    };
    rec(n, n, []);
    all.push(list);
    for (const l of list) fullSet.set(key(l), btower(l, p));
  }
  // reach[λ] = set of b-values v of sub-diagrams μ ⊆ λ with |μ| = b(μ) (as a bitset over v ≤ nmax)
  const reach = new Map<string, bigint>();
  let checked = 0, failures = 0;
  const fails: number[][] = [];
  for (let n = 0; n <= nmax; n++)
    for (const l of all[n]) {
      let bits = 0n;
      const b = fullSet.get(key(l))!;
      if (b === n) bits |= 1n << BigInt(n);
      // children: remove one corner cell
      for (let i = 0; i < l.length; i++) {
        if (i + 1 < l.length && l[i + 1] === l[i]) continue;
        const c = [...l];
        c[i]--;
        if (c[i] === 0) c.pop();
        bits |= reach.get(key(c))!;
      }
      reach.set(key(l), bits);
      checked++;
      if (!((bits >> BigInt(b)) & 1n)) { failures++; if (fails.length < 5) fails.push(l); }
    }
  const res = { p, nmax, partitions: checked, failures, fails, seconds: secs() };
  save(`msg-p${p}-n${nmax}`, res);
  console.log(`msg p=${p} n≤${nmax}: ${checked} partitions, ${failures} without the promised sub-diagram, ${secs()}s`);
} else {
  console.error('usage: compute.mts brute|full|sat|msg …');
  process.exit(2);
}
