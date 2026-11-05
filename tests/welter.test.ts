import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyMove, bruteForceTable, btower, conjugate, degree, degreeIsOdd, hookFormula, hookLengths, legalMoves, maskToPos,
  partitionOf, partitions, positionOf, size, welterFormula, welterFormulaP, winningMoves,
} from '../src/welter.ts';
import { msg, satOptions, saturationTable, subDiagrams } from '../src/saturation.ts';

const table14 = bruteForceTable(14);

describe("Welter's game", () => {
  it('one coin is a Nim heap', () => {
    for (let a = 0; a < 40; a++) expect(welterFormula([a])).toBe(a);
  });

  it('Welter, Sato (hooks) and the 2-adic hook count agree with brute-force mex on every coin set in [0, 14)', () => {
    let checked = 0;
    for (let mask = 0; mask < 1 << 14; mask++) {
      const x = maskToPos(mask);
      const lam = partitionOf(x);
      const g = table14[mask];
      expect(welterFormula(x)).toBe(g);
      expect(hookFormula(lam)).toBe(g);
      expect(btower(lam, 2)).toBe(g);
      expect(welterFormulaP(x, 2)).toBe(g);
      checked++;
    }
    expect(checked).toBe(16384);
  });

  it('a move from a to b removes a hook of length a − b', () => {
    const x = [1, 4, 5, 9, 11];
    const n = size(partitionOf(x));
    for (const mv of legalMoves(x)) expect(size(partitionOf(applyMove(x, mv)))).toBe(n - (mv.from - mv.to));
  });

  it('partition ↔ position round trip and the hook lengths of (4,3,1)', () => {
    for (const lam of partitions(9)) expect(partitionOf(positionOf(lam))).toEqual(lam);
    expect(hookLengths([4, 3, 1])).toEqual([[6, 4, 3, 1], [4, 2, 1], [1]]);
    expect(degree([4, 3, 1])).toBe(70n);
    expect(partitionOf([0, 1, 2, 5])).toEqual([2]); // idle coins at the bottom do not matter
  });

  it('winning moves exist exactly at non-zero positions and all lead to 0', () => {
    for (let mask = 0; mask < 1 << 11; mask++) {
      const x = maskToPos(mask);
      const w = winningMoves(x);
      expect(w.length > 0).toBe(table14[mask] !== 0);
      for (const mv of w) expect(welterFormula(applyMove(x, mv))).toBe(0);
    }
  });

  it('full positions (sg = |λ|) are the odd-degree characters, counted by OEIS A059867', () => {
    const oeis = readFileSync('data/a059867-b.txt', 'utf8').trim().split('\n').map((l) => +l.split(/\s+/)[1]);
    for (let n = 1; n <= 20; n++) {
      let full = 0;
      for (const lam of partitions(n)) {
        const isFull = hookFormula(lam) === n;
        expect(isFull).toBe(degreeIsOdd(lam));
        expect(degreeIsOdd(lam)).toBe(degree(lam) % 2n === 1n);
        if (isFull) full++;
      }
      expect(full).toBe(oeis[n - 1]);
    }
  });
});

describe("Irie's p-saturations", () => {
  it('base-p Welter formula equals the base-p hook count (p = 3, 5)', () => {
    for (const p of [3, 5])
      for (let mask = 0; mask < 1 << 12; mask++) {
        const x = maskToPos(mask);
        expect(welterFormulaP(x, p)).toBe(btower(partitionOf(x), p));
      }
  });

  it("the paper's move example: {3,4} → {0,1} is legal in W_{2,3} but not in Welter's game", () => {
    const key = (s: number[]) => s.join(',');
    expect(satOptions([3, 4], 2, 3).map(key)).toContain('0,1');
    expect(satOptions([3, 4], 2, 2).map(key)).not.toContain('0,1');
  });

  it('the fast table equals mex over options taken straight from the definition', () => {
    for (const [p, m, k] of [[3, 3, 3], [3, 3, 2], [2, 3, 3], [3, 4, 4]]) {
      const t = saturationTable(p, m, k, 10);
      const sg = new Map<string, number>();
      for (let i = 0; i < t.count; i++) sg.set(Array.from(t.positions.subarray(i * m, i * m + m)).join(','), t.sg[i]);
      for (const [key, v] of sg) {
        const seen = new Set(satOptions(key.split(',').map(Number), p, k).map((o) => sg.get(o.join(','))));
        let mex = 0;
        while (seen.has(mex)) mex++;
        expect(mex).toBe(v);
      }
    }
  });

  it('W_{p,m+1} has the b-tower as its value (Theorem 1) and W_{2,2} is Welter', () => {
    for (const [p, m, n] of [[3, 2, 16], [3, 3, 14], [5, 3, 14], [2, 3, 14]]) {
      const t = saturationTable(p, m, m + 1, n);
      for (let i = 0; i < t.count; i++) expect(t.sg[i]).toBe(btower(partitionOf(Array.from(t.positions.subarray(i * m, i * m + m))), p));
    }
    const w = saturationTable(2, 3, 2, 14);
    for (let i = 0; i < w.count; i++) expect(w.sg[i]).toBe(welterFormula(Array.from(w.positions.subarray(i * 3, i * 3 + 3))));
  });

  it("the lower-bound witness of sat_p ≥ min(p, m+1): b = p(k−1) but no option of value 0 in W_{p,k−1}", () => {
    for (const [p, m] of [[3, 3], [3, 4], [5, 3]]) {
      const k = Math.min(p, m + 1);
      const shift = m - k + 1;
      const x = [...Array(shift).keys(), ...Array.from({ length: k - 1 }, (_, i) => p + i + shift)];
      expect(btower(partitionOf(x), p)).toBe(p * (k - 1));
      for (const o of satOptions(x, p, k - 1)) expect(btower(partitionOf(o), p)).not.toBe(0);
    }
  });

  it("the paper's msg example: msg({3,7}) = 8 and msg({3,4,5}) = 6 for p = 3", () => {
    expect(partitionOf([3, 7])).toEqual([6, 3]);
    expect(partitionOf([3, 4, 5])).toEqual([3, 3, 3]);
    expect(msg([6, 3], 3)).toBe(8);
    expect(msg([3, 3, 3], 3)).toBe(6);
    expect(subDiagrams([2, 1]).length).toBe(5); // ∅, (1), (2), (1,1), (2,1)
  });
});

describe('symmetry', () => {
  it('coins ↔ holes with the strip reversed gives the conjugate diagram and the same value', () => {
    const n = 14;
    for (let mask = 0; mask < 1 << n; mask++) {
      let rev = 0;
      for (let a = 0; a < n; a++) if (!((mask >> a) & 1)) rev |= 1 << (n - 1 - a);
      expect(table14[rev]).toBe(table14[mask]);
      if (mask % 97 === 0) expect(partitionOf(maskToPos(rev))).toEqual(conjugate(partitionOf(maskToPos(mask))));
    }
  });
});
