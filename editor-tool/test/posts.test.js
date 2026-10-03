import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugify, saveDraft, readDraft, listDrafts, publishDraft, localDateString } from '../lib/posts.js';

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

describe('localDateString', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 2026-10-04 00:30 local. toISOString() on this would report 2026-10-03
    // at any positive UTC offset, stamping the wrong day on the post.
    const justAfterMidnight = new Date(2026, 9, 4, 0, 30, 0);
    expect(localDateString(justAfterMidnight)).toBe('2026-10-04');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateString(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
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
