// shunt as a terminal screen: clients write through shunt to cluster A, the write
// split ramps to cluster B, the mover copies the rest, shunt cuts over and steps out.
import { Grid, COLS, cells, cellAt, command, paragraph, type Cell } from '../ascii';

type Cluster = 'A' | 'B';
interface Token { kind: 'w' | 'r' | 'c'; client: number; from: Cluster; to: Cluster; p: number; ms: number; direct: boolean }

export interface ShuntState {
  stage: number;
  t: number;
  hold: number;
  ratio: number;
  A: number;
  B: number;
  copied: number;
  aGone: boolean;
  out: boolean;
  tokens: Token[];
  acc: { w: number; r: number; m: number };
}

interface Stage { name: string; ms: number; cmd: (r: number) => string; text: (r: number) => string }
export const STAGES: Stage[] = [
  { name: 'adopt', ms: 5200, cmd: () => 'shunt adopt clustera demo-source --keys client-keys.yaml', text: () => 'Clients reach the bucket on cluster A through shunt, with the keys they already use.' },
  { name: 'ramp', ms: 5200, cmd: (r) => `shunt ramp demo-source --ratio ${r.toFixed(2)}`, text: (r) => `${Math.round(r * 100)}% of new writes go to cluster B, chosen by a hash of the key.` },
  { name: 'migrate start', ms: 5000, cmd: () => 'shunt migrate start demo-source', text: () => 'Every write goes to B. Reads of anything not yet on B fall back to A.' },
  { name: 'migrate run', ms: 5200, cmd: () => 'shunt migrate run demo-source --until-converged', text: () => 'The mover copies what is still only on A.' },
  { name: 'cutover', ms: 4600, cmd: () => 'shunt cutover demo-source --window 60s', text: () => 'Nothing needs A any more. Reads stop going there, and its copy is deleted.' },
  { name: 'step-out', ms: 5600, cmd: () => 'shunt step-out', text: () => 'shunt checks the clients can use B directly, and gets out of the way.' },
];

const CAP = 30;
const ROWS = 21;
const X = 2;
const Y = 2;
const at = (pts: Cell[]): Cell[] => pts.map(([x, y]) => [X + x, Y + y]);

const CLIENTS = [
  { label: 'AWS CLI', row: 1, in: at([[9, 1], [14, 1], [14, 5], [15, 5]]) },
  { label: ' BOTO3 ', row: 5, in: at([[9, 5], [15, 5]]) },
  { label: ' SPARK ', row: 9, in: at([[9, 9], [14, 9], [14, 5], [15, 5]]) },
];
const THROUGH = at([[16, 5], [22, 5]]);
const OUT: Record<Cluster, Cell[]> = { A: at([[23, 5], [25, 5], [25, 2], [27, 2]]), B: at([[23, 5], [25, 5], [25, 9], [27, 9]]) };
const PATHS = CLIENTS.map((c) => ({
  A: [...cells(c.in), ...cells(THROUGH), ...cells(OUT.A)],
  B: [...cells(c.in), ...cells(THROUGH), ...cells(OUT.B)],
}));
const MOVER: Cell = [X + 34, Y + 6];

export function create(): ShuntState {
  const s: ShuntState = { stage: 0, t: 0, hold: 0, ratio: 0, A: 0, B: 0, copied: 0, aGone: false, out: false, tokens: [], acc: { w: 0, r: 0, m: 0 } };
  enter(s, 0);
  return s;
}

/** The frame shown without script or with reduced motion: half the writes going to B. */
export function still(ratio = 0.5): ShuntState {
  const s = create();
  s.stage = 1;
  s.ratio = ratio;
  s.B = Math.round(20 * ratio);
  s.A = 20 - s.B;
  return s;
}

export function enter(s: ShuntState, i: number): void {
  s.stage = i;
  s.t = 0;
  s.acc.m = 0;
  if (i === 0) Object.assign(s, { A: 5, B: 0, copied: 0, aGone: false, out: false, ratio: 0, tokens: [] });
  if (i === 1) s.ratio = 0.5;
  if (i === 2) s.ratio = 1;
  if (i === 5) s.out = true;
}

/** The visitor set the split by hand: hold on the ramp stage for a while. */
export function setRatio(s: ShuntState, r: number): void {
  if (s.stage !== 1) {
    s.stage = 1;
    s.out = false;
    s.aGone = false;
  }
  s.ratio = r;
  s.t = 0;
  s.hold = 7000;
}

const spawn = (s: ShuntState, kind: Token['kind'], from: Cluster, to: Cluster, ms: number) =>
  s.tokens.push({ kind, client: Math.floor(Math.random() * 3), from, to, p: 0, ms, direct: s.out });

