# Math Proofs / Devlog Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, static, zero-backend personal blog (Astro, deployed to GitHub Pages) for math proof write-ups, plus a standalone local-only authoring tool with live preview, drag-and-drop media, and one-click publish-and-deploy.

**Architecture:** An Astro static site at the repo root (content collection of markdown posts, MathJax rendering at build time, SEO metadata, RSS/sitemap, a third-party view counter) deployed via GitHub Actions on every push to `master`. A fully separate Node/Express app in `editor-tool/` — never bundled into the deployed site — provides a local web UI for drafting posts, saving drafts outside the Astro build's reach, and publishing (move + git commit + git push) in one click.

**Tech Stack:** Astro 7 (Content Layer API), remark-math / rehype-mathjax, @astrojs/sitemap, @astrojs/rss, GitHub Actions (`withastro/action` + `actions/deploy-pages`), Node.js + Express + gray-matter + multer + simple-git for the editor tool, Vitest for editor-tool unit tests.

## Global Constraints

- Everything must be free: no paid hosting, no paid database, no paid services of any kind.
- Zero secrets/credentials in the repo. The repo stays public.
- No database. Markdown files in git are the only content store.
- Authoring happens only locally (no mobile/remote editing).
- No tags/filtering, no ideas backlog, no comments, no user accounts (v1 scope, per spec).
- Drafts (`drafts/`) must live outside `src/content/` so they are structurally impossible for Astro to publish, not just filtered out.
- Node.js >= 22.12.0 required at the repo root — this is Astro 7's own
  `engines` floor, so CI and local dev must both use Node 22+. The
  `editor-tool/` sub-package only needs >= 18, but there is no reason to run
  it on anything older than the root requirement.
- **Deploy target is `https://thoughtlessnerd.github.io/blogs`** — a project
  page served from a subpath, so `base: '/blogs'` in `astro.config.mjs`.
- **The deploy branch is `master`, not `main`.** Every workflow trigger, git
  push target, and user-facing confirmation string must say `master`.
- **Every internal link must be base-aware.** Verified empirically on this
  project: `import.meta.env.BASE_URL` is `/blogs` — **no trailing slash** —
  so naive concatenation like `` `${BASE_URL}posts/` `` yields the broken
  `/blogsposts/`. Always build internal hrefs with the `withBase()` helper
  (created in Task 3). A hardcoded root-relative href such as `/about/` or
  `/posts/x/` is a defect: it 404s on the deployed site.
  Note `Astro.url.pathname` DOES already include the base, so canonical-URL
  construction via `new URL(Astro.url.pathname, Astro.site)` is correct
  as-is and must NOT be wrapped in `withBase()`.

---

## File Structure

```
blogs/
├── astro.config.mjs
├── package.json
├── .gitignore
├── src/
│   ├── content.config.ts          # content collection schema
│   ├── content/
│   │   └── posts/
│   │       └── hello-world.md     # example published post
│   ├── lib/
│   │   └── url.ts                 # withBase() — base-path-aware links
│   ├── layouts/
│   │   └── BaseLayout.astro       # shared head/SEO/nav/GoatCounter
│   ├── pages/
│   │   ├── index.astro            # homepage: chronological post list
│   │   ├── about.astro
│   │   ├── rss.xml.js
│   │   └── posts/
│   │       └── [id].astro         # post detail page + view badge
│   └── assets/
│       └── posts/<slug>/          # per-post IMAGES (Astro-optimized)
├── public/
│   ├── robots.txt
│   └── media/<slug>/              # per-post VIDEOS (copied verbatim)
├── drafts/
│   └── .gitkeep                   # outside src/content — never published
├── .github/
│   └── workflows/
│       └── deploy.yml
└── editor-tool/
    ├── package.json
    ├── server.js
    ├── lib/
    │   ├── posts.js                # slugify/saveDraft/readDraft/listDrafts/publishDraft
    │   └── git.js                  # commitAndPush wrapper
    ├── test/
    │   └── posts.test.js
    └── public/
        ├── index.html
        ├── editor.js
        └── style.css
```

---

### Task 1: Scaffold the Astro project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro` (default template output), `.gitignore`

**Interfaces:**
- Produces: a working Astro project at repo root that later tasks will add content/pages to.

- [ ] **Step 1: Scaffold with create-astro**

Run from `D:/CODE/blogs`:

```bash
npm create astro@latest . -- --template minimal --typescript strict --install --git false --yes
```

Expected: `package.json`, `astro.config.mjs`, `src/`, `public/` are created alongside the existing `docs/` folder. If the CLI prompts about the directory not being empty (because `docs/` and `.git` already exist), confirm to proceed — it will not touch those.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
dist/
.astro/
.env
editor-tool/node_modules/
```

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev`
Expected: output includes `Local http://localhost:4321/`. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 4: Verify production build succeeds**

Run: `npm run build`
Expected: exits 0, prints a `dist/` output summary with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json astro.config.mjs tsconfig.json src public .gitignore package-lock.json
git commit -m "Scaffold Astro project"
```

---

### Task 2: Content collection, math rendering, and homepage

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/posts/hello-world.md`
- Create: `src/pages/index.astro` (overwrite scaffold default)
- Modify: `astro.config.mjs`
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Produces: `posts` collection with schema `{ title: string, pubDate: Date, description: string, type: 'math' | 'devlog' (default 'math') }`, readable via `getCollection('posts')`; each entry has `.id` (slug) and `.data`.
- Consumes: nothing from earlier tasks beyond the scaffolded project.

- [ ] **Step 1: Install markdown/math dependencies**

```bash
npm install @astrojs/markdown-remark remark-math rehype-mathjax
```

