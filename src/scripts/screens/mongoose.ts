// mongoose as a two-pane file manager: copy, people keep working, sync, then the
// cutover reads every file back from both servers. The whole screen is a pure
// function of the time into the loop.
import { Grid, COLS, paragraph, type Cls } from '../ascii';

interface Row { name: string; depth: number; dir?: boolean; hash?: string; changed?: string; added?: boolean }
const ROWS_DATA: Row[] = [
  { name: 'data/', depth: 0, dir: true },
  { name: 'projects/', depth: 1, dir: true },
  { name: 'q3.parquet', depth: 2, hash: '9f2c', changed: '5b07' },
  { name: 'model.ckpt', depth: 2, hash: 'c1d8' },
  { name: 'home/', depth: 1, dir: true },
  { name: 'notes.md', depth: 2, hash: '3e6b', changed: 'a41f' },
  { name: 'scratch/', depth: 1, dir: true },
  { name: 'run-12.log', depth: 2, hash: '77d0' },
  { name: 'run-13.log', depth: 2, hash: 'e29a', added: true },
  { name: 'genome.fa', depth: 1, hash: '0b4f' },
];

const T = { scan: 300, copy: 2600, inUse: 6600, sync: 9000, verify: 12200, done: 16400, loop: 20400 };
const FLIGHT = 620;
export const LOOP_MS = T.loop;
export const STILL_MS = 18500;

const COPY_CMD = [
  'sudo mongoose copy \\',
  '    --src nfs://old-server/export/data \\',
  '    --dst nfs://new-server/export/data \\',
  '    --work-dir /var/lib/mongoose/data',
];
const SYNC_CMD = ['sudo mongoose sync \\', '    --work-dir /var/lib/mongoose/data'];
const CUTOVER_CMD = ['sudo mongoose sync --cutover \\', '    --work-dir /var/lib/mongoose/data'];

const visibleSrc = (t: number) => ROWS_DATA.flatMap((r, i) => (!r.added || t >= T.inUse ? [i] : []));
const synced = ROWS_DATA.flatMap((r, i) => (r.changed || r.added ? [i] : []));

/** When row i lands on the new server: in the first copy, or in the sync if it is new. */
function landing(i: number): { depart: number; pass: 'copy' | 'sync' } {
  const r = ROWS_DATA[i];
  if (r.added) return { depart: T.sync + synced.indexOf(i) * 260, pass: 'sync' };
  return { depart: T.copy + i * 280, pass: 'copy' };
}

export function render(t: number): string {
  const g = new Grid(COLS, 22);
  let stage = 'copy';
  let text = 'Scans the source first and builds an index.';
  let cmd = COPY_CMD;
  let tail: string[] = [];
  if (t >= T.copy) text = 'Then copies, many files at once. Stopped, the same command picks up where it left off.';
  if (t >= T.inUse) { stage = 'in use'; text = 'People keep working on the old server.'; }
  if (t >= T.sync) { stage = 'sync'; text = 'Copies only what changed. Run it as often as you like.'; cmd = SYNC_CMD; }
  if (t >= T.verify) { stage = 'cutover'; text = 'Copies nothing. Reads every file back from both servers and compares the metadata and a SHA-256.'; cmd = CUTOVER_CMD; }
  if (t >= T.done) { stage = 'done'; text = 'Exit code 0: the two trees match, and the new server is ready.'; tail = ['echo $?', '0']; }
  g.bar(0, 'MONGOOSE  NFS COPY, SYNC, CUTOVER', stage.toUpperCase());

  const pane = (x: number, title: string) => {
    g.box(x, 2, 22, 12, 'w', 'double');
    g.text(x + 2, 2, ` ${title} `, '');
  };
  pane(0, 'old-server');
  pane(24, 'new-server');

  const order = visibleSrc(t);
  const verifyAt = (i: number) => T.verify + 300 + order.indexOf(i) * 300;

  ROWS_DATA.forEach((r, i) => {
    const y = 3 + i;
    const nameCls: Cls = r.dir ? '' : 't';
    const changedNow = !!r.changed && t >= T.inUse;
    const hash = changedNow ? r.changed! : r.hash ?? '';
    const verified = t >= verifyAt(i) && t >= T.verify;

    // old server
    if (order.includes(i)) {
      g.text(1 + r.depth * 2, y, r.name, nameCls);
      const syncedYet = t >= T.sync + synced.indexOf(i) * 260 + FLIGHT;
      if ((changedNow || r.added) && synced.includes(i) && !syncedYet) g.text(16, y, r.added ? 'new' : 'chgd', '');
      if (verified && hash) g.text(16, y, hash, 't');
      const cursor = Math.floor((t - T.scan) / 190);
      if (t < T.copy && cursor === order.indexOf(i)) g.tint(1, y, 20, 'i');
    }

    // new server
    const { depart } = landing(i);
    const landed = t >= depart + FLIGHT;
    if (landed) {
      g.text(25 + r.depth * 2, y, r.name, nameCls);
      if (verified && hash) g.text(40, y, hash, 't');
    }
    if (verified) g.text(22, y, '══', '');

    // a file on its way across
    const flights = [depart];
    if (r.changed) flights.push(T.sync + synced.indexOf(i) * 260);
    for (const d of flights) {
      if (t >= d && t < d + FLIGHT) g.put(15 + Math.round(((t - d) / FLIGHT) * 10), y, '█');
    }
  });

  let y = 15;
  cmd.forEach((line, k) => {
    g.text(0, y, k === 0 ? '$ ' : '', 'w');
    g.text(k === 0 ? 2 : 0, y++, line, 't');
  });
  tail.forEach((line, k) => {
    if (k === 0) g.text(0, y, '$ ', 'w');
    g.text(k === 0 ? 2 : 0, y++, line, 't');
  });
  paragraph(g, y, text.toUpperCase());
  return g.html();
}
