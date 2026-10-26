// vast-bucket-policy-manager, drawn after the TUI in its README: profiles,
// buckets and the policy editor. A loaded policy has a typo the validator
// catches; it is fixed in INSERT mode and saved, with a backup written first.
// The whole screen is a pure function of the time into the loop.
import { Grid, COLS, paragraph, type Cls } from '../ascii';

const T = { connect: 900, buckets: 1400, pick: 2000, load: 2500, insert: 4300, fix: 5100, normal: 6100, prompt: 6600, save: 7500, loop: 12500 };
export const LOOP_MS = T.loop;
export const STILL_MS = 9000;

const PROFILES = ['lab', 'default', 'prod'];
const BUCKETS = ['bucket-x', 'bucket-y', 'bucket-z'];
const POLICY = (effect: string) => [
  '{',
  '  "Version": "2012-10-17",',
  '  "Statement": [{',
  `    "Effect": "${effect}",`,
  '    "Principal": "*",',
  '    "Action": "s3:GetObject",',
  '    "Resource": "arn:aws:s3:::bucket-x/*"',
  '  }]',
  '}',
];
const EDIT_LINE = 3;
const EDIT_COL = 2 + '    "Effect": "Al'.length; // where the missing l goes, inside the editor

/** JSON in three tones: keys white, values amber, punctuation dim. */
function json(g: Grid, x: number, y: number, line: string): void {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      const str = line.slice(i, end + 1);
      const isKey = line[end + 1] === ':';
      g.text(x + i, y, str, isKey ? 't' : '');
      i = end + 1;
    } else {
      g.put(x + i, y, ch, ch === ' ' ? '' : 'w');
      i++;
    }
  }
}

export function render(t: number): string {
  const g = new Grid(COLS, 22);
  const insert = t >= T.insert && t < T.normal;
  g.bar(0, 'VAST BUCKET POLICY MANAGER', insert ? 'INSERT' : 'NORMAL');

  const focus = t < T.buckets ? 0 : t < T.load ? 1 : 2;
  const edge = (pane: number): Cls => (focus === pane ? '' : 'w');

  // profiles and buckets, side by side
  g.box(0, 1, 22, 5, edge(0));
  g.text(2, 1, 'Profiles', edge(0) || 't');
  PROFILES.forEach((p, i) => {
    const y = 2 + i;
    g.text(1, y, i === 0 ? ` • ${p}` : `   ${p}`, i === 0 ? '' : 't');
    if (i === 0 && focus === 0) g.tint(1, y, 20, 'i');
  });
  g.box(24, 1, 22, 5, edge(1));
  const listed = t >= T.buckets;
  g.text(26, 1, listed ? 'Buckets (3)' : 'Buckets', edge(1) || 't');
  if (listed) {
    BUCKETS.forEach((b, i) => {
      const y = 2 + i;
      g.text(26, y, b, 't');
      if (i === 0 && t >= T.pick && focus === 1) g.tint(25, y, 20, 'i');
    });
  }

  // the editor
  g.box(0, 6, COLS, 11, edge(2));
  const loaded = t >= T.load;
  g.text(2, 6, loaded ? `Policy: bucket-x  -- ${insert ? 'INSERT' : 'NORMAL'} --` : 'Policy', edge(2) || 't');
  if (loaded) {
    const fixed = t >= T.fix;
    POLICY(fixed ? 'Allow' : 'Alow').forEach((line, i) => json(g, 2, 7 + i, line));
    if (insert) g.tint(fixed ? EDIT_COL + 1 : EDIT_COL, 7 + EDIT_LINE, 1, 'i');
  }

  // validation, then the status and help lines
  if (loaded) {
    if (t >= T.save) g.text(0, 17, '√ saved; backup in ~/.vast-bucket-manager/', 't');
    else if (t >= T.prompt) g.text(0, 17, ' save policy to bucket-x? y/N ', 'i');
    else if (t >= T.fix) g.text(0, 17, '√ policy looks valid', 't'); // the README shows a check-mark dingbat; a root sign stands in
    else g.text(0, 17, ' × Effect must be Allow or Deny ', 'i');
  }
  if (t >= T.connect) {
    g.text(0, 18, '• connected', '');
    g.text(12, 18, '· lab   TLS-skip ON', 'w');
  } else {
    g.text(0, 18, '  not connected', 'w');
  }
  g.text(0, 19, 'i edit · f format · s save · d delete · q quit', 'w');

  let text = 'Profiles come from your AWS config, endpoint and region included.';
  if (t >= T.buckets) text = 'Pick a bucket, and its policy loads into the editor.';
  if (t >= T.load) text = 'Checked as it loads: JSON syntax, then the IAM structure of every statement.';
  if (t >= T.insert) text = 'Press i and fix the typo in place. No vim, no put-bucket-policy.';
  if (t >= T.prompt) text = 'Every save writes the old and new policy to a backup before it touches the bucket.';
  paragraph(g, 20, text.toUpperCase());
  return g.html();
}
