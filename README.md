# bgsr.dev

Source for [bgsr.dev](https://bgsr.dev), the personal site of Blake Golliher: Field CTO at VAST
Data, and the author of shunt, mongoose, nfs-walker and s3slower.

It is one static page built with [Astro](https://astro.build). Each tool gets a live terminal
screen, drawn in box characters, that animates what the tool does using the commands and figures
from that tool's README.

## Run it

You need Node 22 or newer.

```sh
npm install
npm run dev       # http://localhost:4321, reloads on save
npm run build     # static site in ./dist
npm run preview   # serve ./dist locally (Astro 7 runs it in the background; stop with `npx astro preview stop`)
```

## Deploy

Every push to `main` builds the site and publishes `dist/` to GitHub Pages
(`.github/workflows/deploy.yml`). `public/CNAME` points the Pages site at `bgsr.dev`. You can also
run the workflow by hand from the Actions tab.

## Change the content

[UPDATING.md](UPDATING.md) walks through each of these step by step, git commands included.
Most edits are data, not markup:

| To change | Edit |
| --- | --- |
| The tools: name, link, summary, the line under it | `src/data/projects.json` |
| The career section (taken from the résumé at r.blake.engineering) | `src/data/experience.json` |
| The opening sentence, the intro, the bio | `src/components/Hero.astro`, `src/components/Career.astro` |
| The email, city and contact line | `src/components/Contact.astro` |
| Photo credits and footer links | `src/components/Footer.astro` |

Each entry in `projects.json` needs an `id`. `src/components/Tools.astro` maps that id to its
demo component. A tool with no demo in that map gets `BasicDemo`, a still screen built from its
JSON (name, `git clone` line, summary, note). To animate it, add a screen in
`src/scripts/screens/` and a demo in `src/components/demos/`, and map its id to the demo.

## How the page is put together

```
src/
├── pages/index.astro        the page: hero, tools, career, contact, footer; scroll-in reveals
├── layouts/Layout.astro     <head>, fonts, meta and Open Graph tags
├── components/
│   ├── Hero.astro           full name across the top, portrait, the "Moving data" intro
│   ├── Tools.astro          sticky stage: index on the left, the current tool's demo on the right
│   ├── Career.astro         heading, bio, roles with their bullets, education
│   ├── Contact.astro        the email address set as display type
│   ├── Footer.astro         tool links, photo credit, legal line
│   └── demos/               one terminal screen per tool: still frame + animation script
├── scripts/
│   ├── ascii.ts             the character grid the screens draw into, rendered to HTML
│   ├── screens/             one module per tool: its simulation and how it draws a frame
│   ├── demo-kit.ts          runs a screen only while it is visible; repaints its <pre>
│   └── fit.ts               sizes a one-line display element to the full width
└── styles/
    ├── global.css           colour, type and spacing tokens; buttons, links, entrance motion
    └── demo.css             the terminal screens (scoped under [data-ui]) and their font
public/
├── fonts/                   IBM Plex Mono, self-hosted, with its licence
├── images/                  portrait and the 1942 rail yard photograph
└── favicon.svg, CNAME
```

### The tools section

On screens 1000px and wider, `Tools.astro` pins a full-height stage for just under two screens of
scrolling. Scroll position picks the current tool: its summary shows on the left and its demo wipes
in on the right. The index rows are buttons that scroll to that tool. Narrower screens, and browsers
without JavaScript, get the tools stacked one after another.

### The demos

Each tool is drawn as an 80s-style terminal screen: 46 columns of IBM Plex Mono in amber on black,
with box-drawing lines, block-character packets and an inverse title bar.

| Screen | What it shows |
| --- | --- |
| shunt | A bucket moving from cluster A to cluster B: adopt, ramp, migrate, cutover, step-out. The `WRITES TO B` gauge under it is a real slider, the one interactive control on the page; it sets the write split the way `shunt ramp` does. |
| mongoose | A two-pane file manager: copy, people changing files, sync, then the cutover reading every file back from both servers. |
| vamoose | A run log: `vamoose prepare` uploads the shard index, four workers claim shards with `PUT … If-None-Match:*` (one gets 200, a rival gets 412), host-c goes down and its stale claim is reclaimed with `DELETE If-Match` then `PUT`, and `vamoose verify` writes a metadata certificate. The S3 calls follow vamoose's `docs/CLAIM_PROTOCOL.md`. |
| nfs-walker | `tree` output growing as workers list directories with READDIRPLUS, beside the 32 Parquet shards the entries land in. The counters replay the 810.8 M-file production run from the nfs-walker README as a time-lapse. Each scan ends with `nfs-walker serve` and a sketch of the built-in dashboard paging through its views. |
| nfs-gaze | Its live per-operation view, after the sample output in its README: IOPS, RTT and EXE for each NFS op, refreshed every second from `/proc/self/mountstats`. A write latency spike lights up the WRITE row, then `--ops` filters the view to metadata calls. |
| s3slower | Requests from five S3 clients passing the eBPF probes in the TLS library, each landing as a row in the live latency table. |
| vast-bucket-policy-manager | Its TUI, after the picture in its README, narrowed to 46 columns: pick a profile and a bucket, the policy loads with a typo the validator flags, it is fixed in INSERT mode and saved, with the backup written first. |

How a screen works:

- `src/scripts/screens/<tool>.ts` holds the simulation (`create`, `step`) and a pure `render(state)`
  that draws one frame into a `Grid` from `ascii.ts` and returns HTML.
- The demo component calls `render` at build time, so the page ships with a still frame that works
  without JavaScript. In the browser, `animate()` from `demo-kit.ts` steps the state every frame and
  repaints the `<pre>` up to 30 times a second, only while the screen is on screen, its tool is the
  current one, and the tab is visible.
- With `prefers-reduced-motion: reduce` nothing animates; each screen keeps its still frame (the
  shunt slider still redraws it).
- The font size is set so 46 columns fill the frame (`demo.css`), which keeps the text at 13px or
  more on a 390px phone. Keep screens within 46 columns.
- The root of each demo carries `data-ui`, which marks it as an interface fragment. Its CSS lives
  under `[data-ui]` in `demo.css`.
- The commands are real commands from each tool's README. The file names, hashes, latency rows and
  dashboard chart shapes are illustrative.

## Design notes

The design came out of the [Taste skill](https://www.tasteskill.dev/) (direction: "the pinned
poster"). The idea is that something stays put while everything around it changes, which is also
what shunt and mongoose do for clients during a migration.

- **Colour:** orange ground (`--bg`), blue-black ink (`--ink`), white for the resting section. The
  tokens are at the top of `global.css`; use them rather than raw hex values.
- **Type:** Cabinet Grotesk (from Fontshare) for the page. IBM Plex Mono only inside the terminal
  screens. It is self-hosted from the complete font files because the hosted subsets leave out the
  box-drawing characters.
- **House rules:** headlines stay at two lines or fewer at every width. No small labels above
  headings, no gradients, no shadows on things at rest, no hairline dividers, and every section
  opens with a heading.
- **Motion:** transform and opacity only, ease-out curves, and every move has a reduced-motion
  fallback.

## Credits

- Rail yard photograph: Jack Delano, 1942, Farm Security Administration. Library of Congress,
  public domain, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:General_view_of_the_hump_yard_at_Proviso_yard,_C_%26_NW_RR_(i.e._Chicago_and_North_Western_railroad),_Chicago,_Ill._LCCN2017878012.tif).
- Typefaces: [Cabinet Grotesk](https://www.fontshare.com/fonts/cabinet-grotesk) by Indian Type
  Foundry, free for commercial use under the ITF Free Font License.
  [IBM Plex Mono](https://github.com/IBM/plex), SIL Open Font License 1.1
  (`public/fonts/IBMPlexMono-LICENSE.txt`).
