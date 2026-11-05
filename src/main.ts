import './style.css';
import findings from './findings.json';
import {
  applyMove, degree, legalMoves, normalize, ordp, partitionOf, size, welterFormula, type Move,
} from './welter.ts';

type Mode = 'first' | 'second' | 'study';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stripEl = $('strip');
const statusEl = $('status');
const diagramEl = $('diagram');
const hookNoteEl = $('hookNote');
const valueEl = $('value');
const waysEl = $('ways');
const historyEl = $('history');
const modeSel = $<HTMLSelectElement>('modeSel');
const presetSel = $<HTMLSelectElement>('presetSel');
const widthSel = $<HTMLSelectElement>('widthSel');
const hints = $<HTMLInputElement>('hints');

let width = 20;
let coins: number[] = [];
let history: { mv: Move; by: 'you' | 'cpu' | 'p1' | 'p2'; before: number[] }[] = [];
let selected: number | null = null;
let hover: number | null = null;
let thinking = false;

const mode = () => modeSel.value as Mode;
const cpuToMove = () =>
  mode() !== 'study' && (mode() === 'first' ? history.length % 2 === 1 : history.length % 2 === 0);
const over = () => legalMoves(coins).length === 0;

function randomPosition(w: number): number[] {
  for (;;) {
    const m = 3 + Math.floor(Math.random() * 3);
    const s = new Set<number>();
    while (s.size < m) s.add(Math.floor(Math.random() * w));
    const xs = normalize([...s]);
    const n = size(partitionOf(xs));
    if (n >= 10 && n <= 40) return xs;
  }
}

function newGame() {
  width = +widthSel.value;
  const v = presetSel.value;
  coins = v === 'random' ? randomPosition(width) : normalize(v.split(',').map(Number));
  const top = coins[coins.length - 1];
  if (top >= width) {
    width = [12, 16, 20, 24].find((w) => w > top) ?? 24;
    widthSel.value = String(width);
  }
  history = [];
  selected = null;
  hover = null;
  render();
  maybeCpu();
}

/** empties below the top coin, ascending: column j of λ ↔ the j-th lowest empty */
function empties(xs: readonly number[]): number[] {
  const occ = new Set(xs);
  const top = xs.length ? xs[xs.length - 1] : 0;
  const out: number[] = [];
  for (let b = 0; b < top; b++) if (!occ.has(b)) out.push(b);
  return out;
}

function play(mv: Move) {
  const by = mode() === 'study' ? (history.length % 2 === 0 ? 'p1' : 'p2') : cpuToMove() ? 'cpu' : 'you';
  history.push({ mv, by, before: coins });
  coins = applyMove(coins, mv);
  selected = null;
  hover = null;
  render();
  maybeCpu();
}

