// The still screen for a tool that has no demo of its own yet: its name in the
// title bar, the clone command, then the summary and note from projects.json.
import { Grid, COLS, command, paragraph } from '../ascii';

export interface Project { name: string; url: string; kinds: string; summary: string; note: string }

export function render(p: Project): string {
  const g = new Grid(COLS, 22);
  g.bar(0, p.name.toUpperCase(), 'README');
  let y = 2 + command(g, 2, `git clone ${p.url}`) + 1;
  y += paragraph(g, y, p.summary.toUpperCase(), 't') + 1;
  paragraph(g, y, p.note.toUpperCase());
  g.text(0, 21, p.kinds.toUpperCase(), 'w');
  return g.html();
}
