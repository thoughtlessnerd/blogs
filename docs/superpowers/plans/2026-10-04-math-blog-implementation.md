# Math Proofs / Devlog Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, static, zero-backend personal blog (Astro, deployed to GitHub Pages) for math proof write-ups, plus a standalone local-only authoring tool with live preview, drag-and-drop media, and one-click publish-and-deploy.

**Architecture:** An Astro static site at the repo root (content collection of markdown posts, MathJax rendering at build time, SEO metadata, RSS/sitemap, a third-party view counter) deployed via GitHub Actions on every push to `main`. A fully separate Node/Express app in `editor-tool/` — never bundled into the deployed site — provides a local web UI for drafting posts, saving drafts outside the Astro build's reach, and publishing (move + git commit + git push) in one click.

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
│   ├── layouts/
│   │   └── BaseLayout.astro       # shared head/SEO/nav/GoatCounter
│   ├── pages/
│   │   ├── index.astro            # homepage: chronological post list
│   │   ├── about.astro
│   │   ├── rss.xml.js
│   │   └── posts/
│   │       └── [id].astro         # post detail page + view badge
│   └── assets/
│       └── posts/                 # per-post images/video, created as needed
├── public/
│   └── robots.txt
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
npm install remark-math rehype-mathjax
```

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
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/pages/posts/[id].astro`
- Create: `src/pages/about.astro`
- Modify: `src/pages/index.astro` (use the new layout)

**Interfaces:**
- Produces: `BaseLayout.astro` accepting props `{ title: string, description: string }` with a default `<slot />` for page content.
- Consumes: `posts` collection from Task 2 (`getCollection('posts')`, `.id`, `.data.title/.description/.pubDate`).

- [ ] **Step 1: Write `BaseLayout.astro`**

```astro
---
interface Props {
  title: string;
  description: string;
}
const { title, description } = Astro.props;
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
    <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml" />
    <!-- Sign up free at https://www.goatcounter.com and replace YOUR_GOATCOUNTER_CODE -->
    <script
      data-goatcounter="https://YOUR_GOATCOUNTER_CODE.goatcounter.com/count"
      async
      src="//gc.zgo.at/count.js"></script>
  </head>
  <body>
    <nav>
      <a href="/">Home</a>
      <a href="/about/">About</a>
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
        <a href={`/posts/${post.id}/`}>{post.data.title}</a>
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

- [ ] **Step 6: Commit**

```bash
git add src/layouts src/pages
git commit -m "Add shared layout with SEO/OG tags, post page with view badge, about page"
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
      link: `/posts/${post.id}/`,
    })),
  });
}
```

- [ ] **Step 4: Add `robots.txt`**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://yourusername.github.io/blogs/sitemap-index.xml
```

(Update the URL here when `astro.config.mjs`'s `site`/`base` are finalized in Task 5.)

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: exits 0, and:

```bash
test -f dist/rss.xml && echo "rss ok"
test -f dist/sitemap-index.xml && echo "sitemap ok"
grep -o '<title>[^<]*</title>' dist/rss.xml
```

Expected output: `rss ok`, `sitemap ok`, and a title match containing `Math Proofs & Devlogs`.

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
- Produces: automatic build+deploy to GitHub Pages on every push to `main`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
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

- [ ] **Step 2: Create the GitHub repository and push**

This step needs your input — create a **public** GitHub repository (e.g. named `blogs`), then:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
```

Do not push yet — first finish Step 3 so the site builds with the correct URL.

- [ ] **Step 3: Finalize `site`/`base` and the sitemap URL**

In `astro.config.mjs`, replace:
```js
site: 'https://yourusername.github.io',
base: '/blogs',
```
with your actual GitHub username and repo name, e.g. `site: 'https://<your-username>.github.io'`, `base: '/<repo-name>'`.

In `public/robots.txt`, update the `Sitemap:` line to match the same host/base.

Run `npm run build` again to confirm it still exits 0 after the change.

- [ ] **Step 4: Enable GitHub Pages for Actions deployment**

In the GitHub repo's Settings → Pages, set "Source" to "GitHub Actions" (not "Deploy from a branch").

- [ ] **Step 5: Push and verify the deploy**

```bash
git add astro.config.mjs public/robots.txt .github
git commit -m "Add GitHub Actions deploy workflow, finalize site URL"
git push -u origin main
```

Expected: in the GitHub repo's "Actions" tab, the "Deploy to GitHub Pages" workflow runs and completes with a green check. Visit the printed Pages URL and confirm the homepage loads with the "Hello, Proofs" post listed.

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
  it('adds, commits, and pushes to origin main', async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    };

    await commitAndPush(git, { files: ['a.md', 'b/'], message: 'Publish: a' });

    expect(git.add).toHaveBeenCalledWith(['a.md', 'b/']);
    expect(git.commit).toHaveBeenCalledWith('Publish: a');
    expect(git.push).toHaveBeenCalledWith('origin', 'main');
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
  await git.push('origin', 'main');
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
- Produces: `POST /api/upload/:slug` (multipart form field `file`) → `{ path: string }`, saving the file to `src/assets/posts/<slug>/<original-filename>`.
- Consumes: `ASSETS_DIR` constant and `app` from Task 8's `server.js`.

- [ ] **Step 1: Add the upload route**

Modify `editor-tool/server.js` — add the `multer` import at the top:

```js
import multer from 'multer';
```

Add this block before the `app.listen(...)` call at the bottom:

```js
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(ASSETS_DIR, req.params.slug);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

app.post('/api/upload/:slug', upload.single('file'), (req, res) => {
  res.json({ path: `/src/assets/posts/${req.params.slug}/${req.file.originalname}` });
});
```

- [ ] **Step 2: Manually verify the upload endpoint**

```bash
npm run write &
sleep 1
echo "fake image bytes" > /tmp/test-image.png
curl -s -X POST http://localhost:5321/api/upload/test-draft -F "file=@/tmp/test-image.png"
kill %1
```

Expected: `{"path":"/src/assets/posts/test-draft/test-image.png"}` and `src/assets/posts/test-draft/test-image.png` exists on disk.

Clean up:
```bash
rm -rf src/assets/posts/test-draft
```

- [ ] **Step 3: Commit**

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
  const confirmed = confirm(`Commit & push "${titleInput.value}" to main?`);
  if (!confirmed) return;

  const res = await fetch(`/api/publish/${currentSlug}`, { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    alert('Published and pushed to main!');
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
  const isVideo = file.type.startsWith('video/');
  const markdown = isVideo
    ? `\n<video src="${data.path}" controls></video>\n`
    : `\n![${file.name}](${data.path})\n`;
  editor.value += markdown;
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
4. Dragging an image file onto the editor area uploads it, inserts a `![...]` markdown line, and the preview shows the image.
5. Clicking "Publish" shows a confirm dialog; cancelling it does nothing; confirming it shows a success or error alert, moves the file to `src/content/posts/`, and (if `origin` is configured per Task 5) pushes to `main`.

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
2. `git log -1` shows the publish commit, and it was pushed (check `git log origin/main -1` matches).
3. The GitHub Actions workflow runs and succeeds.
4. The new post appears on the live site within a minute or two of the workflow finishing.

If you used a throwaway post, delete it afterward via a normal `git rm` + commit + push + re-verify the deploy succeeds with it removed.