`@astrojs/markdown-remark` is required explicitly: as of Astro 7, "Sätteri"
is the default markdown processor and it has **no** math support, so
`markdown.remarkPlugins` / `markdown.rehypePlugins` (the unified pipeline
that `remark-math` and `rehype-mathjax` plug into) only run when this
first-party Astro package is installed. Without it, `astro build` fails with
a config validation error naming this exact package. It is free and
first-party — no constraint concerns.

- [ ] **Step 2: Configure math rendering in `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

export default defineConfig({
  // TODO before first deploy (Task 5): replace with your real GitHub Pages
  // URL, e.g. site: 'https://yourusername.github.io', base: '/blogs'
  site: 'https://yourusername.github.io',
  base: '/blogs',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax],
  },
});
```

- [ ] **Step 3: Define the content collection schema**

Create `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string(),
    type: z.enum(['math', 'devlog']).default('math'),
  }),
});

export const collections = { posts };
```

- [ ] **Step 4: Add an example published post**

Create `src/content/posts/hello-world.md`:

```markdown
---
title: "Hello, Proofs"
pubDate: 2026-10-04
description: "First post: why this blog exists, plus a warm-up proof."
---

Welcome! As a warm-up, here's a classic: there are infinitely many primes.

Suppose, for contradiction, there are finitely many primes
$p_1, p_2, \ldots, p_n$. Let $N = p_1 p_2 \cdots p_n + 1$. Then $N$ is not
divisible by any $p_i$, so either $N$ itself is prime, or it has a prime
factor not in our list. Either way, we've found a prime outside
$\{p_1, \ldots, p_n\}$ — contradiction.

$$\blacksquare$$
```

- [ ] **Step 5: Build the homepage as a chronological post list**

Create/overwrite `src/pages/index.astro`:

```astro
---
import { getCollection } from 'astro:content';

const posts = (await getCollection('posts')).sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Math Proofs & Devlogs</title>
  </head>
  <body>
    <h1>Posts</h1>
    <ul>
      {posts.map((post) => (
        <li>
          <a href={`/posts/${post.id}/`}>{post.data.title}</a>
          — <time datetime={post.data.pubDate.toISOString()}>
            {post.data.pubDate.toDateString()}
          </time>
        </li>
      ))}
    </ul>
  </body>
</html>
```

(This page gets wrapped in the shared layout in Task 3 — kept plain here so this task's test is isolated to the content collection working.)

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: exits 0 with no Zod schema validation errors (the collection schema from Step 3 validates `hello-world.md`'s frontmatter at build time — a bad `pubDate` or `type` value would fail loudly here). Then:

```bash
grep -o '<title>[^<]*</title>' dist/index.html
grep -o 'Hello, Proofs' dist/index.html
```

Expected: both greps return a match — the homepage lists the example post's title. (The post's own detail page isn't built yet; that's added in Task 3.)

- [ ] **Step 7: Commit**

```bash
git add astro.config.mjs src/content.config.ts src/content/posts/hello-world.md src/pages/index.astro package.json package-lock.json
git commit -m "Add content collection, math rendering, and homepage list"
```

---

### Task 3: Shared layout (SEO/OG/view counter), post page, about page

**Files:**
- Create: `src/lib/url.ts`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/pages/posts/[id].astro`
- Create: `src/pages/about.astro`
- Modify: `src/pages/index.astro` (use the new layout + fix its base-path bug)

**Interfaces:**
- Produces: `withBase(path: string): string` from `src/lib/url.ts` — prefixes an
  app-absolute path with the configured base path.
- Produces: `BaseLayout.astro` accepting props `{ title: string, description: string }` with a default `<slot />` for page content.
- Consumes: `posts` collection from Task 2 (`getCollection('posts')`, `.id`, `.data.title/.description/.pubDate`).

- [ ] **Step 0: Write the base-path helper**

Task 2 shipped `src/pages/index.astro` with a hardcoded `/posts/${post.id}/`
href, which 404s under `base: '/blogs'`. This step adds the helper that fixes
it; later steps use it for every internal link.

Create `src/lib/url.ts`:

```ts
// import.meta.env.BASE_URL is the configured `base`. On this project it is
// "/blogs" with NO trailing slash (verified), and it is "/" when no base is
// set. Normalizing both ends makes the join safe in either case.
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
```

- [ ] **Step 1: Write `BaseLayout.astro`**

```astro
---
import { withBase } from '../lib/url';

interface Props {
  title: string;
  description: string;
}
const { title, description } = Astro.props;
// Astro.url.pathname already includes the base path — do NOT wrap in withBase.
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonicalURL} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="article" />
    <meta property="og:url" content={canonicalURL} />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <link rel="alternate" type="application/rss+xml" title="RSS" href={withBase('/rss.xml')} />
    <!-- Sign up free at https://www.goatcounter.com and replace YOUR_GOATCOUNTER_CODE -->
    <script
      data-goatcounter="https://YOUR_GOATCOUNTER_CODE.goatcounter.com/count"
      async
      src="//gc.zgo.at/count.js"></script>
  </head>
  <body>
    <nav>
      <a href={withBase('/')}>Home</a>
      <a href={withBase('/about/')}>About</a>
    </nav>
    <main>
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Rewrite `src/pages/index.astro` to use the layout**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { withBase } from '../lib/url';
import { getCollection } from 'astro:content';

const posts = (await getCollection('posts')).sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---
<BaseLayout title="Math Proofs & Devlogs" description="Math proofs done for fun, and the occasional devlog.">
  <h1>Posts</h1>
  <ul>
    {posts.map((post) => (
      <li>
        <a href={withBase(`/posts/${post.id}/`)}>{post.data.title}</a>
        — <time datetime={post.data.pubDate.toISOString()}>
          {post.data.pubDate.toDateString()}
        </time>
      </li>
    ))}
  </ul>
