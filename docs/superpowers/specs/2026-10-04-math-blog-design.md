# Math Proofs / Devlog Blog — Design Spec

Date: 2026-10-04

## Purpose

A personal, public blog for writing up math proofs done for fun, built to be
completely free to run, require zero backend infrastructure, and be safe to
keep as a public GitHub repo (no secrets, no credentials, nothing to leak).
Designed to later extend to developer-log style posts without restructuring.

## Non-goals (v1)

- No database, no server, no user accounts, no comments.
- No tags/categories or filtering UI.
- No "ideas backlog" feature (considered, dropped — authoring only ever
  happens locally anyway, so a separate backlog added no real value over
  just starting a draft).
- No write-from-anywhere / mobile authoring. Authoring only happens on the
  author's own machine.

## Architecture

**Framework:** [Astro](https://astro.build), static output.

**Hosting:** GitHub Pages, served from the `gh-pages` output of a GitHub
Actions workflow using the official `withastro/action`. Deploys
automatically on every push to `main`.

**Content storage:** Markdown files committed directly to the git repo.
Git history is the only "database" and the only backup. No MongoDB, no
external database of any kind.

**Why this shape:** GitHub Pages can only serve static files — it cannot run
server code or hold secrets. Rather than bolt on a separate paid/free
backend just to support a web-based editor, authoring happens locally and
publishing happens via git push, which keeps the entire stack backend-free
and the public repo free of any credentials.

## Content model

Two locations, intentionally kept apart so publishing is structural, not
just a flag check:

- `drafts/` — repo root, **outside** `src/content/`. Anything here is
  invisible to Astro's build; it physically cannot appear on the live site.
- `src/content/posts/*.md` — Astro content collection. Anything here is
  built and published on the next deploy.

Frontmatter schema for a post:

```yaml
---
title: string
pubDate: date
description: string   # used for SEO meta + previews
type: "math" | "devlog"   # defaults to "math"; devlog added when that
                          # feature is built out, no migration needed
---
```

Pages:
- `/` — homepage, chronological list of published posts (newest first).
- `/posts/[slug]` — individual post page.
- `/about` — simple static bio page.

Extending to devlogs later means: start writing posts with
`type: devlog`, and add a small filter/section on the homepage. No schema
migration, no restructuring.

## Math, images, and video

- Math rendered at **build time** via `remark-math` + `rehype-mathjax` in
  Astro's markdown pipeline — no MathJax JS shipped to or run in the
  visitor's browser on the live site.
- Images/videos for a post live alongside it, e.g.
  `src/assets/posts/<slug>/`, referenced with normal markdown syntax.
- Guidance (not enforced): keep video clips small. GitHub hard-blocks any
  single file over 100MB, and a bloated repo history is annoying to work
  with. Prefer short, compressed clips; for anything long, embed an
  external link (e.g. an unlisted YouTube video) instead of committing the
  file.

## SEO & discoverability

All static, all free, no extra services required:
- Per-page `<title>` and meta description driven by post frontmatter.
- Open Graph + Twitter card tags, so shared links render previews properly.
- `sitemap.xml` via `@astrojs/sitemap`.
- `robots.txt`.
- RSS feed via `@astrojs/rss`.
- Canonical URLs and semantic heading structure throughout.

## View counter

Two independent pieces, both third-party, both free, both client-side-only
(no backend or secret of ours involved — nothing here needs to be hidden):

- **Public per-post badge:** a free hit-counter badge service (e.g. a
  `visitor-badge`/`hits`-style service) embedded as an `<img>` per post,
  keyed by post slug/URL. Shown to readers directly on the post.
- **Private analytics:** [GoatCounter](https://www.goatcounter.com) (free
  for personal/non-commercial use, privacy-friendly, no cookie banner
  needed) added via a single `<script>` tag with a public site ID. Gives a
  private dashboard (traffic, referrers, trends) visible only to the
  author on GoatCounter's site.

## Local editor tool

A standalone local-only tool, **separate from the Astro site's own
codebase**, so no authoring code or write-capable endpoint is ever part of
the deployed static output — not even as unreachable dead code. Started
locally via `npm run write` (small Node/Express server + a single page),
never deployed.

Features:
- Markdown textarea with a live-rendered preview pane next to it (math and
  images rendered client-side as you type, so the preview is a close
  approximation of the final published post).
- Drag-and-drop image/video upload: dropping a file copies it into
  `src/assets/posts/<slug>/` and inserts the markdown embed at the cursor.
- **Save Draft** — writes/updates the post file in `drafts/` with its
  frontmatter.
- **Publish** — on confirmation ("Commit & push '<title>' to main?"):
  1. Moves the file from `drafts/` into `src/content/posts/`, filling in
     `pubDate` if not already set.
  2. Runs `git add`, `git commit`, and `git push` to `main` on the user's
     behalf.
  3. The push triggers the existing GitHub Actions workflow, which builds
     and deploys the updated site automatically.

  The confirmation step exists purely as a guard against an accidental
  click — once confirmed, publishing is fully one-click end-to-end, with
  no further manual git steps required.

## Deployment & secrets

- GitHub Actions workflow (`withastro/action`) builds and deploys to
  GitHub Pages on every push to `main`.
- The repository stays public with **zero secrets** anywhere in it: no
  database credentials, no API keys. The only external identifier involved
  is the GoatCounter site ID, which is designed to be public (same
  category as a Google Analytics ID).

## Testing / verification approach

Given this is a static content site with no business logic to speak of,
"testing" here means:
- `astro build` succeeds locally and in CI before anything is considered
  shippable (catches broken frontmatter, broken MathJax syntax, broken
  links to assets).
- Manually verifying a full draft → publish → live cycle once end-to-end
  after the local editor tool is built, including confirming the GitHub
  Action deploy succeeds and the post renders correctly (math, images)
  live.
- No automated test suite is planned for v1 given the size and nature of
  the project; this can be revisited if the local editor tool grows more
  logic (e.g. slug generation, frontmatter validation) worth unit testing.
