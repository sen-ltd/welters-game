/** Collect runs/*.json into runs/summary.json and the demo's src/findings.json. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const load = (f: string) => JSON.parse(readFileSync(`runs/${f}`, 'utf8'));
const files = readdirSync('runs').filter((f) => f.endsWith('.json') && f !== 'summary.json');
const brute = files.filter((f) => f.startsWith('brute-')).map(load).sort((a, b) => b.n - a.n)[0];
const full = files.includes('full.json') ? load('full.json') : null;
const msgs = files.filter((f) => f.startsWith('msg-')).map(load);
const sats = files.filter((f) => f.startsWith('sat-')).map(load).sort((a, b) => a.p - b.p || a.m - b.m || a.k - b.k || a.n - b.n);

const fmt = (x: number) => x.toLocaleString('en-US');
const summary = {
  brute: brute && { n: brute.n, positions: brute.positions, welter: brute.welterFormulaMismatches, hooks: brute.hookFormulaMismatches, partitionWindow: brute.partitionFormulaWindow, partition: brute.partitionFormulaMismatches, seconds: brute.seconds, fullAllMatch: brute.fullAllMatch, maxSg: brute.maxSg },
  full: full && { nmax: full.nmax, allMatch: full.allMatch, partitions: full.rows.reduce((s: number, r: { partitions: number }) => s + r.partitions, 0), seconds: full.seconds },
  msg: msgs.map((m) => ({ p: m.p, nmax: m.nmax, partitions: m.partitions, failures: m.failures })),
  sat: sats.map((s) => ({ p: s.p, m: s.m, k: s.k, n: s.n, positions: s.positions, mismatches: s.mismatches, first: s.examples[0] ?? null, seconds: s.seconds })),
};
writeFileSync('runs/summary.json', JSON.stringify(summary, null, 1) + '\n');

const best = new Map<string, any>();
for (const s of sats.filter((s) => s.mismatches === 0 && s.k === Math.min(s.p, s.m + 1) && s.k <= s.m && s.p > 2)) {
  const key = `${s.p},${s.m}`;
  if (!best.has(key) || best.get(key).n < s.n) best.set(key, s);
}
const satOk = [...best.values()];
const satBad = sats.filter((s) => s.mismatches > 0 && s.k === Math.min(s.p, s.m + 1) - 1);
const findings: Record<string, string> = {
  brute: `<b>Brute force.</b> Every coin set inside ${brute.n} squares (${fmt(brute.positions)} positions) solved by plain mex: Welter's formula, Sato's hook formula and the 2-adic hook count all agree on every one (${brute.welterFormulaMismatches + brute.hookFormulaMismatches + brute.partitionFormulaMismatches} mismatches).`,
  full: full
    ? `<b>Full positions.</b> For each n ≤ ${full.nmax} (${fmt(summary.full!.partitions)} partitions) the number of λ ⊢ n with value |λ| equals the number with odd dim χ<sup>λ</sup> and equals OEIS A059867 term by term.`
    : '',
  msg: `<b>Irie's Theorem 1.</b> Every partition has a sub-diagram μ with |μ| = value(μ) = value(λ): checked for ${msgs.map((m) => `p = ${m.p} up to size ${m.nmax}`).join(', ')} (${msgs.reduce((s, m) => s + m.failures, 0)} failures).`,
  sat: `<b>p-saturations.</b> Letting up to min(p, m+1) − 1 coins move at once (Irie's lower bound for the saturation index) already gives the base-p hook value on every position of the window, for ${satOk.map((s) => `p=${s.p}, m=${s.m} (${fmt(s.positions)} positions in [0,${s.n}))`).join('; ')}. One coin fewer fails${satBad.length ? `, e.g. ${satBad.map((s) => `{${s.examples[0].x.join(',')}}`).slice(0, 2).join(' ')}` : ''}.`,
};
writeFileSync('src/findings.json', JSON.stringify(findings, null, 1) + '\n');
console.log(JSON.stringify(summary.sat.map((s) => `${s.p},${s.m},${s.k},${s.n}:${s.mismatches}`)));
console.log(Object.values(findings).join('\n'));

// README results table (between the markers), written from the runs only
const rows: string[] = [
  '| check | size | result |',
  '|---|---|---|',
  `| Welter's formula, Sato's hook formula, 2-adic hook count vs brute-force mex | every coin set inside ${brute.n} squares, ${fmt(brute.positions)} positions (partition-based formulas on the ${fmt(2 ** brute.partitionFormulaWindow)} sets inside ${brute.partitionFormulaWindow}) | **${brute.welterFormulaMismatches + brute.hookFormulaMismatches + brute.partitionFormulaMismatches} mismatches**, ${brute.seconds} s |`,
  `| P-positions by number of coins in [0, ${brute.n}) | ${brute.pPositionsByCoins.map((r: { coins: number; p: number }) => `${r.coins}:${fmt(r.p)}`).join(' ')} | symmetric under c ↔ ${brute.n} − c (coins ↔ holes = conjugate diagram, same hooks) |`,
];
if (full) rows.push(`| full positions (value = \\|λ\\|) = odd dim χ^λ = OEIS A059867 | every partition of n ≤ ${full.nmax}, ${fmt(summary.full!.partitions)} partitions | **${full.allMatch ? 'all ' + full.nmax + ' terms identical' : 'MISMATCH'}**, ${full.seconds} s |`);
for (const m of msgs) rows.push(`| Irie Thm 1: a sub-diagram μ with \\|μ\\| = value(μ) = value(λ), p = ${m.p} | every partition of n ≤ ${m.nmax}, ${fmt(m.partitions)} partitions | ${m.failures} failures |`);
rows.push('', '**p-saturations** W^m_{p,k} on the window [0, n) vs Irie\'s base-p hook count (k − 1 = most coins that may move at once; Irie: sat_p(W^m) ≥ min(p, m + 1), exact value unknown for 3 ≤ p ≤ m):', '', '| p | m | k | window | positions | differ | first difference (least coin sum) | time |', '|---|---|---|---|---|---|---|---|');
for (const s of sats) rows.push(`| ${s.p} | ${s.m} | ${s.k} | [0, ${s.n}) | ${fmt(s.positions)} | ${s.mismatches ? '**' + fmt(s.mismatches) + '**' : 0} | ${s.examples[0] ? `{${s.examples[0].x.join(', ')}}: value ${s.examples[0].sg}, hook count ${s.examples[0].btower}` : '—'} | ${s.seconds} s |`);
const readme = readFileSync('README.md', 'utf8');
writeFileSync('README.md', readme.replace(/<!-- results:start -->[\s\S]*<!-- results:end -->/, `<!-- results:start -->\n${rows.join('\n')}\n<!-- results:end -->`));