function cpuMove(): Move {
  const moves = legalMoves(coins);
  const win = moves.filter((mv) => welterFormula(applyMove(coins, mv)) === 0);
  if (win.length) return win[Math.floor(Math.random() * win.length)];
  // losing: prefer a short slide so the game lasts and the human has to find the answer
  const short = moves.filter((mv) => mv.from - mv.to === 1);
  const pool = short.length ? short : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

function maybeCpu() {
  if (over() || !cpuToMove()) return;
  thinking = true;
  render();
  setTimeout(() => {
    thinking = false;
    play(cpuMove());
  }, 450);
}

function moveValue(mv: Move): number {
  return welterFormula(applyMove(coins, mv));
}

function renderStrip() {
  stripEl.style.setProperty('--cols', String(width));
  stripEl.innerHTML = '';
  const occ = new Set(coins);
  const targets = new Map<number, number>();
  if (selected !== null) for (const mv of legalMoves(coins)) if (mv.from === selected) targets.set(mv.to, moveValue(mv));
  const humanTurn = !over() && !cpuToMove() && !thinking;
  for (let sq = 0; sq < width; sq++) {
    const b = document.createElement('button');
    b.className = 'sq';
    const label = document.createElement('small');
    label.textContent = String(sq);
    b.appendChild(label);
    if (occ.has(sq)) {
      b.classList.add('coin');
      const canMove = legalMoves(coins).some((mv) => mv.from === sq);
      if (sq === selected) b.classList.add('sel');
      if (hints.checked && humanTurn && canMove && legalMoves(coins).some((mv) => mv.from === sq && moveValue(mv) === 0))
        b.classList.add('haswin');
      b.disabled = !humanTurn || !canMove;
      b.onclick = () => {
        selected = selected === sq ? null : sq;
        render();
      };
    } else if (targets.has(sq)) {
      b.classList.add('target', hints.checked ? (targets.get(sq) === 0 ? 'win' : 'lose') : 'plain');
      b.onclick = () => play({ from: selected!, to: sq });
      b.onmouseenter = () => {
        hover = sq;
        renderDiagram();
      };
      b.onmouseleave = () => {
        hover = null;
        renderDiagram();
      };
    } else {
      b.disabled = true;
    }
    stripEl.appendChild(b);
  }
  const last = history[history.length - 1];
  if (last) {
    const from = stripEl.children[last.mv.from] as HTMLElement | undefined;
    from?.classList.add('was');
  }
}

function renderDiagram() {
  const rowsCoins = coins.filter((a) => empties(coins).some((e) => e < a)).reverse(); // largest first
  const cols = empties(coins);
  diagramEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'yd';
  grid.style.setProperty('--w', String(Math.max(1, cols.length)));
  let hookCells = new Set<string>();
  if (selected !== null && hover !== null) {
    // hook of cell (row of coin `selected`, column of empty `hover`): arm to the right, leg down
    const i = rowsCoins.indexOf(selected);
    const j = cols.indexOf(hover);
    hookCells = new Set([`${i},${j}`]);
    for (let jj = j + 1; jj < cols.length && cols[jj] < selected; jj++) hookCells.add(`${i},${jj}`);
    for (let ii = i + 1; ii < rowsCoins.length && rowsCoins[ii] > hover; ii++) hookCells.add(`${ii},${j}`);
  }
  rowsCoins.forEach((a, i) => {
    cols.forEach((e, j) => {
      const cell = document.createElement('div');
      if (e < a) {
        const h = a - e;
        const o = ordp(h, 2);
        cell.className = `yc o${Math.min(o, 4)}`;
        cell.textContent = String(h);
        cell.title = `hook ${h}: ord₂ = ${o}, contributes ${(h ^ (h - 1)).toString(2)}₂`;
        if (hookCells.has(`${i},${j}`)) cell.classList.add('hook');
      } else cell.className = 'yc empty';
      grid.appendChild(cell);
    });
  });
  diagramEl.appendChild(grid);
  const lam = partitionOf(coins);
  hookNoteEl.textContent = lam.length
    ? `λ = (${lam.join(', ')}), |λ| = ${size(lam)}. Colour = 2-adic order of the hook length (odd · 2 · 4 · 8 · 16+). ` +
      (selected !== null ? 'Hover a target square to see the hook that move removes.' : 'Select a coin to see its moves.')
    : 'The diagram is empty: every coin is packed at the bottom of the strip and nobody can move.';
}

function renderValue() {
  const lam = partitionOf(coins);
  const g = welterFormula(coins);
  const n = size(lam);
  const deg = degree(lam);
  const winners = legalMoves(coins).filter((mv) => moveValue(mv) === 0);
  const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  valueEl.innerHTML =
    kv('coins', coins.join(' ')) +
    kv('Sprague–Grundy value', `<span class="big">${g}</span>`) +
    kv('outcome', over() ? 'no move left' : g === 0 ? '<span class="lose-t">P — the player to move loses</span>' : '<span class="win-t">N — the player to move wins</span>') +
    kv('winning moves', winners.length ? winners.map((m) => `${m.from}→${m.to}`).join(', ') : '—') +
    kv('cells |λ|', String(n)) +
    kv('dim χ<sup>λ</sup> (hook length formula)', deg.toString().length > 18 ? `${deg.toString().slice(0, 15)}… (${deg.toString().length} digits)` : deg.toString()) +
    kv('full (value = |λ|)?', g === n ? '<span class="win-t">yes — and dim χ<sup>λ</sup> is odd</span>' : `no — dim χ<sup>λ</sup> is ${deg % 2n === 1n ? 'odd' : 'even'}`);
}

function renderWays() {
  const xs = coins;
  // Welter
  let sx = 0;
  for (const x of xs) sx ^= x;
  let pairs = 0;
  const pairTerms: string[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const d = xs[j] - xs[i];
      pairs ^= d ^ (d - 1);
      if (pairTerms.length < 6) pairTerms.push(`N(${d})=${d ^ (d - 1)}`);
    }
  // hooks by 2-adic order
  const hooks: number[] = [];
  const cols = empties(xs);
  for (const a of xs) for (const e of cols) if (e < a) hooks.push(a - e);
  let sato = 0;
  for (const h of hooks) sato ^= h ^ (h - 1);
  const levels: string[] = [];
  let tower = 0;
  for (let L = 0; ; L++) {
    const c = hooks.filter((h) => h % 2 ** L === 0).length;
    if (c === 0) break;
    tower += (c % 2) * 2 ** L;
    levels.push(`<tr><td>${2 ** L}</td><td>${c}</td><td>${c % 2}</td></tr>`);
  }
  waysEl.innerHTML = `
    <p><b>Welter (1954)</b><br><span class="mono">⊕ coins = ${sx}; ⊕ N(xʲ−xⁱ) over ${(xs.length * (xs.length - 1)) / 2} pairs = ${pairs}</span><br>
    <span class="dim mono">${pairTerms.join(' ')}${pairTerms.length < (xs.length * (xs.length - 1)) / 2 ? ' …' : ''}</span><br>
    value = ${sx} ⊕ ${pairs} = <b>${sx ^ pairs}</b></p>
    <p><b>Sato (hooks)</b><br><span class="mono">⊕ over ${hooks.length} hooks of 2<sup>ord₂h+1</sup>−1 = <b>${sato}</b></span></p>
    <p><b>Irie (2-adic hook count)</b> — binary digit L is the parity of the number of hooks divisible by 2<sup>L</sup>:</p>
    <table class="tw"><tr><th>2<sup>L</sup></th><th>hooks divisible</th><th>digit</th></tr>${levels.join('')}</table>
    <p class="mono">→ ${tower.toString(2) || '0'}₂ = <b>${tower}</b></p>`;
}

function renderHistory() {
  historyEl.innerHTML = history.length
    ? history.map((h) => `<span class="mv ${h.by === 'cpu' ? 'cpu' : ''}">${h.mv.from}→${h.mv.to}<small>${h.by}</small></span>`).join('')
    : '<span class="dim">none yet</span>';
}

function renderStatus() {
  if (over()) {
    const loser = history.length % 2 === 0 ? 'first player' : 'second player';
    const lastBy = history[history.length - 1]?.by;
    statusEl.textContent =
      mode() === 'study' ? `No move left — the ${loser} to move loses.` : lastBy === 'you' ? 'No move left for the computer — you win.' : 'No move left for you — the computer wins.';
  } else if (thinking) statusEl.textContent = 'computer is thinking…';
  else if (mode() === 'study') statusEl.textContent = `${history.length % 2 === 0 ? 'Player 1' : 'Player 2'} to move — pick a coin.`;
  else statusEl.textContent = selected === null ? 'Your move — pick a coin.' : `Coin on ${selected}: pick an empty square to its left.`;
}

function renderFindings() {
  const f = findings as Record<string, string>;
  $('findings').innerHTML = Object.values(f).map((s) => `<p>${s}</p>`).join('');
}

function render() {
  renderStrip();
  renderDiagram();
  renderValue();
  renderWays();
  renderHistory();
  renderStatus();
}

$('newBtn').onclick = newGame;
$('undoBtn').onclick = () => {
  if (!history.length) return;
  // undo back to the human's turn
  do {
    coins = history.pop()!.before;
  } while (history.length && cpuToMove());
  selected = null;
  render();
  maybeCpu();
};
for (const el of [modeSel, presetSel, widthSel]) el.onchange = newGame;
hints.onchange = render;
renderFindings();
newGame();
