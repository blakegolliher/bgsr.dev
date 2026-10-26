// nfs-walker as `tree` output that grows as workers list directories, beside the
// 32 Parquet shards the entries stream into. The counters are the production run
// from the nfs-walker README, played as a time-lapse of each pass.
import { Grid, COLS, command, paragraph } from '../ascii';

interface Node { name: string; depth: number; dir: boolean; parent: number; kids: number[]; last: boolean }

const TREES = [
  `/export
 projects/
  genomics/
   run-0412.bam
   run-0413.bam
  render/
   f-0001.exr
 home/
  blake/
   notes.md
  shared/
 scratch/
  tmp-91c2.log`,
  `/export
 datasets/
  imagenet/
   train-01.tar
   train-02.tar
  laion/
 checkpoints/
  step-1000.pt
  step-2000.pt
 logs/
  job-7741.log
 tmp/
  .lock`,
];

function parse(spec: string): Node[] {
  const nodes: Node[] = [];
  const stack: number[] = [];
  for (const line of spec.split('\n')) {
    const depth = line.length - line.trimStart().length;
    const name = line.trim();
    stack.length = depth;
    const parent = depth ? stack[depth - 1] : -1;
    const i = nodes.push({ name, depth, dir: name.endsWith('/') || depth === 0, parent, kids: [], last: false }) - 1;
    if (parent >= 0) nodes[parent].kids.push(i);
    stack[depth] = i;
  }
  nodes.forEach((n) => n.kids.forEach((k, j) => (nodes[k].last = j === n.kids.length - 1)));
  return nodes;
}
const PARSED = TREES.map(parse);

const SHARDS = 32;
const WORKERS = 3;
const TOTAL_FILES = 810.8e6;
const TOTAL_SECONDS = 1175;

interface Worker { node: number; timer: number }
export interface WalkerState {
  tree: number;
  shown: boolean[];
  queue: number[];
  workers: Worker[];
  shards: number[];
  flash: number[];
  hold: number;
  /** ms into the dashboard stage that follows each scan; -1 while scanning */
  serve: number;
}

// After each scan: `nfs-walker serve`, the dashboard built into the same binary
const SERVE_AFTER = 1400;
const SERVE_MS = 7800;
const PAGES = ['OVERVIEW', 'CAPACITY', 'FILES', 'OWNERS', 'DIRS', 'QUERIES'];
const CHARTS: [string, number[]][] = [
  ['SIZE HISTOGRAM', [3, 6, 11, 17, 22, 24, 19, 14, 9, 6, 4, 2, 1]],
  ['DEPTH BREAKDOWN', [5, 12, 20, 24, 21, 15, 10, 7, 4, 3, 2, 1, 1]],
  ['SIZE PERCENTILES', [1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 21, 23, 24]],
  ['STORAGE BY UID', [24, 16, 11, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1]],
  ['FANOUT', [2, 9, 24, 18, 12, 9, 6, 5, 4, 3, 2, 2, 1]],
  ['36 QUERIES', [8, 14, 6, 19, 11, 22, 9, 16, 12, 7, 18, 10, 13]],
];

/** A directory's listing comes back: its entries appear, and each lands in the shards. */
function list(s: WalkerState, node: number): void {
  const nodes = PARSED[s.tree];
  for (const k of nodes[node].kids) {
    s.shown[k] = true;
    if (nodes[k].dir) s.queue.push(k);
    for (let j = 0; j < 4; j++) {
      const sh = Math.floor(Math.random() * SHARDS);
      s.shards[sh]++;
      s.flash[sh] = 260;
    }
  }
}

// Each pass opens with the top level already listed, so the first frame is never bare
function begin(s: WalkerState, tree: number): void {
  s.tree = tree;
  s.shown = PARSED[tree].map((_, i) => i === 0);
  s.queue = [];
  s.workers = Array.from({ length: WORKERS }, () => ({ node: -1, timer: 0 }));
  s.shards = Array(SHARDS).fill(0);
  s.flash = Array(SHARDS).fill(0);
  s.hold = 0;
  s.serve = -1;
  list(s, 0);
}

export function create(): WalkerState {
  const s = {} as WalkerState;
  begin(s, 0);
  return s;
}

/** The finished pass, for the still frame. */
export function still(): WalkerState {
  const s = create();
  s.shown = s.shown.map(() => true);
  s.queue = [];
  s.shards = Array.from({ length: SHARDS }, (_, i) => [1, 2, 3, 2, 4, 1, 2, 3][i % 8]);
  return s;
}

export function step(s: WalkerState, dt: number): void {
  s.flash = s.flash.map((f) => Math.max(0, f - dt));
  for (const w of s.workers) {
    if (w.node < 0) {
      if (!s.queue.length) continue;
      // mostly the oldest, sometimes the newest: an idle worker steals from the far end
      w.node = Math.random() < 0.3 ? s.queue.pop()! : s.queue.shift()!;
      w.timer = 420 + Math.random() * 380;
      continue;
    }
    w.timer -= dt;
    if (w.timer > 0) continue;
    list(s, w.node);
    w.node = -1;
  }
  const busy = s.queue.length || s.workers.some((w) => w.node >= 0);
  if (!busy) {
    s.hold += dt;
    if (s.hold > SERVE_AFTER) s.serve = s.hold - SERVE_AFTER;
    if (s.serve > SERVE_MS) begin(s, (s.tree + 1) % PARSED.length);
  }
}

