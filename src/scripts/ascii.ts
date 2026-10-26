// A character grid for the terminal-screen demos. Screens draw into a Grid and
// render it to HTML: one string of text with <span> runs for each colour class.
//
// Classes (styled in demo.css under [data-ui] .term):
//   ''  amber, the default ink      'w' wire, dim amber      't' white text
//   'd' dark, background dots       'i' inverse (amber block, ink text)

export type Cls = '' | 'w' | 't' | 'd' | 'i';
export type Cell = [number, number];

export const COLS = 46;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export class Grid {
  private ch: string[][];
  private cls: Cls[][];

  constructor(public cols: number, public rows: number) {
    this.ch = Array.from({ length: rows }, () => Array(cols).fill(' '));
    this.cls = Array.from({ length: rows }, () => Array(cols).fill(''));
  }

  put(x: number, y: number, ch: string, c: Cls = ''): void {
    if (y < 0 || y >= this.rows || x < 0 || x >= this.cols) return;
    this.ch[y][x] = ch;
    this.cls[y][x] = c;
  }

  at(x: number, y: number): string {
    return this.ch[y]?.[x] ?? ' ';
  }

  text(x: number, y: number, s: string, c: Cls = ''): void {
    [...s].forEach((ch, i) => this.put(x + i, y, ch, c));
  }

  /** Recolour a run of cells without changing their characters. */
  tint(x: number, y: number, w: number, c: Cls): void {
    for (let i = 0; i < w; i++) if (y >= 0 && y < this.rows && x + i < this.cols) this.cls[y][x + i] = c;
  }

  hline(x0: number, x1: number, y: number, c: Cls = 'w', ch = '─'): void {
    for (let x = x0; x <= x1; x++) this.put(x, y, ch, c);
  }

  vline(x: number, y0: number, y1: number, c: Cls = 'w', ch = '│'): void {
    for (let y = y0; y <= y1; y++) this.put(x, y, ch, c);
  }

  /** A box in single, double or dashed lines (dashed reads as bypassed or gone). */
  box(x: number, y: number, w: number, h: number, c: Cls = 'w', style: 'single' | 'double' | 'dashed' = 'single'): void {
    const [tl, tr, bl, br, hz, vt] = { single: '┌┐└┘─│', double: '╔╗╚╝═║', dashed: '┌┐└┘┄┆' }[style];
    this.put(x, y, tl, c);
    this.put(x + w - 1, y, tr, c);
    this.put(x, y + h - 1, bl, c);
    this.put(x + w - 1, y + h - 1, br, c);
    this.hline(x + 1, x + w - 2, y, c, hz);
    this.hline(x + 1, x + w - 2, y + h - 1, c, hz);
    this.vline(x, y + 1, y + h - 2, c, vt);
    this.vline(x + w - 1, y + 1, y + h - 2, c, vt);
  }

  /** A full-width inverse bar: title on the left, status on the right. */
  bar(y: number, left: string, right: string): void {
    const s = ` ${left}`.padEnd(this.cols - right.length - 1) + right + ' ';
    this.text(0, y, s.slice(0, this.cols), 'i');
  }

  html(): string {
    return this.ch
      .map((row, y) => {
        let out = '';
        let run = '';
        let cur: Cls = this.cls[y][0];
        const flush = () => {
          if (!run) return;
          out += cur ? `<span class="${cur}">${run}</span>` : run;
          run = '';
        };
        row.forEach((ch, x) => {
          const c = this.cls[y][x];
          if (c !== cur) {
            flush();
            cur = c;
          }
          run += ESC[ch] ?? ch;
        });
        flush();
        return out.replace(/\s+$/, '');
      })
      .join('\n');
  }
}

/** The cells visited stepping orthogonally through a list of waypoints. */
export function cells(waypoints: Cell[]): Cell[] {
  const out: Cell[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    let [x, y] = waypoints[i - 1];
    const [x1, y1] = waypoints[i];
    const dx = Math.sign(x1 - x);
    const dy = Math.sign(y1 - y);
    while (x !== x1 || y !== y1) {
      if (x !== x1) x += dx;
      else y += dy;
      out.push([x, y]);
    }
  }
  return out;
}

/** The cell a fraction p (0..1) of the way along a path. */
export const cellAt = (path: Cell[], p: number): Cell => path[Math.min(path.length - 1, Math.floor(p * path.length))];

/** Word-wraps text to lines of at most w characters. */
export function wrap(text: string, w: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > w) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Writes a shell command at row y, wrapping long ones with a trailing backslash. Returns rows used. */
export function command(g: Grid, y: number, cmd: string): number {
  const lines = wrap(cmd, g.cols - 4);
  lines.forEach((l, i) => {
    const last = i === lines.length - 1;
    g.text(0, y + i, i === 0 ? '$ ' : '    ', 'w');
    g.text(i === 0 ? 2 : 4, y + i, last ? l : `${l} \\`, 't');
  });
  return lines.length;
}

/** Writes wrapped text from row y. Returns rows used. */
export function paragraph(g: Grid, y: number, text: string, c: Cls = ''): number {
  const lines = wrap(text, g.cols);
  lines.forEach((l, i) => g.text(0, y + i, l, c));
  return lines.length;
}
