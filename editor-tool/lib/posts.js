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
