# nathansuttie.com

Personal site. Vite + TypeScript, deployed to GitHub Pages (CNAME → nathansuttie.com).

## Architecture truth (README is stale)

- The README describes a WebGPU Gray-Scott reaction-diffusion sim. That was removed;
  what runs is a CPU Canvas-2D flood-growth animation, used ONLY for the home-page title.
  Every other route is plain DOM.
- The whole site is ONE generated `index.html` (repo root). `scripts/build-content.ts`
  bakes every page into it as sibling `<article class="page-content">` elements by
  string-replacing placeholder comments in `src/index.template.html`. "Routing" is
  toggling an `.active` class (`src/main.ts`), History API, no hash.
- `scripts/prerender-routes.ts` (post `vite build`) copies `dist/index.html` to
  `dist/<route>/index.html` for every route (GitHub Pages has no rewrites) and
  generates `dist/sitemap.xml` from the same route list. Never hand-edit a sitemap.

## Content model

- `content/projects/<slug>/index.md` — a project. Frontmatter: `title`, `description`,
  `status` (ongoing | shipped | experiment | dormant), `repo` (URL), `demo`
  (URL or `/demos/<name>/`), optional `date`.
- `content/projects/<slug>/log/YYYY-MM-DD-<title>.md` — dated journal entries
  (frontmatter `title`; date comes from the filename prefix). Rendered newest-first
  on the project page. A project's "last entry" date and its position in the projects
  list (freshest first) come from these.
- Flat `content/projects/<slug>.md` still works for journal-less projects (see
  `overtone.md`).
- Raw HTML passes through markdown unsanitised. `<div class="gallery">` +
  `<figure>/<img>` gives an image grid; assets live in `public/projects/<slug>/`.

## Media loading gotcha (do not "fix" this)

Every page ships in the DOM at once and `display:none` does not stop img/iframe
fetches, so `build-content.ts` rewrites `src=` to `data-src=` inside project pages
(`lazifyMedia`). `src/main.ts` sets `src` when a page activates and REMOVES iframe
`src` on navigate-away so demo audio/game loops stop. If media doesn't load, check
that path, not the markdown.

## Demos

- Live demos are static builds in `public/demos/<name>/` (undo, sound-designer) or
  external URLs (rockets and pitch-perfect embed their GitHub Pages deployments).
- undo's demo: `cd ~/projects/undo && npm run build`, copy `dist/game.html` to
  `public/demos/undo/index.html`.
- Vite dev doesn't resolve `/demos/<name>/` directory URLs; a small middleware in
  `vite.config.ts` does. Production (GitHub Pages) resolves them natively.

## Admin editor

`public/admin/index.html` is a self-contained editor at `/admin/`. It commits
markdown to `main` via the GitHub contents API (fine-grained PAT scoped to this
repo, Contents read/write, held in localStorage under `admin-gh-token`); the
deploy workflow then rebuilds the site. "New journal entry" creates
`content/projects/<proj>/log/<date>-<slug>.md`; "edit a page" edits any
`content/**/*.md` raw. No build step touches it — it is plain HTML/JS with
marked from jsdelivr for preview. Never ask for or handle the PAT in chat.

## Conventions

- Site chrome is lowercase; 2px `#444` borders, Geo font for UI text, palette
  `#0A0E14` / `#e8e4de` / accents `#8CA6B8` (ongoing), `#c4a77d` (shipped).
- Dates render day-first (en-AU).
- Journal entries are written in Nathan's voice: plain, no em dashes, Australian
  English. Draft from git history; he edits before publish.