</BaseLayout>
```

- [ ] **Step 3: Write the post detail page with the view-counter badge**

Create `src/pages/posts/[id].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((post) => ({
    params: { id: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await render(post);
---
<BaseLayout title={post.data.title} description={post.data.description}>
  <article>
    <h1>{post.data.title}</h1>
    <time datetime={post.data.pubDate.toISOString()}>
      {post.data.pubDate.toDateString()}
    </time>
    <Content />
    <p>
      <img
        src={`https://visitor-badge.laobi.icu/badge?page_id=math-proofs-blog.${post.id}`}
        alt="view count"
        loading="lazy"
      />
    </p>
  </article>
</BaseLayout>
```

- [ ] **Step 4: Write the about page**

Create `src/pages/about.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="About" description="About this blog.">
  <h1>About</h1>
  <p>
    This is a personal blog for math proofs I work through for fun,
    and occasionally notes on things I'm building.
  </p>
</BaseLayout>
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: exits 0. Then:

```bash
grep -o '<title>[^<]*</title>' dist/posts/hello-world/index.html
grep -o 'visitor-badge.laobi.icu[^"]*' dist/posts/hello-world/index.html
grep -o '<title>[^<]*</title>' dist/about/index.html
```

Expected output: the post's title tag (`<title>Hello, Proofs</title>`), a `visitor-badge.laobi.icu/badge?page_id=math-proofs-blog.hello-world` match, and `<title>About</title>`.

Now verify the math actually renders on the post page — this is the first
build in which a post body is rendered at all, so it is the first real
end-to-end proof of the math pipeline:

```bash
grep -c 'mjx-container' dist/posts/hello-world/index.html
grep -c 'p_1 p_2' dist/posts/hello-world/index.html
```

Expected: the first returns a non-zero count (MathJax produced real markup).
The second must return `0` — a non-zero count means raw LaTeX leaked into the
page instead of being typeset.

Finally, verify every internal link is base-aware. These greps are the
regression test for the `withBase` helper:

```bash
grep -oE 'href="/[^"]*"' dist/index.html dist/about/index.html dist/posts/hello-world/index.html
```

Expected: EVERY emitted internal href starts with `/blogs/` (e.g.
`/blogs/posts/hello-world/`, `/blogs/about/`, `/blogs/rss.xml`). If you see a
bare `/posts/...`, `/about/`, or `/rss.xml` with no `/blogs` prefix, the
helper was not applied somewhere — fix it before committing. Also confirm no
malformed `/blogsposts/`-style path appears (that is the no-trailing-slash
concatenation bug):

```bash
grep -c 'blogsposts\|blogsabout\|blogsrss' dist/index.html dist/about/index.html dist/posts/hello-world/index.html
```

Expected: `0` for all three files.

- [ ] **Step 6: Commit**

```bash
git add src/lib src/layouts src/pages
git commit -m "Add base-path helper, shared layout with SEO/OG tags, post page, about page"
```

---

### Task 4: RSS feed, sitemap, robots.txt

**Files:**
- Create: `src/pages/rss.xml.js`
- Create: `public/robots.txt`
- Modify: `astro.config.mjs` (add `@astrojs/sitemap`)
- Modify: `package.json`

**Interfaces:**
- Consumes: `posts` collection from Task 2.
- Produces: `/rss.xml` and `/sitemap-index.xml` in the build output.

- [ ] **Step 1: Install sitemap and RSS integrations**

```bash
npm install @astrojs/sitemap @astrojs/rss
```

- [ ] **Step 2: Add the sitemap integration**

Modify `astro.config.mjs` — add the import and integration:

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

export default defineConfig({
  site: 'https://yourusername.github.io',
  base: '/blogs',
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax],
  },
});
```

- [ ] **Step 3: Add the RSS feed endpoint**

Create `src/pages/rss.xml.js`:

```js
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { withBase } from '../lib/url';

export async function GET(context) {
  const posts = await getCollection('posts');
  return rss({
    title: 'Math Proofs & Devlogs',
    description: 'Math proofs done for fun, and the occasional devlog.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      // withBase is required here: @astrojs/rss joins `link` onto `site`,
      // and `site` is the bare origin, so an unprefixed path would emit
      // https://thoughtlessnerd.github.io/posts/... (missing /blogs).
      link: withBase(`/posts/${post.id}/`),
    })),
  });
}
```

- [ ] **Step 4: Add `robots.txt`**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://thoughtlessnerd.github.io/blogs/sitemap-index.xml
```

(This is the final URL — the deploy target is
`https://thoughtlessnerd.github.io/blogs`.)

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: exits 0, and:

```bash
test -f dist/rss.xml && echo "rss ok"
test -f dist/sitemap-index.xml && echo "sitemap ok"
grep -o '<title>[^<]*</title>' dist/rss.xml
```

Expected output: `rss ok`, `sitemap ok`, and a title match containing `Math Proofs & Devlogs`.

Then verify the feed and sitemap emit correct absolute URLs that include the
`/blogs` base — a feed full of 404 links is worse than no feed:

```bash
grep -o '<link>[^<]*</link>' dist/rss.xml
grep -oE 'https://[^<]*' dist/sitemap-0.xml | head
```

