import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  slugify,
  saveDraft,
  readDraft,
  listDrafts,
  publishDraft,
  uniqueSlug,
  slugTaken,
  listPosts,
  readPost,
  savePost,
  deletePost,
} from './lib/posts.js';
import { createGitClient, commitAndPush } from './lib/git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so the publish path (which really commits and pushes) can be
// exercised against a scratch repo instead of the live blog.
const REPO_ROOT = process.env.BLOG_REPO_ROOT
  ? path.resolve(process.env.BLOG_REPO_ROOT)
  : path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(REPO_ROOT, 'drafts');
const POSTS_DIR = path.join(REPO_ROOT, 'src/content/posts');
const ASSETS_DIR = path.join(REPO_ROOT, 'src/assets/posts');
const PUBLIC_MEDIA_DIR = path.join(REPO_ROOT, 'public/media');

// Must match `base` in astro.config.mjs. Only videos need it: Astro rewrites
// image paths itself, but files served straight out of public/ do not get the
// base path injected.
const BASE_PATH = '/blogs';

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
  const { title, description, body, type, slug: existingSlug } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'A title is required — the filename comes from it.' });
  }

  // Re-saving a draft you already have open keeps its slug, so renaming the
  // title mid-draft doesn't strand a half-written copy under the old name.
  // A brand-new draft gets a slug that is free of both drafts and posts.
  const slug = existingSlug
    ? existingSlug
    : uniqueSlug({ draftsDir: DRAFTS_DIR, postsDir: POSTS_DIR, slug: slugify(title) });

  saveDraft({ draftsDir: DRAFTS_DIR, slug, title, description, body, type });
  res.json({ slug, renamedFrom: slugify(title) !== slug ? slugify(title) : undefined });
});

// --- published posts ---------------------------------------------------

app.get('/api/posts', (req, res) => {
  res.json(listPosts({ postsDir: POSTS_DIR }));
});

app.get('/api/posts/:slug', (req, res) => {
  try {
    res.json(readPost({ postsDir: POSTS_DIR, slug: req.params.slug }));
  } catch {
    res.status(404).json({ error: 'Post not found' });
  }
});

// Edit a post that is already live, then commit and push the correction.
app.put('/api/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, description, body, type, pubDate } = req.body;
    const postPath = savePost({ postsDir: POSTS_DIR, slug, title, description, body, type, pubDate });

    const git = createGitClient(REPO_ROOT);
    await commitAndPush(git, { files: [postPath], message: `Update: ${slug}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

app.delete('/api/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const postPath = deletePost({ postsDir: POSTS_DIR, slug });

    const git = createGitClient(REPO_ROOT);
    await commitAndPush(git, { files: [postPath], message: `Unpublish: ${slug}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

app.post('/api/publish/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!fs.existsSync(path.join(DRAFTS_DIR, `${slug}.md`))) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // "Publish as <other-slug>" resolves the target first — the collision
    // check must run against where the post is actually going, otherwise
    // asking for a free slug still trips the guard on the original one.
    const as = typeof req.query.as === 'string' && req.query.as ? req.query.as : null;
    const publishSlug = as ?? slug;
    const overwrite = req.query.overwrite === 'true';

    // 409 rather than a silent overwrite: the UI asks what to do, and the
    // draft stays on disk either way so nothing is lost while deciding.
    if (!overwrite && slugTaken({ postsDir: POSTS_DIR, slug: publishSlug }) === 'post') {
      return res.status(409).json({
        error: `A published post with slug "${publishSlug}" already exists.`,
        suggestedSlug: uniqueSlug({ draftsDir: DRAFTS_DIR, postsDir: POSTS_DIR, slug: publishSlug }),
      });
    }

    // Rename the draft and its media so the published file, its asset
    // directory and the commit message all agree on one slug.
    if (publishSlug !== slug) {
      if (fs.existsSync(path.join(DRAFTS_DIR, `${publishSlug}.md`))) {
        return res.status(409).json({ error: `A draft named "${publishSlug}" already exists.` });
      }
      fs.renameSync(path.join(DRAFTS_DIR, `${slug}.md`), path.join(DRAFTS_DIR, `${publishSlug}.md`));
      for (const root of [ASSETS_DIR, PUBLIC_MEDIA_DIR]) {
        if (fs.existsSync(path.join(root, slug))) {
          fs.renameSync(path.join(root, slug), path.join(root, publishSlug));
        }
      }
    }

    const postPath = publishDraft({
      draftsDir: DRAFTS_DIR,
      postsDir: POSTS_DIR,
      slug: publishSlug,
      overwrite,
    });

    // publishSlug, not slug — after a "publish as" rename the media lives
    // under the new name, and staging the old path would commit the markdown
    // while leaving its images behind.
    const filesToStage = [postPath];
    for (const dir of [
      path.join(ASSETS_DIR, publishSlug),
      path.join(PUBLIC_MEDIA_DIR, publishSlug),
    ]) {
      if (fs.existsSync(dir)) filesToStage.push(dir);
    }

    const git = createGitClient(REPO_ROOT);
    await commitAndPush(git, { files: filesToStage, message: `Publish: ${publishSlug}` });

    res.json({ ok: true, slug: publishSlug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Images are processed by Astro (optimized to WebP, given intrinsic
// dimensions, and base-path injected), so they live in src/assets and are
// referenced relative to the markdown file. Videos are not processed, so they
// live in public/ and are referenced by a literal URL including the base.
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

const PORT = process.env.PORT || 5321;
app.listen(PORT, () => {
  console.log(`Editor tool running at http://localhost:${PORT}`);
  if (process.env.BLOG_REPO_ROOT) console.log(`Repo root override: ${REPO_ROOT}`);
});
