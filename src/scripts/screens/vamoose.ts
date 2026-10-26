// vamoose as a run log: `vamoose prepare` uploads the shard index, workers on
// four hosts claim shards with conditional PUTs in S3, one host goes down and
// its shard is reclaimed, then `vamoose verify` checks the two trees.
// The S3 calls follow the claim protocol in vamoose's docs/CLAIM_PROTOCOL.md.
import { Grid, COLS, command, paragraph, type Cls } from '../ascii';

const SHARDS = 32;
const HOSTS = ['host-a', 'host-b', 'host-c', 'host-d'];
const DOWN = 2; // host-c
const T = { copy: 2600, die: 3200, stale: 2000, verifyMs: 2600, doneMs: 3400 };

type Phase = 'prepare' | 'copy' | 'verify' | 'done';
interface Shard { state: 'none' | 'pending' | 'claimed' | 'done'; owner: number }
interface Worker { shard: number; timer: number; down: boolean }
interface Line { text: string; cls: Cls; hot?: [number, number] }

export interface VamooseState {
  phase: Phase;
  t: number;
  shards: Shard[];
  workers: Worker[];
  log: Line[];
  died: number;
  reclaimed: boolean;
  verified: number;
}

const etag = (n: number) => ((n * 2654435761) >>> 0).toString(16).slice(0, 4);

export function create(): VamooseState {
  return {
    phase: 'prepare',
    t: 0,
    shards: Array.from({ length: SHARDS }, () => ({ state: 'none', owner: -1 })),
    workers: HOSTS.map(() => ({ shard: -1, timer: 0, down: false })),
    log: [],
    died: -1,
    reclaimed: false,
    verified: 0,
  };
}

/** The finished, verified run, for the still frame. */
export function still(): VamooseState {
  const s = create();
  s.phase = 'done';
  s.t = 1000;
  s.shards.forEach((sh) => { sh.state = 'done'; });
  s.verified = SHARDS;
  s.log = [
    { text: 'w1 PUT shard-30.claim If-None-Match:* 200', cls: 't' },
    { text: 'w4 PUT shard-30.claim If-None-Match:* 412', cls: 't', hot: [38, 3] }, // 412 at the end
    { text: 'w4 PUT shard-31.claim If-None-Match:* 200', cls: 't' },
    { text: 'w4 complete shard-31 → Completed', cls: 't' },
    { text: 'verify: metadata certificate, exit 0', cls: '' },
  ];
  return s;
}

const say = (s: VamooseState, text: string, cls: Cls = 't', hot?: [number, number]) => {
  s.log = [...s.log, { text, cls, hot }].slice(-5);
};
/** A lost race: the trailing 412 is shown in inverse. */
const lost = (s: VamooseState, text: string) => say(s, text, 't', [text.length - 3, 3]);

function claim(s: VamooseState, w: number): void {
  const n = s.shards.findIndex((sh) => sh.state === 'pending');
  if (n < 0) return;
  // now and then another idle worker races for the same shard and gets 412
  const rival = s.workers.findIndex((o, i) => i !== w && !o.down && o.shard < 0);
  if (rival >= 0 && Math.random() < 0.3) lost(s, `w${rival + 1} PUT shard-${n}.claim If-None-Match:* 412`);
  s.shards[n] = { state: 'claimed', owner: w };
  s.workers[w].shard = n;
  s.workers[w].timer = 600 + Math.random() * 500;
  say(s, `w${w + 1} PUT shard-${n}.claim If-None-Match:* 200`);
}