Expected: every RSS `<link>` reads
`https://thoughtlessnerd.github.io/blogs/posts/<slug>/`, and the sitemap URLs
likewise all contain `/blogs/`. A URL missing `/blogs/`, or containing
`/blogsposts/`, is a defect — fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add astro.config.mjs src/pages/rss.xml.js public/robots.txt package.json package-lock.json
git commit -m "Add RSS feed, sitemap, and robots.txt"
```

---

### Task 5: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `astro.config.mjs` (finalize `site`/`base` once the GitHub repo exists)
- Modify: `public/robots.txt` (finalize sitemap URL to match)

**Interfaces:**
- Produces: automatic build+deploy to GitHub Pages on every push to `master`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: withastro/action@v3
        with:
          # Astro 7 requires Node >= 22.12.0 — do not drop this, the
          # action's default Node version is older and the build will fail.
          node-version: 22

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Confirm the repository and remote (already done)**

The public repo `thoughtlessnerd/blogs` already exists, `origin` is already
configured, and the branch is `master`. Verify rather than re-create:

```bash
git remote -v
git branch --show-current
```

Expected: `origin` points at `https://github.com/thoughtlessnerd/blogs.git`
and the current branch is `master`. Do not add a remote, do not rename the
branch, and do not push yet — finish Step 3 first.

- [ ] **Step 3: Finalize `site` in `astro.config.mjs`**

Task 2 left a placeholder. In `astro.config.mjs`, replace:
```js
  // TODO before first deploy (Task 5): replace with your real GitHub Pages
  // URL, e.g. site: 'https://yourusername.github.io', base: '/blogs'
  site: 'https://yourusername.github.io',
  base: '/blogs',
```
with the real value (and drop the now-stale TODO comment):
```js
  site: 'https://thoughtlessnerd.github.io',
  base: '/blogs',
```

`base` is already correct — only `site` changes. `public/robots.txt` was
already written with the final URL in Task 4, so it needs no change; confirm
it reads `https://thoughtlessnerd.github.io/blogs/sitemap-index.xml`.

Run `npm run build` and confirm it exits 0. Then re-confirm the absolute URLs
now use the real host:

```bash
grep -o '<link>[^<]*</link>' dist/rss.xml | head -3
```

Expected: `https://thoughtlessnerd.github.io/blogs/posts/<slug>/`.

- [ ] **Step 4: Enable GitHub Pages for Actions deployment**

In the GitHub repo's Settings → Pages, set "Source" to "GitHub Actions" (not "Deploy from a branch").

- [ ] **Step 5: Push and verify the deploy**

```bash
git add astro.config.mjs .github
git commit -m "Add GitHub Actions deploy workflow, finalize site URL"
git push -u origin master
```

Expected: in the GitHub repo's "Actions" tab, the "Deploy to GitHub Pages" workflow runs and completes with a green check. Then visit
`https://thoughtlessnerd.github.io/blogs/` and confirm the homepage loads with
the "Hello, Proofs" post listed, and that clicking through to the post works
(this is the first real-world proof that the base-path handling is correct).

---

### Task 6: Editor-tool scaffold (standalone Express app)

**Files:**
- Create: `editor-tool/package.json`
- Create: `editor-tool/server.js`
- Create: `editor-tool/public/index.html`
- Modify: `package.json` (root) — add a `write` convenience script

**Interfaces:**
- Produces: a server listening on port `5321`, serving static files from `editor-tool/public/`.
- This task has no dependency on Tasks 1-5's Astro internals beyond knowing `drafts/` and `src/content/posts/` are repo-root-relative paths (defined in Task 7).

- [ ] **Step 1: Create the editor-tool package**

Create `editor-tool/package.json`:

