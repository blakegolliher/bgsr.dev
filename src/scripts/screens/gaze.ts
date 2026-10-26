// nfs-gaze as its live per-operation view, after the sample output in its README:
// IOPS, round-trip and execute time for each NFS operation, refreshed every
// second from /proc/self/mountstats. A write latency spike shows up on its row,
// then the view is filtered down to metadata ops with --ops.
import { Grid, COLS, command, paragraph } from '../ascii';

interface Op { name: string; iops: number; rtt: number; exe: number }
const OPS: Op[] = [
  { name: 'READ', iops: 125, rtt: 1.2, exe: 2.1 },
  { name: 'WRITE', iops: 89, rtt: 2.3, exe: 4.2 },
  { name: 'GETATTR', iops: 450, rtt: 0.5, exe: 0.7 },
  { name: 'LOOKUP', iops: 234, rtt: 0.8, exe: 1.1 },
  { name: 'ACCESS', iops: 180, rtt: 0.45, exe: 0.6 },
  { name: 'READDIRPLUS', iops: 12, rtt: 3.1, exe: 3.6 },
  { name: 'COMMIT', iops: 8, rtt: 5.2, exe: 6.0 },
  { name: 'SETATTR', iops: 22, rtt: 1.4, exe: 1.9 },
];
const METADATA = ['GETATTR', 'LOOKUP', 'ACCESS', 'READDIRPLUS'];
const T = { spike: 4000, spikeEnd: 7600, filter: 9000, loop: 15000 };

export interface GazeState { t: number; tick: number; rows: Op[] }

const jitter = (v: number, k = 0.15) => v * (1 - k + Math.random() * 2 * k);
const sample = (t: number): Op[] =>
  OPS.map((o) => {
    const spike = o.name === 'WRITE' && t >= T.spike && t < T.spikeEnd;
    const rtt = spike ? jitter(46, 0.2) : jitter(o.rtt);
    // execute time includes the round trip, so it never comes in under it
    return { name: o.name, iops: jitter(o.iops), rtt, exe: rtt * jitter(o.exe / o.rtt, 0.05) };
  });

export function create(): GazeState {
  return { t: 0, tick: 0, rows: OPS.map((o) => ({ ...o })) };
}

export function step(s: GazeState, dt: number): void {
  s.t = (s.t + dt) % T.loop;
  s.tick += dt;
  if (s.tick >= 1000) {
    s.tick = 0;
    s.rows = sample(s.t);
  }
}

const time = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(2)}µs` : `${ms.toFixed(2)}ms`);
const line = (op: string, iops: string, rtt: string, exe: string, err: string) =>
  op.padEnd(12) + iops.padStart(7) + rtt.padStart(9) + exe.padStart(9) + err.padStart(7);

export function render(s: GazeState): string {
  const g = new Grid(COLS, 22);
  const filtered = s.t >= T.filter;
  const spiking = s.t >= T.spike && s.t < T.spikeEnd;
  g.bar(0, 'NFS-GAZE  PER-OP NFS LATENCY', filtered ? 'FILTERED' : 'LIVE');

  const used = command(g, 1, filtered ? 'nfs-gaze -m /mnt/nfs --ops GETATTR,LOOKUP,ACCESS,READDIRPLUS' : 'nfs-gaze -m /mnt/nfs');
  const top = 1 + used + 1;
  g.text(0, top, 'server:/export mounted on /mnt/nfs', 't');
  const clock = new Date(Date.UTC(2026, 9, 26, 14, 30, 45) + Math.floor(s.t / 1000) * 1000);
  g.text(0, top + 1, `Timestamp: ${clock.toISOString().slice(0, 19).replace('T', ' ')} UTC`, 'w');

  g.text(0, top + 3, line('OP', 'IOPS', 'RTT', 'EXE', 'ERRORS'), 'w');
  g.hline(0, 43, top + 4);
  const rows = filtered ? s.rows.filter((r) => METADATA.includes(r.name)) : s.rows;
  rows.forEach((r, i) => {
    const y = top + 5 + i;
    g.text(0, y, line(r.name, r.iops.toFixed(1), time(r.rtt), time(r.exe), '0'), 't');
    if (r.name === 'WRITE' && spiking) g.tint(0, y, 44, 'i');
  });

  g.text(0, 18, 'source: /proc/self/mountstats', 'w');
  let text = 'Round-trip and execute time for each operation type, from the kernel’s own mount stats. No eBPF, no kernel module.';
  if (spiking) text = 'A write latency spike shows up on its own row within a second, with nothing added to the application.';
  if (filtered) text = 'Filter to the operations that matter, here the metadata calls that often slow applications down.';
  paragraph(g, 19, text.toUpperCase());
  return g.html();
}
