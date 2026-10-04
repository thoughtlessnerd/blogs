import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// Local calendar date as YYYY-MM-DD. Date#toISOString would convert to UTC
// first, which stamps the previous day onto anything published in the evening
// at a positive UTC offset.
export function localDateString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

// --- published posts ---------------------------------------------------

export function listPosts({ postsDir }) {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { data } = matter(fs.readFileSync(path.join(postsDir, f), 'utf8'));
      return { slug, title: data.title, description: data.description, pubDate: data.pubDate };
    })
    .sort((a, b) => String(b.pubDate ?? '').localeCompare(String(a.pubDate ?? '')));
}

export function readPost({ postsDir, slug }) {
  const filePath = path.join(postsDir, `${slug}.md`);
  const parsed = matter(fs.readFileSync(filePath, 'utf8'));
  return { ...parsed.data, body: parsed.content, slug };
}

// Edits a post that is already live. pubDate is passed through rather than
// regenerated so correcting a typo years later doesn't re-date the post and
// yank it back into the homepage's "Latest" group.
export function savePost({ postsDir, slug, title, description, body, type = 'math', pubDate }) {
  const filePath = path.join(postsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) throw new Error(`Post "${slug}" not found`);

  const resolvedDate = pubDate ?? matter(fs.readFileSync(filePath, 'utf8')).data.pubDate;
  fs.writeFileSync(
    filePath,
    matter.stringify(body, { title, description, type, pubDate: resolvedDate }),
    'utf8'
  );
  return filePath;
}

export function deletePost({ postsDir, slug }) {
  const filePath = path.join(postsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) throw new Error(`Post "${slug}" not found`);
  fs.unlinkSync(filePath);
  return filePath;
}

export function deleteDraft({ draftsDir, slug }) {
  const filePath = path.join(draftsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) throw new Error(`Draft "${slug}" not found`);
  fs.unlinkSync(filePath);
  return filePath;
}

// --- slug collisions ---------------------------------------------------

// Titles normalise aggressively — "Test", "test" and "Test!" all slugify to
// "test" — so collisions are a matter of when, not if.
export function slugTaken({ draftsDir, postsDir, slug }) {
  if (postsDir && fs.existsSync(path.join(postsDir, `${slug}.md`))) return 'post';
  if (draftsDir && fs.existsSync(path.join(draftsDir, `${slug}.md`))) return 'draft';
  return null;
}

export function uniqueSlug({ draftsDir, postsDir, slug }) {
  if (!slugTaken({ draftsDir, postsDir, slug })) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`;
    if (!slugTaken({ draftsDir, postsDir, slug: candidate })) return candidate;
  }
}

export function publishDraft({ draftsDir, postsDir, slug, overwrite = false }) {
  const draftPath = path.join(draftsDir, `${slug}.md`);
  const postPath = path.join(postsDir, `${slug}.md`);

  // Without this the second post to claim a slug silently destroys the first,
  // then commits and pushes the loss.
  if (!overwrite && fs.existsSync(postPath)) {
    throw new Error(`A published post with slug "${slug}" already exists`);
  }

  const parsed = matter(fs.readFileSync(draftPath, 'utf8'));
  if (!parsed.data.pubDate) {
    parsed.data.pubDate = localDateString();
  }

  fs.mkdirSync(postsDir, { recursive: true });
  fs.writeFileSync(postPath, matter.stringify(parsed.content, parsed.data), 'utf8');
  fs.unlinkSync(draftPath);
  return postPath;
}
