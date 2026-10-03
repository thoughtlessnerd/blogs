import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slugify, saveDraft, readDraft, listDrafts, publishDraft } from './lib/posts.js';
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
  const { title, description, body, type } = req.body;
  const slug = slugify(title);
  saveDraft({ draftsDir: DRAFTS_DIR, slug, title, description, body, type });
  res.json({ slug });
});

app.post('/api/publish/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!fs.existsSync(path.join(DRAFTS_DIR, `${slug}.md`))) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    const postPath = publishDraft({ draftsDir: DRAFTS_DIR, postsDir: POSTS_DIR, slug });

    const filesToStage = [postPath];
    for (const dir of [path.join(ASSETS_DIR, slug), path.join(PUBLIC_MEDIA_DIR, slug)]) {
      if (fs.existsSync(dir)) filesToStage.push(dir);
    }

    const git = createGitClient(REPO_ROOT);
    await commitAndPush(git, { files: filesToStage, message: `Publish: ${slug}` });

    res.json({ ok: true });
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