```json
{
  "name": "blog-editor-tool",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "gray-matter": "^4.0.3",
    "multer": "^1.4.5-lts.1",
    "simple-git": "^3.25.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install editor-tool dependencies**

```bash
cd editor-tool && npm install && cd ..
```

- [ ] **Step 3: Write a minimal `server.js`**

```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5321;
app.listen(PORT, () => {
  console.log(`Editor tool running at http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Add a placeholder UI page**

Create `editor-tool/public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Write a post</title>
</head>
<body>
  <h1>Editor tool coming together — UI added in Task 10.</h1>
</body>
</html>
```

- [ ] **Step 5: Add a root convenience script**

Modify root `package.json`, add to `"scripts"`:

```json
"write": "npm --prefix editor-tool run start"
```

- [ ] **Step 6: Verify the server runs and serves the page**

```bash
npm run write &
sleep 1
curl -s http://localhost:5321/ | grep -o '<h1>[^<]*</h1>'
kill %1
```

Expected output: `<h1>Editor tool coming together — UI added in Task 10.</h1>`

- [ ] **Step 7: Commit**

```bash
git add editor-tool package.json
git commit -m "Scaffold standalone editor-tool Express app"
```

---

### Task 7: Post file logic (`lib/posts.js`) with unit tests

**Files:**
- Create: `editor-tool/lib/posts.js`
- Create: `editor-tool/test/posts.test.js`
- Create: `editor-tool/vitest.config.js`

**Interfaces:**
- Produces:
  - `slugify(title: string): string`
  - `saveDraft({ draftsDir, slug, title, description, body, type? }): string` (returns file path)
  - `readDraft({ draftsDir, slug }): { title, description, type, pubDate?, body, slug }`
  - `listDrafts({ draftsDir }): Array<{ slug: string, title: string }>`
  - `publishDraft({ draftsDir, postsDir, slug }): string` (returns new file path; fills `pubDate` if missing; deletes the draft file)
- Consumes: nothing beyond Node's `fs`/`path` and the `gray-matter` package.

- [ ] **Step 1: Write the failing tests**

Create `editor-tool/vitest.config.js`:

```js
export default {
  test: {
    environment: 'node',
  },
};
```

Create `editor-tool/test/posts.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugify, saveDraft, readDraft, listDrafts, publishDraft } from '../lib/posts.js';

let tmpRoot, draftsDir, postsDir;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-editor-test-'));
  draftsDir = path.join(tmpRoot, 'drafts');
  postsDir = path.join(tmpRoot, 'posts');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('slugify', () => {
  it('lowercases and dashes a title', () => {
    expect(slugify('Hello, Proofs')).toBe('hello-proofs');
  });

  it('trims leading/trailing dashes from punctuation', () => {
    expect(slugify('  -- Edge Case -- ')).toBe('edge-case');
  });
});

describe('saveDraft / readDraft', () => {
  it('writes a draft file with frontmatter and reads it back', () => {
    saveDraft({
      draftsDir,
      slug: 'my-post',
      title: 'My Post',
      description: 'A test post',
      body: 'Hello world',
    });

    const draft = readDraft({ draftsDir, slug: 'my-post' });
    expect(draft.title).toBe('My Post');
    expect(draft.description).toBe('A test post');
    expect(draft.type).toBe('math');
    expect(draft.body.trim()).toBe('Hello world');
  });
});

describe('listDrafts', () => {
  it('returns an empty array when the drafts dir does not exist', () => {
    expect(listDrafts({ draftsDir })).toEqual([]);
  });

  it('lists saved drafts by slug and title', () => {
    saveDraft({ draftsDir, slug: 'a', title: 'A', description: 'x', body: 'x' });
    saveDraft({ draftsDir, slug: 'b', title: 'B', description: 'y', body: 'y' });

    const drafts = listDrafts({ draftsDir }).sort((x, y) => x.slug.localeCompare(y.slug));
    expect(drafts).toEqual([
      { slug: 'a', title: 'A' },
      { slug: 'b', title: 'B' },
    ]);
  });
});

describe('publishDraft', () => {
  it('moves the draft into postsDir and removes it from draftsDir', () => {
    saveDraft({ draftsDir, slug: 'to-publish', title: 'Publish Me', description: 'desc', body: 'body text' });

    publishDraft({ draftsDir, postsDir, slug: 'to-publish' });

    expect(fs.existsSync(path.join(draftsDir, 'to-publish.md'))).toBe(false);
    expect(fs.existsSync(path.join(postsDir, 'to-publish.md'))).toBe(true);
  });

  it('fills in pubDate if missing', () => {
    saveDraft({ draftsDir, slug: 'needs-date', title: 'Needs Date', description: 'desc', body: 'body' });

    publishDraft({ draftsDir, postsDir, slug: 'needs-date' });

    const raw = fs.readFileSync(path.join(postsDir, 'needs-date.md'), 'utf8');
    expect(raw).toMatch(/pubDate:/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd editor-tool && npx vitest run
```

Expected: FAIL — `Cannot find module '../lib/posts.js'` (file doesn't exist yet).

- [ ] **Step 3: Install gray-matter if not already present, then implement `lib/posts.js`**

`gray-matter` is already in `editor-tool/package.json` from Task 6. Create `editor-tool/lib/posts.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function saveDraft({ draftsDir, slug, title, description, body, type = 'math' }) {
  const fileContents = matter.stringify(body, { title, description, type });
  fs.mkdirSync(draftsDir, { recursive: true });
  const filePath = path.join(draftsDir, `${slug}.md`);
  fs.writeFileSync(filePath, fileContents, 'utf8');
  return filePath;
}

export function readDraft({ draftsDir, slug }) {
  const filePath = path.join(draftsDir, `${slug}.md`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  return { ...parsed.data, body: parsed.content, slug };
}

export function listDrafts({ draftsDir }) {
  if (!fs.existsSync(draftsDir)) return [];
  return fs
    .readdirSync(draftsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { data } = matter(fs.readFileSync(path.join(draftsDir, f), 'utf8'));
      return { slug, title: data.title };
    });
}

export function publishDraft({ draftsDir, postsDir, slug }) {
  const draftPath = path.join(draftsDir, `${slug}.md`);
  const raw = fs.readFileSync(draftPath, 'utf8');
  const parsed = matter(raw);

  if (!parsed.data.pubDate) {
    parsed.data.pubDate = new Date().toISOString().slice(0, 10);
  }

  const finalContents = matter.stringify(parsed.content, parsed.data);
  fs.mkdirSync(postsDir, { recursive: true });
  const postPath = path.join(postsDir, `${slug}.md`);
  fs.writeFileSync(postPath, finalContents, 'utf8');
  fs.unlinkSync(draftPath);
  return postPath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd editor-tool && npx vitest run
```

Expected: all tests PASS (7 tests across 4 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add editor-tool/lib editor-tool/test editor-tool/vitest.config.js editor-tool/package.json editor-tool/package-lock.json
git commit -m "Add post file logic (slugify/saveDraft/readDraft/listDrafts/publishDraft) with tests"
```

---

### Task 8: Save Draft and Publish API endpoints (with git commit+push)

**Files:**
- Create: `editor-tool/lib/git.js`
- Create: `editor-tool/test/git.test.js`
- Modify: `editor-tool/server.js`

**Interfaces:**
- Produces:
  - `createGitClient(repoRoot: string): SimpleGit`
  - `commitAndPush(git: SimpleGit, { files: string[], message: string }): Promise<void>`
  - `POST /api/drafts` (body: `{ title, description, body, type? }`) → `{ slug }`
  - `GET /api/drafts` → `Array<{ slug, title }>`
  - `GET /api/drafts/:slug` → draft contents
  - `POST /api/publish/:slug` → `{ ok: true }` or `{ error: string }`
- Consumes: `lib/posts.js` exports from Task 7.

- [ ] **Step 1: Write the failing test for `commitAndPush`**

Create `editor-tool/test/git.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { commitAndPush } from '../lib/git.js';

describe('commitAndPush', () => {
  it('adds, commits, and pushes to origin master', async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    };

    await commitAndPush(git, { files: ['a.md', 'b/'], message: 'Publish: a' });

    expect(git.add).toHaveBeenCalledWith(['a.md', 'b/']);
    expect(git.commit).toHaveBeenCalledWith('Publish: a');
    expect(git.push).toHaveBeenCalledWith('origin', 'master');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd editor-tool && npx vitest run test/git.test.js
```

Expected: FAIL — `Cannot find module '../lib/git.js'`.

- [ ] **Step 3: Implement `lib/git.js`**

```js
import { simpleGit } from 'simple-git';

export function createGitClient(repoRoot) {
  return simpleGit({ baseDir: repoRoot });
}

export async function commitAndPush(git, { files, message }) {
  await git.add(files);
  await git.commit(message);
  await git.push('origin', 'master');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd editor-tool && npx vitest run test/git.test.js
```

Expected: PASS.

- [ ] **Step 5: Wire the API endpoints into `server.js`**

Replace `editor-tool/server.js` with:

```js
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slugify, saveDraft, readDraft, listDrafts, publishDraft } from './lib/posts.js';
import { createGitClient, commitAndPush } from './lib/git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(REPO_ROOT, 'drafts');
const POSTS_DIR = path.join(REPO_ROOT, 'src/content/posts');
const ASSETS_DIR = path.join(REPO_ROOT, 'src/assets/posts');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/drafts', (req, res) => {
  res.json(listDrafts({ draftsDir: DRAFTS_DIR }));
});

app.get('/api/drafts/:slug', (req, res) => {
  try {
    res.json(readDraft({ draftsDir: DRAFTS_DIR, slug: req.params.slug }));
  } catch {
    res.status(404).json({ error: 'Draft not found' });
  }
});

app.post('/api/drafts', (req, res) => {
  const { title, description, body, type } = req.body;
  const slug = slugify(title);
  saveDraft({ draftsDir: DRAFTS_DIR, slug, title, description, body, type });
  res.json({ slug });
});

app.post('/api/publish/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const postPath = publishDraft({ draftsDir: DRAFTS_DIR, postsDir: POSTS_DIR, slug });

    const filesToStage = [postPath];
    const assetDir = path.join(ASSETS_DIR, slug);
    if (fs.existsSync(assetDir)) filesToStage.push(assetDir);

    const git = createGitClient(REPO_ROOT);
    await commitAndPush(git, { files: filesToStage, message: `Publish: ${slug}` });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5321;
app.listen(PORT, () => {
  console.log(`Editor tool running at http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Manually verify the draft/publish endpoints**

With the editor-tool's git repo clean (no pending changes you care about losing — check `git status` first):

```bash
npm run write &
sleep 1
curl -s -X POST http://localhost:5321/api/drafts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Draft","description":"desc","body":"Body text"}'
```

Expected: `{"slug":"test-draft"}` and `drafts/test-draft.md` now exists (check with `cat drafts/test-draft.md`).

```bash
curl -s -X POST http://localhost:5321/api/publish/test-draft
kill %1
git log -1 --oneline
git status
```

Expected: `{"ok":true}`, the latest commit is `Publish: test-draft`, `drafts/test-draft.md` is gone, `src/content/posts/test-draft.md` exists, and (since there's no `origin` remote configured in a fresh local test, or if there is one, it actually pushed) — if `git push` fails because there's no remote yet, that's expected in local testing before Task 5's `git remote add`; confirm the commit itself succeeded regardless. If you want to test the full push path, run this after Task 5 is complete and `origin` is configured.

Clean up the test artifact:
```bash
git rm src/content/posts/test-draft.md
git commit -m "Remove test draft used for manual verification"
```

- [ ] **Step 7: Commit**

```bash
git add editor-tool/lib/git.js editor-tool/test/git.test.js editor-tool/server.js
git commit -m "Add save-draft/publish API endpoints with git commit+push"
```

---

### Task 9: Drag-and-drop media upload endpoint

**Files:**
- Modify: `editor-tool/server.js`

**Interfaces:**
- Produces: `POST /api/upload/:slug` (multipart form field `file`) → `{ markdown: string }` — the ready-to-insert markdown/HTML snippet for the uploaded file.
- Consumes: `ASSETS_DIR` and `PUBLIC_MEDIA_DIR` constants and `app` from Task 8's `server.js`.

**Why images and videos are handled differently** (verified empirically on
this project — do not "simplify" this into one path):

- **Images** go to `src/assets/posts/<slug>/` and are referenced from the post
  markdown by a path *relative to the markdown file*:
  `../../assets/posts/<slug>/<file>`. Astro then processes them: a 10x10 PNG
  became `<img ... width="10" height="10" loading="lazy" decoding="async"
  src="/blogs/_astro/test.<hash>.webp">` — auto-converted to WebP, with
  intrinsic dimensions (prevents layout shift) and the `/blogs` base path
  injected automatically. That optimization and the automatic base handling
  are why images must use this route; it directly serves the SEO goal.
- **Videos** are NOT processed by Astro, so a `src/assets/...` path would not
  resolve. They go to `public/media/<slug>/` and are referenced with a literal
  absolute URL including the base: `/blogs/media/<slug>/<file>`. Files under
  `public/` are copied verbatim into the build.

- [ ] **Step 1: Add the upload route**

Modify `editor-tool/server.js` — add the `multer` import at the top:

```js
import multer from 'multer';
```

Add the `public/media` path constant next to the existing `ASSETS_DIR`
constant near the top of the file:

```js
const PUBLIC_MEDIA_DIR = path.join(REPO_ROOT, 'public/media');
```

Add this block before the `app.listen(...)` call at the bottom:

```js
// Images are processed by Astro (optimized + base-path injected), so they
// live in src/assets and are referenced relative to the markdown file.
// Videos are not processed, so they live in public/ and are referenced by a
// literal URL that must include the /blogs base path.
const BASE_PATH = '/blogs';

function isVideo(file) {
  return file.mimetype.startsWith('video/');
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const root = isVideo(file) ? PUBLIC_MEDIA_DIR : ASSETS_DIR;
      const dir = path.join(root, req.params.slug);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

app.post('/api/upload/:slug', upload.single('file'), (req, res) => {
  const { slug } = req.params;
  const name = req.file.originalname;
  const markdown = isVideo(req.file)
    ? `<video src="${BASE_PATH}/media/${slug}/${name}" controls></video>`
    : `![${name}](../../assets/posts/${slug}/${name})`;
  res.json({ markdown });
});
```

- [ ] **Step 2: Manually verify the upload endpoint for both media types**

Use a real PNG (not fake bytes — Astro will later actually decode it):

```bash
npm run write &
sleep 1
printf 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8DAwMDEwMDAwMAAAA4AAwHwYjkAAAAASUVORK5CYII=' | base64 -d > /tmp/test-image.png
curl -s -X POST http://localhost:5321/api/upload/test-draft -F "file=@/tmp/test-image.png;type=image/png"
echo
printf 'notarealvideo' > /tmp/test-clip.mp4
curl -s -X POST http://localhost:5321/api/upload/test-draft -F "file=@/tmp/test-clip.mp4;type=video/mp4"
kill %1
```

Expected, in order:
- `{"markdown":"![test-image.png](../../assets/posts/test-draft/test-image.png)"}`
  and the file exists at `src/assets/posts/test-draft/test-image.png`.
- `{"markdown":"<video src=\"/blogs/media/test-draft/test-clip.mp4\" controls></video>"}`
  and the file exists at `public/media/test-draft/test-clip.mp4`.

Clean up both:
```bash
rm -rf src/assets/posts/test-draft public/media/test-draft
```

- [ ] **Step 3: Make `publish` stage uploaded media from BOTH locations**

Task 8's publish handler only stages `ASSETS_DIR/<slug>`. Now that videos
land in `public/media/<slug>`, publishing a post with a video would commit the
markdown that references it but not the file itself — a broken video on the
live site. In `editor-tool/server.js`, find this block in the
`/api/publish/:slug` handler:

```js
    const filesToStage = [postPath];
    const assetDir = path.join(ASSETS_DIR, slug);
    if (fs.existsSync(assetDir)) filesToStage.push(assetDir);
```

and replace it with:

```js
    const filesToStage = [postPath];
    for (const dir of [path.join(ASSETS_DIR, slug), path.join(PUBLIC_MEDIA_DIR, slug)]) {
      if (fs.existsSync(dir)) filesToStage.push(dir);
    }
```

- [ ] **Step 4: Verify both media directories get staged**

```bash
npm run write &
sleep 1
curl -s -X POST http://localhost:5321/api/drafts -H "Content-Type: application/json" -d '{"title":"Media Stage Test","description":"d","body":"b"}'
echo
printf 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8DAwMDEwMDAwMAAAA4AAwHwYjkAAAAASUVORK5CYII=' | base64 -d > /tmp/s.png
printf 'x' > /tmp/s.mp4
curl -s -X POST http://localhost:5321/api/upload/media-stage-test -F "file=@/tmp/s.png;type=image/png" >/dev/null
curl -s -X POST http://localhost:5321/api/upload/media-stage-test -F "file=@/tmp/s.mp4;type=video/mp4" >/dev/null
kill %1
```

Then confirm the publish commit contains all three paths. Note this performs
a real commit; it will also attempt a push, which may fail if the deploy
workflow is not yet set up — the commit is what matters here:

```bash
curl -s -X POST http://localhost:5321/api/publish/media-stage-test
```

Wait — the server was stopped above, so restart it before publishing. Correct
order: start server, create draft, upload both files, publish, then stop.

After publishing, verify:
```bash
git show --stat HEAD | grep -E "s\.png|s\.mp4|media-stage-test"
```

Expected: the commit includes `src/content/posts/media-stage-test.md`,
`src/assets/posts/media-stage-test/s.png`, and
`public/media/media-stage-test/s.mp4`.

Then remove the test artifacts:
```bash
git rm -r --quiet src/content/posts/media-stage-test.md src/assets/posts/media-stage-test public/media/media-stage-test
git commit -m "Remove media staging test artifacts"
```

- [ ] **Step 5: Commit**

```bash
git add editor-tool/server.js editor-tool/package.json editor-tool/package-lock.json
git commit -m "Add drag-and-drop media upload endpoint"
```

---

### Task 10: Editor UI — markdown textarea, live preview, buttons, drag-and-drop

**Files:**
- Modify: `editor-tool/public/index.html`
- Create: `editor-tool/public/editor.js`
- Create: `editor-tool/public/style.css`

**Interfaces:**
- Consumes: `/api/drafts` (GET/POST), `/api/publish/:slug` (POST), `/api/upload/:slug` (POST) from Tasks 8-9.
- Produces: no new interfaces for other tasks to consume — this is a leaf UI.

- [ ] **Step 1: Write the UI shell**

Replace `editor-tool/public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Write a post</title>
  <link rel="stylesheet" href="/style.css" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    window.MathJax = { tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] } };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" id="MathJax-script" async></script>
</head>
<body>
  <header>
    <input id="title" placeholder="Post title" />
    <input id="description" placeholder="Short description (for SEO)" />
    <select id="type">
      <option value="math">math</option>
      <option value="devlog">devlog</option>
    </select>
    <button id="saveDraft">Save Draft</button>
    <button id="publish">Publish</button>
  </header>
  <main id="dropzone">
    <textarea id="editor" placeholder="Write markdown here..."></textarea>
    <div id="preview"></div>
  </main>
  <script type="module" src="/editor.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the styling**

Create `editor-tool/public/style.css`:

```css
body { font-family: system-ui, sans-serif; margin: 0; }
header { display: flex; gap: 0.5rem; padding: 0.75rem; border-bottom: 1px solid #ccc; }
header input { flex: 1; padding: 0.4rem; }
#dropzone { display: flex; height: calc(100vh - 60px); }
#editor, #preview { flex: 1; padding: 1rem; overflow-y: auto; box-sizing: border-box; }
#editor { border: none; resize: none; font-family: ui-monospace, monospace; font-size: 1rem; }
#preview { border-left: 1px solid #ccc; }
```

- [ ] **Step 3: Write the client logic**

Create `editor-tool/public/editor.js`:

```js
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const typeSelect = document.getElementById('type');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const dropzone = document.getElementById('dropzone');

let currentSlug = null;

function renderPreview() {
  preview.innerHTML = marked.parse(editor.value);
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([preview]);
  }
}

editor.addEventListener('input', renderPreview);

document.getElementById('saveDraft').addEventListener('click', async () => {
  const res = await fetch('/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: titleInput.value,
      description: descriptionInput.value,
      type: typeSelect.value,
      body: editor.value,
    }),
  });
  const data = await res.json();
  currentSlug = data.slug;
  alert(`Draft saved: ${currentSlug}`);
});

document.getElementById('publish').addEventListener('click', async () => {
  if (!currentSlug) {
    alert('Save a draft first.');
    return;
  }
  const confirmed = confirm(`Commit & push "${titleInput.value}" to master?`);
  if (!confirmed) return;

  const res = await fetch(`/api/publish/${currentSlug}`, { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    alert('Published and pushed to master!');
  } else {
    alert(`Publish failed: ${data.error}`);
  }
});

dropzone.addEventListener('dragover', (e) => e.preventDefault());
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (!currentSlug) {
    alert('Save a draft first so there is a place to put media.');
    return;
  }
  const file = e.dataTransfer.files[0];
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/upload/${currentSlug}`, { method: 'POST', body: formData });
  const data = await res.json();
  // The server decides the correct markdown for the media type — images get
  // an Astro-processed relative path, videos a literal /blogs/media URL.
  editor.value += `\n${data.markdown}\n`;
  renderPreview();
});
```

- [ ] **Step 4: Manual browser verification**

```bash
npm run write
```

Open `http://localhost:5321` in a browser and verify, in order:
1. Typing in the textarea updates the preview pane live.
2. Typing `$x^2$` in the textarea renders as a rendered math expression (not literal `$x^2$`) in the preview.
3. Clicking "Save Draft" with a title filled in shows an alert with the slug, and `drafts/<slug>.md` appears on disk.
4. Dragging an image file onto the editor area uploads it and inserts a
   `![...](../../assets/posts/<slug>/<file>)` markdown line. **The image will
   NOT render in the preview pane** — that path is relative to the post's
   location in the Astro project, not to the editor server's document root,
   and Astro's image processing is what resolves it at build time. A broken
   image icon in the preview is expected and correct here; what you are
   verifying is that the inserted markdown text is right. (Confirm the file
   landed at `src/assets/posts/<slug>/<file>` on disk.) Dragging a video
   inserts a `<video src="/blogs/media/...">` tag, which likewise will not
   play in the preview.
5. Clicking "Publish" shows a confirm dialog; cancelling it does nothing; confirming it shows a success or error alert, moves the file to `src/content/posts/`, and (if `origin` is configured per Task 5) pushes to `master`.

Stop the server (Ctrl+C) when done. Clean up any test post/draft created during this check.

- [ ] **Step 5: Commit**

```bash
git add editor-tool/public
git commit -m "Add editor UI: live preview, drag-and-drop media, save draft, publish"
```

---

### Task 11: End-to-end verification on the live site

**Files:** none (verification only).

- [ ] **Step 1: Confirm the live site is correct**

Visit your GitHub Pages URL (from Task 5) and confirm:
- Homepage lists "Hello, Proofs".
- The post page renders the proof with properly typeset math (not raw `$...$`).
- `/about/` loads.
- `/rss.xml` and `/sitemap-index.xml` are both reachable and non-empty.
- The view-count badge image appears on the post page and shows a number.

- [ ] **Step 2: Confirm GoatCounter is receiving hits**

Sign up at https://www.goatcounter.com (free), create a site, and replace `YOUR_GOATCOUNTER_CODE` in `src/layouts/BaseLayout.astro` with your real code. Commit, push, wait for the deploy to finish, reload the live homepage a couple of times, then check your GoatCounter dashboard shows the visits.

```bash
git add src/layouts/BaseLayout.astro
git commit -m "Set real GoatCounter site code"
git push
```

- [ ] **Step 3: Full draft-to-live cycle via the editor tool**

With `origin` configured (Task 5) and a clean working tree:

```bash
npm run write
```

In the browser: write a short real test post (or a throwaway one you're fine deleting), save it as a draft, publish it, and confirm:
1. The publish call succeeds in the UI.
2. `git log -1` shows the publish commit, and it was pushed (check `git log origin/master -1` matches).
3. The GitHub Actions workflow runs and succeeds.
4. The new post appears on the live site within a minute or two of the workflow finishing.

If you used a throwaway post, delete it afterward via a normal `git rm` + commit + push + re-verify the deploy succeeds with it removed.