export function step(s: VamooseState, dt: number): void {
  s.t += dt;
  if (s.phase === 'prepare') {
    const shown = Math.min(SHARDS, Math.floor((s.t / 2000) * SHARDS));
    for (let i = 0; i < shown; i++) if (s.shards[i].state === 'none') s.shards[i].state = 'pending';
    if (s.t >= T.copy) {
      s.phase = 'copy';
      s.t = 0;
      say(s, 'manifest.json written; the run starts', '');
    }
    return;
  }

  if (s.phase === 'copy') {
    if (s.died < 0 && s.t >= T.die && s.workers[DOWN].shard >= 0) {
      s.died = s.t;
      s.workers[DOWN].down = true;
      say(s, 'host-c stops answering', '');
    }
    s.workers.forEach((w, i) => {
      if (w.down) return;
      if (w.shard < 0) {
        // the stale claim goes to the first worker free once the lease runs out
        if (s.died >= 0 && !s.reclaimed && s.t - s.died >= T.stale) {
          const n = s.workers[DOWN].shard;
          s.reclaimed = true;
          say(s, `shard-${n} lease expired; claim is stale`, '');
          say(s, `w${i + 1} DELETE shard-${n}.claim If-Match:"${etag(n)}"`);
          say(s, `w${i + 1} PUT shard-${n}.claim If-None-Match:* 200`);
          s.shards[n].owner = i;
          s.workers[DOWN].shard = -1;
          w.shard = n;
          w.timer = 700;
          return;
        }
        claim(s, i);
        return;
      }
      w.timer -= dt;
      if (w.timer > 0) return;
      s.shards[w.shard].state = 'done';
      say(s, `w${i + 1} complete shard-${w.shard} → Completed`);
      w.shard = -1;
    });
    if (s.shards.every((sh) => sh.state === 'done')) {
      s.phase = 'verify';
      s.t = 0;
    }
    return;
  }

  if (s.phase === 'verify') {
    s.verified = Math.min(SHARDS, Math.floor((s.t / T.verifyMs) * SHARDS));
    if (s.t >= T.verifyMs) {
      s.phase = 'done';
      s.t = 0;
      say(s, 'verify: metadata certificate, exit 0', '');
    }
    return;
  }

  if (s.t >= T.doneMs) Object.assign(s, create());
}

const TEXT: Record<Phase, string> = {
  prepare: 'Scans with the bundled nfs-walker, uploads the Parquet index and manifest.json to S3, and the run starts.',
  copy: 'Workers on every host claim shards with a conditional PUT. One gets 200; the rest get 412 and pick another.',
  verify: 'Writers stopped: both trees are scanned independently and compared, type, size, metadata and links.',
  done: 'A metadata certificate. Exit 0 is clean, 2 means mismatches, 3 means the result was inconclusive.',
};
const CMD: Record<Phase, string> = {
  prepare: 'sudo vamoose prepare',
  copy: 'sudo systemctl enable --now vamoose-worker@main',
  verify: 'sudo vamoose verify --writers-stopped',
  done: 'sudo vamoose verify --writers-stopped',
};

export function render(s: VamooseState): string {
  const g = new Grid(COLS, 22);
  const reclaiming = s.phase === 'copy' && s.died >= 0;
  g.bar(0, 'VAMOOSE  DISTRIBUTED MIGRATION', (reclaiming && !s.reclaimed ? 'host down' : s.phase).toUpperCase());

  g.text(0, 2, 'WORKERS', 'w');
  g.text(26, 2, 'SHARDS', 'w');
  const done = s.shards.filter((sh) => sh.state === 'done').length;
  g.text(33, 2, `${done}/${SHARDS}`, 't');

  s.workers.forEach((w, i) => {
    const y = 3 + i;
    g.text(0, y, HOSTS[i], w.down ? 'w' : 't');
    g.text(7, y, `w${i + 1}`, 'w');
    if (w.shard >= 0) g.text(10, y, `shard-${w.shard}`, '');
    const status = w.down ? 'down' : w.shard >= 0 ? 'copy' : s.phase === 'copy' ? 'idle' : s.phase === 'prepare' ? 'wait' : 'done';
    g.text(19, y, status, w.down ? 'i' : 'w');
  });

  s.shards.forEach((sh, n) => {
    const x = 26 + (n % 8) * 2;
    const y = 3 + Math.floor(n / 8);
    if (sh.state === 'none') return;
    if (sh.state === 'pending') g.put(x, y, '·', 'w');
    else if (sh.state === 'claimed') g.put(x, y, String(sh.owner + 1), s.workers[sh.owner].down ? 'w' : 'i');
    else g.put(x, y, '▄', n < s.verified ? 't' : ''); // a half block keeps the rows apart
  });

  g.text(0, 8, 'CLAIM LOG  s3://<bucket>/shards/', 'w');
  s.log.forEach((l, i) => {
    g.text(0, 9 + i, l.text, l.cls);
    if (l.hot) g.tint(l.hot[0], 9 + i, l.hot[1], 'i');
  });

  const used = command(g, 15, CMD[s.phase]);
  paragraph(g, 15 + used, (reclaiming && !s.reclaimed
    ? 'host-c goes down holding a shard. When its lease runs out, another worker deletes the stale claim and takes it.'
    : TEXT[s.phase]).toUpperCase());
  return g.html();
}