const prefix = (nodes: Node[], i: number): string => {
  const n = nodes[i];
  if (n.depth === 0) return '';
  let p = n.last ? '└── ' : '├── ';
  for (let a = n.parent; nodes[a].depth > 0; a = nodes[a].parent) p = (nodes[a].last ? '    ' : '│   ') + p;
  return p;
};

/** The scan as `tree` output beside the shard matrix. */
function drawScan(g: Grid, s: WalkerState): void {
  const nodes = PARSED[s.tree];
  const done = s.shown.every(Boolean) && !s.workers.some((w) => w.node >= 0);
  g.bar(0, 'NFS-WALKER  READDIRPLUS SCAN', done ? 'DONE' : 'WALK');

  let y = 2;
  nodes.forEach((n, i) => {
    if (!s.shown[i]) return;
    const p = prefix(nodes, i);
    g.text(0, y, p, 'w');
    g.text(p.length, y, n.name, n.dir ? '' : 't');
    const w = s.workers.findIndex((wk) => wk.node === i);
    if (w >= 0) g.text(25, y, ` w${w + 1}`, 'i');
    y++;
  });

  g.vline(29, 2, 14, 'd');
  g.text(31, 2, 'PARQUET SHARDS', 't');
  s.shards.forEach((n, i) => {
    const ch = n ? ['░', '▒', '▓', '█'][Math.min(3, n - 1)] : '·';
    g.put(31 + (i % 8) * 2, 4 + Math.floor(i / 8), ch, s.flash[i] ? 't' : n ? '' : 'd');
  });
  g.text(31, 9, '32 WRITERS', 'w');
  g.text(31, 10, 'ZSTD-3', 'w');
}

/** `nfs-walker serve`: the startup lines, then a sketch of the dashboard paging through. */
function drawServe(g: Grid, t: number): void {
  g.bar(0, 'NFS-WALKER  ANALYTICS DASHBOARD', 'SERVE');
  const lines = ['Analytics server ready', '  Dashboard: http://127.0.0.1:8080', '  API:       http://127.0.0.1:8080/api/health'];
  lines.forEach((l, i) => { if (t >= 150 + i * 200) g.text(0, 2 + i, l, 't'); });
  if (t < 900) return;

  g.box(0, 6, COLS, 9);
  g.text(2, 6, ' 127.0.0.1:8080 ', '');
  const page = Math.floor((t - 900) / 1150) % PAGES.length;
  let x = 2;
  PAGES.forEach((p, i) => {
    g.text(x, 7, p, i === page ? 'i' : 'w');
    x += p.length + 1;
  });
  g.text(2, 9, 'ENTRIES', 'w');
  g.text(2, 10, '810.8M', 't');
  g.text(2, 12, 'DATAFUSION', 'w');
  const [title, bars] = CHARTS[page];
  g.text(18, 9, title, 't');
  const grow = Math.min(1, ((t - 900) % 1150) / 380);
  bars.forEach((v, i) => {
    const h = Math.round(v * grow);
    for (let r = 0; r < 3; r++) {
      const fill = Math.max(0, Math.min(8, h - (2 - r) * 8));
      if (fill) g.put(18 + i * 2, 10 + r, ' ▁▂▃▄▅▆▇█'[fill], '');
    }
  });
}

export function render(s: WalkerState): string {
  const nodes = PARSED[s.tree];
  const g = new Grid(COLS, 22);
  const serving = s.serve >= 0;
  if (serving) drawServe(g, s.serve);
  else drawScan(g, s);

  const f = s.shown.filter(Boolean).length / nodes.length;
  const secs = Math.round(TOTAL_SECONDS * f);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  g.text(0, 16, 'FILES', 'w');
  g.text(6, 16, `${((TOTAL_FILES * f) / 1e6).toFixed(1)}M`, 't');
  g.text(15, 16, 'RATE', 'w');
  g.text(20, 16, `${Math.round(690 * Math.min(1, f / 0.15))}K/S`, 't');
  g.text(29, 16, 'ELAPSED', 'w');
  g.text(37, 16, clock, 't');

  if (serving) {
    const used = command(g, 18, 'nfs-walker serve --data-dir scan.parquet');
    paragraph(g, 18 + used, 'The same binary serves a web dashboard: 36 queries over the scan, run by DataFusion.'.toUpperCase());
  } else {
    const used = command(g, 18, 'sudo nfs-walker nfs://server/export -o scan.parquet -w 230');
    paragraph(g, 18 + used, 'Time-lapse of the 810.8 M-file production run, one 128-core host.'.toUpperCase());
  }
  return g.html();
}
