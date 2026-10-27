# Updating bgsr.dev

How to change what the site says, try it on your own machine, and publish it. Every push to `main`
goes live at https://bgsr.dev within a couple of minutes.

Most changes are a single file:

| To change | Edit |
| --- | --- |
| The tools in "Tools I've authored" (also the footer links) | `src/data/projects.json` |
| The jobs in the career section | `src/data/experience.json` |
| Anything else: city, email, bio, photo | See [Other changes](#5-other-changes) |

Contents:

1. [One-time setup](#1-one-time-setup)
2. [Every change, step by step](#2-every-change-step-by-step)
3. [Projects](#3-projects)
4. [Experience](#4-experience)
5. [Other changes](#5-other-changes)
6. [Trying a bigger change on a branch first](#6-trying-a-bigger-change-on-a-branch-first)
7. [Undoing a change](#7-undoing-a-change)
8. [When something goes wrong](#8-when-something-goes-wrong)

---

## 1. One-time setup

You only need to do this on a new machine. Your Mac already has it at `~/projects/webpage`.

1. Check that you have Node 22 or newer:

   ```sh
   node --version        # should print v22.something or higher
   ```

2. Get the code and install its packages:

   ```sh
   cd ~/projects
   git clone https://github.com/blakegolliher/bgsr.dev.git webpage
   cd webpage
   npm install
   ```

3. Optional: check that the GitHub CLI is logged in, so you can watch deploys from the terminal:

   ```sh
   gh auth status
   ```

---

## 2. Every change, step by step

Do these in order, every time. The edits themselves are described in sections 3 to 5.

**Step 1. Go to the project and get the latest version.**

```sh
cd ~/projects/webpage
git checkout main
git pull
npm install           # only does anything if packages changed; safe to run every time
```

**Step 2. Start the local preview.**

```sh
npm run dev
```

Open http://localhost:4321 in your browser. Leave this running: the page reloads every time you
save a file. Open a second terminal tab for the git commands below.

**Step 3. Make your edit** in your editor (see sections 3 to 5), then save the file.

**Step 4. Look at it in the browser.** Check it at full width, then drag the window narrow to see
the phone layout.

**Step 5. Build it the way the server will.** Stop the preview with `Ctrl+C`, then run:

```sh
npm run build
```

The last line should say `Complete!`. If it shows an error instead, see
[When something goes wrong](#8-when-something-goes-wrong). Nothing is published yet.

**Step 6. Review what you changed.**

```sh
git status            # lists the files you changed
git diff              # shows the exact lines (press q to quit)
```

**Step 7. Commit.** Add the files you changed by name, then commit with a short message:

```sh
git add src/data/projects.json
git commit -m "Add newtool to the tools"
```

**Step 8. Push.** This is what publishes it.

```sh
git push
```

**Step 9. Watch the deploy.** Wait a few seconds for GitHub to start the run, then:

```sh
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

It finishes in about a minute with green checks. You can also watch it in the browser at
https://github.com/blakegolliher/bgsr.dev/actions.

**Step 10. Check the live site.** Open https://bgsr.dev. GitHub Pages lets browsers cache the page
for up to 10 minutes, so if you still see the old version, hard-refresh with `Cmd+Shift+R`.

---

## 3. Projects

File: `src/data/projects.json`

The file is a list of tools, one `{ … }` block per tool, in the order they appear on the page. The
same list feeds the footer links. Each block looks like this:

```json
{
  "id": "s3slower",
  "name": "s3slower",
  "url": "https://github.com/blakegolliher/s3slower",
  "kinds": "S3, eBPF, Go",
  "summary": "Times every S3 request leaving a Linux host from inside the TLS libraries, with eBPF. It works with any client and needs no SDK wrapper, no proxy and no code change.",
  "note": "Prometheus metrics on port 9000, installed as one RPM."
}
```

| Field | What it is | Rules |
| --- | --- | --- |
| `id` | Connects the tool to its animated demo | Lowercase, no spaces, different for every tool. Don't change an existing tool's `id`, or it loses its animation. |
| `name` | The tool's heading, its index row, its footer link and "… on GitHub" | Usually the same as the repo name. |
| `url` | Where "… on GitHub" and the footer link go | A full `https://` link. |
| `kinds` | The small grey tags | Short and comma-separated, like `NFS, Rust`. |
| `summary` | The main description | One to three sentences. |
| `note` | One short line under the summary | It's hidden on short laptop screens, so don't put anything essential here. |

JSON rules that catch everyone:

- Every block is separated from the next by a comma, but **the last block has no comma after it**.
- Inside a block, every line ends with a comma **except the last one** (`"note"`).
- Text goes in straight double quotes `"like this"`. For an apostrophe, use `’` or a plain `'`. If you
  need a double quote inside the text, write it as `\"`.

### Change the wording of an existing tool

1. Open `src/data/projects.json` and find the tool's block.
2. Change the text between the quotes of `summary`, `note` or `kinds`. Leave the quotes and the
   comma at the end of the line alone.
3. Follow [the steps in section 2](#2-every-change-step-by-step). The commit:

   ```sh
   git add src/data/projects.json
   git commit -m "Reword the s3slower summary"
   git push
   ```

### Add a tool

1. Open `src/data/projects.json`.
2. Copy an existing block, from its `{` to its `}`.
3. Paste it where you want the new tool to appear. Make sure there is a comma between it and the
   block before it, and between it and the block after it. If it's the new last block, it gets no
   comma after it.
4. Fill in the five fields. For example, adding a tool at the end of the list:

   ```json
     {
       "id": "vast-bucket-policy-manager",
       "name": "vast-bucket-policy-manager",
       "url": "https://github.com/blakegolliher/vast-bucket-policy-manager",
       "kinds": "S3, TUI, Go",
       "summary": "A terminal UI for listing, editing and applying S3 bucket policies on VAST, AWS or any S3 store. It checks the JSON and the IAM structure as you type.",
       "note": "Every save and delete writes a before-and-after backup first."
     },
     {
       "id": "newtool",
       "name": "newtool",
       "url": "https://github.com/blakegolliher/newtool",
       "kinds": "NFS, Go",
       "summary": "What it does, in a sentence or two.",
       "note": "One short extra fact."
     }
   ]
   ```

   Note the comma added after the old last block's `}`.

5. Follow [the steps in section 2](#2-every-change-step-by-step). The commit:

   ```sh
   git add src/data/projects.json
   git commit -m "Add newtool to the tools"
   git push
   ```

A new tool shows up straight away with a plain terminal screen: its name in the title bar, the
`git clone` command, its summary and its note. It doesn't animate. An animated demo like the
others is a code job: a screen in `src/scripts/screens/`, a component in `src/components/demos/`,
and a line in the `demos` list at the top of `src/components/Tools.astro`. See "The demos" in
`README.md`.

Two things to check after adding a tool:

- On a laptop, the list of tool names at the bottom left gets tight past about nine tools. Look at
  it at your usual window size in step 4.
- The search-result and link-preview description names a few tools. If you want the new one
  mentioned, edit `description = '…'` near the top of `src/layouts/Layout.astro`.

### Remove a tool

1. Delete the tool's whole block, from `{` to `}`.
2. Fix the commas: blocks still need a comma between them, and the last block has none after it.
3. Follow [the steps in section 2](#2-every-change-step-by-step), with a commit message like
   `git commit -m "Remove oldtool from the tools"`.

You can leave the tool's demo files in place; they do no harm.

### Change the order

Cut a whole block and paste it where you want it, then fix the commas as above. The first block is
the tool shown first.

---

## 4. Experience

File: `src/data/experience.json`

A list of jobs, most recent first. Each block looks like this:

```json
{
  "company": "Tesla",
  "role": "Sr. Staff Engineer",
  "period": "Nov 2021 – 2025",
  "points": [
    "Platform Engineering ownership of the Storage Plank",
    "Responsible for Platform Engineering Object Storage company wide",
    "First principles around service offering and ownership"
  ]
}
```

| Field | What it is | Rules |
| --- | --- | --- |
| `company` | The big name on the left | |
| `role` | Your title | |
| `period` | The dates on the right | Use an en dash with spaces, `Nov 2021 – 2025` (on a Mac, the en dash is `Option` + `-`). Use `now` for the current job: `2025 – now`. |
| `points` | The bullets | A list of quoted lines separated by commas, with no comma after the last line. Use `[]` for none. |

The same JSON comma rules apply as for projects.

### Add bullets to the current job

VAST Data currently has no bullets. Change:

```json
"points": []
```

to:

```json
"points": [
  "First thing you do",
  "Second thing you do"
]
```

Then commit:

```sh
git add src/data/experience.json
git commit -m "Add VAST Data bullets"
git push
```

### Add a new job

1. Open `src/data/experience.json`.
2. Right after the opening `[` at the top, paste a new block followed by a comma:

   ```json
   [
     {
       "company": "New Company",
       "role": "Your Title",
       "period": "2027 – now",
       "points": [
         "What you do there"
       ]
     },
     {
       "company": "VAST Data",
       …
   ```

3. Change the previous job's period from `"2025 – now"` to its real end, for example
   `"2025 – 2027"`.
4. Follow [the steps in section 2](#2-every-change-step-by-step), with a commit message like
   `git commit -m "Add New Company to career"`.

### Fix a typo in an older job

Find the line, fix the text between the quotes, save, and follow
[the steps in section 2](#2-every-change-step-by-step).

### The rest of the career section

The heading ("Twenty years in infrastructure"), the bio paragraph and the education line aren't in
the JSON file. They are in `src/components/Career.astro`. Search that file for the words you want
to change, edit the text, and leave the tags around it alone.

---

## 5. Other changes

In each file, search for the text you want to change and edit only the words, not the `<tags>`
around them.

| To change | File | Look for |
| --- | --- | --- |
| The sentence under your name | `src/components/Hero.astro` | `Field CTO at VAST Data.` |
| The "Moving data" paragraph | `src/components/Hero.astro` | `Most of my work` |
| Career heading, bio, education | `src/components/Career.astro` | `Twenty years`, `Linux user`, `Education:` |
| Email address | `src/components/Contact.astro` | `const email = ` on line 2 |
| City | `src/components/Contact.astro` | `Grand Rapids, Michigan` |
| The line above the email | `src/components/Contact.astro` | `Write about storage` |
| Browser tab title | `src/pages/index.astro` | `title="Blake Golliher, storage engineer"` |
| Search and link-preview description | `src/layouts/Layout.astro` | `description = '` |

### Replace the photo

1. Get a JPG photo, ideally square and at least 1000 × 1000 pixels. It gets cropped to fill its
   space, with the crop centred a little above the middle, so keep your face in the upper half.
2. Save it over the old one, with the same name:

   ```sh
   cp ~/Downloads/your-photo.jpg ~/projects/webpage/public/images/blake.jpg
   ```

3. Check its size:

   ```sh
   sips -g pixelWidth -g pixelHeight public/images/blake.jpg
   ```

4. In `src/components/Hero.astro`, find `src="/images/blake.jpg" width="460" height="460"` and change
   `460` and `460` to the new width and height. This keeps the page from jumping while it loads.
5. Follow [the steps in section 2](#2-every-change-step-by-step). The commit:

   ```sh
   git add public/images/blake.jpg src/components/Hero.astro
   git commit -m "New portrait"
   git push
   ```

The same photo is used for link previews when the site is shared, so nothing else needs changing.

---

## 6. Trying a bigger change on a branch first

Only pushes to `main` publish the site. To work on something over several sittings, or to look at
it before it goes live, use a branch:

```sh
cd ~/projects/webpage
git checkout main
git pull
git checkout -b new-tools              # make a branch; any name works

# …edit, npm run dev, npm run build…

git add -A                             # stage every changed file (check git status first)
git commit -m "Add two new tools"
git push -u origin new-tools           # saves the branch on GitHub; does not publish
```

When you're happy with it, publish it by merging into `main`:

```sh
gh pr create --fill                    # opens a pull request from the branch
gh pr merge --merge --delete-branch    # merges it; the deploy starts
git checkout main
git pull
```

Then watch the deploy as in step 9.

---

## 7. Undoing a change

| Situation | Command | What it does |
| --- | --- | --- |
| Edited a file but haven't committed | `git restore src/data/projects.json` | Throws away your edits to that file. |
| Committed but haven't pushed | `git reset --soft HEAD~1` | Undoes the commit and keeps your edits, so you can fix them and commit again. |
| Already pushed, and it's live | `git revert HEAD` then `git push` | Adds a new commit that reverses the last one. The site redeploys without it. |

To undo an older pushed commit, find it with `git log --oneline`, then run `git revert <its id>`
followed by `git push`.

---

## 8. When something goes wrong

**`npm run build` fails with `trailing comma at line 7 column 3`, `Unexpected token` or similar.**
There's a typo in one of the JSON files, and the error gives the line number but not the file.
To find out which file it is:

```sh
node -e 'for (const f of ["src/data/projects.json", "src/data/experience.json"]) { try { JSON.parse(require("fs").readFileSync(f, "utf8")); console.log("ok   " + f) } catch (e) { console.log("BAD  " + f + ": " + e.message) } }'
```

Open the file marked `BAD` at the line from the build error. The usual causes:

- a comma after the last item
- a missing comma between two blocks
- a double quote inside the text that should be `\"` or `’`

**`git push` is rejected with "Updates were rejected" or "fetch first".** `main` on GitHub has a
commit you don't have, for example from an edit made on github.com. Run:

```sh
git pull --rebase
git push
```

**The deploy failed (red X in Actions).** See why:

```sh
gh run view --log-failed
```

It's almost always the same error `npm run build` would show locally. Fix it, commit and push again.

**The site didn't change.**

- Check that the run in Actions is green.
- Wait up to 10 minutes, or hard-refresh with `Cmd+Shift+R`.

**`npm run dev` picks a different port.** Another preview is already running. Use the address it
prints, for example http://localhost:4322, or stop the other one.

**An error mentions the Node version.** The site needs Node 22 or newer. Check with
`node --version`.