export function step(s: ShuntState, dt: number): void {
  for (const k of [...s.tokens]) {
    k.p += dt / k.ms;
    if (k.p < 1) continue;
    s.tokens.splice(s.tokens.indexOf(k), 1);
    if (k.kind !== 'r') s[k.to] = Math.min(CAP, s[k.to] + 1);
  }
  s.acc.w += dt;
  s.acc.r += dt;
  if (s.acc.w > 640) {
    s.acc.w = 0;
    const to: Cluster = s.out || Math.random() < s.ratio ? 'B' : 'A';
    if (!(to === 'A' && s.aGone)) spawn(s, 'w', to, to, 1400);
  }
  if (s.acc.r > 1200) {
    s.acc.r = 0;
    const from: Cluster = !s.aGone && s.A > 0 && Math.random() < 0.55 ? 'A' : 'B';
    if (s[from] > 0) spawn(s, 'r', from, from, 1300);
  }
  if (s.stage === 3) {
    s.acc.m += dt;
    if (s.acc.m > 240 && s.copied < s.A) {
      s.acc.m = 0;
      s.copied++;
      spawn(s, 'c', 'A', 'B', 420);
    }
  }
  if (s.stage === 4) {
    s.acc.m += dt;
    if (s.acc.m > 140) {
      s.acc.m = 0;
      if (s.A > 0) {
        s.A--;
        s.copied = Math.min(s.copied, s.A);
      } else s.aGone = true;
    }
  }
  if (s.hold > 0) {
    s.hold -= dt;
    return;
  }
  s.t += dt;
  if (s.t >= STAGES[s.stage].ms) enter(s, (s.stage + 1) % STAGES.length);
}

export function render(s: ShuntState): string {
  const g = new Grid(COLS, ROWS);
  const st = STAGES[s.stage];
  g.bar(0, 'SHUNT  LIVE BUCKET MIGRATION', st.name.toUpperCase());

  for (const c of CLIENTS) {
    g.box(X, Y + c.row - 1, 9, 3);
    g.text(X + 1, Y + c.row, c.label, 't');
    g.put(X + 8, Y + c.row, '├', 'w');
  }
  g.hline(X + 9, X + 13, Y + 1);
  g.put(X + 14, Y + 1, '┐', 'w');
  g.vline(X + 14, Y + 2, Y + 8);
  g.hline(X + 9, X + 13, Y + 5);
  g.put(X + 14, Y + 5, '┼', 'w');
  g.hline(X + 9, X + 13, Y + 9);
  g.put(X + 14, Y + 9, '┘', 'w');
  g.put(X + 15, Y + 5, '─', 'w');

  if (s.out) {
    g.box(X + 16, Y + 4, 7, 3, 'w', 'dashed');
    g.hline(X + 16, X + 22, Y + 5);
  } else {
    g.box(X + 16, Y + 4, 7, 3, '', 'double');
    g.put(X + 16, Y + 5, '╢');
    g.put(X + 22, Y + 5, '╟');
    g.text(X + 17, Y + 5, 'SHUNT');
  }

  g.hline(X + 23, X + 24, Y + 5);
  g.put(X + 25, Y + 2, '┌', 'w');
  g.vline(X + 25, Y + 3, Y + 8);
  g.put(X + 25, Y + 5, '┤', 'w');
  g.put(X + 25, Y + 9, '└', 'w');
  g.hline(X + 26, X + 27, Y + 2);
  g.hline(X + 26, X + 27, Y + 9);

  (['A', 'B'] as Cluster[]).forEach((c) => {
    const top = Y + (c === 'A' ? 0 : 7);
    const gone = c === 'A' && s.aGone;
    g.box(X + 28, top, 14, 6, 'w', gone ? 'dashed' : 'single');
    g.text(X + 29, top + 1, gone ? '  dropped' : ` CLUSTER  ${c}`, gone ? 'w' : 't');
    g.put(X + 28, top + 2, '┤', 'w');
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 10; i++) {
        const n = r * 10 + i;
        const full = n < s[c];
        const copied = c === 'A' && n < s.copied;
        g.put(X + 30 + i, top + 2 + r, full ? (copied ? '▒' : '█') : '░', full ? '' : 'w');
      }
    }
  });
  g.put(X + 34, Y + 5, '┬', 'w');
  g.put(X + 34, Y + 6, '│', 'w');
  g.put(X + 34, Y + 7, '┴', 'w');

  for (const k of s.tokens) {
    if (k.kind === 'c') {
      g.put(MOVER[0], MOVER[1], '▓');
      continue;
    }
    const path = PATHS[k.client][k.kind === 'w' ? k.to : k.from];
    const [x, y] = cellAt(path, k.kind === 'w' ? k.p : 1 - k.p);
    if (!s.out && y === Y + 5 && x >= X + 16 && x <= X + 22) continue; // inside shunt
    g.put(x, y, k.kind === 'r' ? '▒' : '█', k.kind === 'r' ? 't' : '');
  }

  const used = command(g, 16, st.cmd(s.ratio));
  paragraph(g, 16 + used, st.text(s.ratio).toUpperCase());
  return g.html();
}

/** The draggable gauge under the screen. */
export const gauge = (ratio: number): string => {
  const n = Math.round(ratio * 20);
  return `[${'█'.repeat(n)}<span class="w">${'░'.repeat(20 - n)}</span>]`;
};
