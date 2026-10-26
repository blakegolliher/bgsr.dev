// s3slower as a live terminal view: requests from five clients pass the eBPF
// probes in the TLS library on their way to S3 and back, and each one lands as a
// row in the latency table.
import { Grid, COLS, cells, cellAt, paragraph, type Cell } from '../ascii';

const PROCS = ['boto3', 'awscli', 'mc', 'rclone', 'elbencho'];
type Op = [name: string, status: number, lo: number, hi: number];
const OPS: Record<string, Op[]> = {
  boto3: [['PUT', 200, 40, 70], ['MPU_PART', 200, 24, 42], ['GET_RNG', 206, 2, 5], ['LIST_PFX', 200, 2, 5]],
  awscli: [['PUT', 200, 30, 62], ['GET', 200, 5, 16], ['HEAD', 200, 1, 3]],
  mc: [['GET', 200, 4, 12], ['LIST_PFX', 200, 2, 6]],
  rclone: [['PUT', 200, 28, 58], ['GET', 200, 5, 14], ['HEAD', 200, 1, 3]],
  elbencho: [['PUT', 200, 22, 48], ['GET', 200, 3, 9], ['DEL_BULK', 200, 14, 24]],
};
const TABLE_ROWS = 6;
const TRIP = 900;

const row = (time: string, proc: string, op: string, status: number, lat: number) =>
  `${time} ${proc.padEnd(8)} ${op.padEnd(9)} ${status} ${lat.toFixed(2).padStart(8)}`;
// the sample output in the s3slower README
const SAMPLE: [string, string, number, number][] = [
  ['boto3', 'PUT', 200, 59.99],
  ['boto3', 'MPU_PART', 200, 30.31],
  ['boto3', 'LIST_PFX', 200, 2.98],
  ['boto3', 'GET_RNG', 206, 2.32],
  ['boto3', 'DEL_BULK', 200, 19.89],
  ['awscli', 'HEAD', 200, 1.84],
];

const ROW_Y = (i: number) => 5 + i;
const PATHS: Cell[][] = PROCS.map((_, i) => cells([[10, ROW_Y(i)], [25, ROW_Y(i)], [25, 7], [30, 7]]));

interface Req { proc: number; op: Op; lat: number; phase: 'out' | 'wait' | 'back'; p: number; wait: number }
export interface SlowerState { clock: number; reqs: Req[]; rows: string[]; fresh: number; count: number; samples: number[]; acc: number; gap: number }

export function create(): SlowerState {
  return {
    clock: (21 * 3600 + 16 * 60 + 11) * 1000,
    reqs: [],
    rows: SAMPLE.map(([p, o, s, l]) => row('21:16:11', p, o, s, l)),
    fresh: 0,
    count: SAMPLE.length,
    samples: SAMPLE.map(([, , , l]) => l),
    acc: 0,
    gap: 300,
  };
}

const stamp = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

export function step(s: SlowerState, dt: number): void {
  s.clock += dt;
  s.fresh = Math.max(0, s.fresh - dt);
  for (const r of [...s.reqs]) {
    if (r.phase === 'wait') {
      r.wait -= dt;
      if (r.wait <= 0) r.phase = 'back';
      continue;
    }
    r.p += dt / TRIP;
    if (r.p < 1) continue;
    if (r.phase === 'out') {
      r.phase = 'wait';
      r.p = 0;
      continue;
    }
    s.reqs.splice(s.reqs.indexOf(r), 1);
    s.rows = [...s.rows, row(stamp(s.clock), PROCS[r.proc], r.op[0], r.op[1], r.lat)].slice(-TABLE_ROWS);
    s.fresh = 600;
    s.count++;
    s.samples = [...s.samples, r.lat].slice(-200);
  }
  s.acc += dt;
  if (s.acc > s.gap) {
    s.acc = 0;
    s.gap = 520 + Math.random() * 560;
    const proc = Math.floor(Math.random() * PROCS.length);
    const ops = OPS[PROCS[proc]];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const lat = op[2] + Math.random() * (op[3] - op[2]);
    s.reqs.push({ proc, op, lat, phase: 'out', p: 0, wait: Math.min(900, 150 + lat * 12) });
  }
}

const pct = (xs: number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

export function render(s: SlowerState): string {
  const g = new Grid(COLS, 22);
  g.bar(0, 'S3SLOWER  LIVE S3 LATENCY', 'RUN');
  g.text(0, 1, '$ ', 'w');
  g.text(2, 1, 'sudo s3slower run', 't');

  g.text(0, 3, 'REQS', 'w');
  g.text(5, 3, String(s.count), 't');
  g.text(12, 3, 'P50', 'w');
  g.text(16, 3, `${pct(s.samples, 0.5).toFixed(1)}ms`, 't');
  g.text(26, 3, 'P99', 'w');
  g.text(30, 3, `${pct(s.samples, 0.99).toFixed(1)}ms`, 't');

  PROCS.forEach((p, i) => {
    const y = ROW_Y(i);
    g.text(1, y, p, 't');
    g.hline(10, 24, y);
    g.put(14, y, i === 0 ? '┬' : '┼', '');
    g.put(25, y, ['┐', '┤', '┼', '┤', '┘'][i], 'w');
  });
  g.put(14, 10, '└', '');
  g.text(15, 10, '─ eBPF PROBES IN TLS LIBRARIES', '');
  g.hline(26, 30, 7);
  g.box(31, 6, 15, 3);
  g.put(31, 7, '┤', 'w');
  g.text(32, 7, ' S3 ENDPOINT ', 't');
  if (s.reqs.some((r) => r.phase === 'wait')) g.tint(32, 7, 13, 'i');

  for (const r of s.reqs) {
    if (r.phase === 'wait') continue;
    const [x, y] = cellAt(PATHS[r.proc], r.phase === 'out' ? r.p : 1 - r.p);
    if (x === 14) g.tint(14, y, 1, 'i');
    else g.put(x, y, r.phase === 'out' ? '█' : '▒', r.phase === 'out' ? '' : 't');
  }

  g.text(0, 12, 'TIME     PROC     OP        STAT LAT(ms)', 'w');
  s.rows.forEach((line, i) => {
    g.text(0, 13 + i, line, 't');
    if (s.fresh && i === s.rows.length - 1) g.tint(0, 13 + i, line.length, 'i');
  });

  paragraph(g, 20, 'Timed inside OpenSSL, GnuTLS, NSS, s2n-tls or Go crypto/tls. No SDK wrapper, no proxy.'.toUpperCase());
  return g.html();
}
