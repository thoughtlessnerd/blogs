import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  slugify,
  saveDraft,
  readDraft,
  listDrafts,
  publishDraft,
  localDateString,
  slugTaken,
  uniqueSlug,
  listPosts,
  readPost,
  savePost,
  deletePost,
  deleteDraft,
} from '../lib/posts.js';

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

describe('slugTaken', () => {
  it('returns null when nothing uses the slug', () => {
    expect(slugTaken({ draftsDir, postsDir, slug: 'free' })).toBe(null);
  });

  it('reports a draft holding the slug', () => {
    saveDraft({ draftsDir, slug: 'held', title: 'Held', description: 'd', body: 'b' });
    expect(slugTaken({ draftsDir, postsDir, slug: 'held' })).toBe('draft');
  });

  it('reports a published post holding the slug', () => {
    saveDraft({ draftsDir, slug: 'held', title: 'Held', description: 'd', body: 'b' });
    publishDraft({ draftsDir, postsDir, slug: 'held' });
    expect(slugTaken({ draftsDir, postsDir, slug: 'held' })).toBe('post');
  });
});

describe('uniqueSlug', () => {
  it('returns the slug unchanged when it is free', () => {
    expect(uniqueSlug({ draftsDir, postsDir, slug: 'fresh' })).toBe('fresh');
  });

  it('suffixes past a published post and a draft', () => {
    saveDraft({ draftsDir, slug: 'dup', title: 'Dup', description: 'd', body: 'b' });
    publishDraft({ draftsDir, postsDir, slug: 'dup' });
    saveDraft({ draftsDir, slug: 'dup-2', title: 'Dup', description: 'd', body: 'b' });

    expect(uniqueSlug({ draftsDir, postsDir, slug: 'dup' })).toBe('dup-3');
  });
});

describe('publishDraft collision guard', () => {
  it('refuses to clobber an existing published post', () => {
    saveDraft({ draftsDir, slug: 'clash', title: 'Clash', description: 'ORIGINAL', body: 'original' });
    publishDraft({ draftsDir, postsDir, slug: 'clash' });

    saveDraft({ draftsDir, slug: 'clash', title: 'Clash', description: 'DIFFERENT', body: 'different' });
    expect(() => publishDraft({ draftsDir, postsDir, slug: 'clash' })).toThrow(/already exists/i);

    // The original survives and the new draft is left alone to be retried.
    const kept = readPost({ postsDir, slug: 'clash' });
    expect(kept.description).toBe('ORIGINAL');
    expect(fs.existsSync(path.join(draftsDir, 'clash.md'))).toBe(true);
  });

  it('overwrites only when explicitly told to', () => {
    saveDraft({ draftsDir, slug: 'clash', title: 'Clash', description: 'ORIGINAL', body: 'o' });
    publishDraft({ draftsDir, postsDir, slug: 'clash' });
    saveDraft({ draftsDir, slug: 'clash', title: 'Clash', description: 'DIFFERENT', body: 'd' });

    publishDraft({ draftsDir, postsDir, slug: 'clash', overwrite: true });
    expect(readPost({ postsDir, slug: 'clash' }).description).toBe('DIFFERENT');
  });
});

describe('published posts', () => {
  const publish = (slug, title, description, body, pubDate) => {
    saveDraft({ draftsDir, slug, title, description, body });
    if (pubDate) {
      const p = path.join(draftsDir, `${slug}.md`);
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('---\ntitle:', `---\npubDate: '${pubDate}'\ntitle:`));
    }
    return publishDraft({ draftsDir, postsDir, slug });
  };

  it('listPosts returns empty when nothing is published', () => {
    expect(listPosts({ postsDir })).toEqual([]);
  });

  it('listPosts returns newest first', () => {
    publish('older', 'Older', 'd', 'b', '2025-01-02');
    publish('newer', 'Newer', 'd', 'b', '2026-05-06');

    expect(listPosts({ postsDir }).map((p) => p.slug)).toEqual(['newer', 'older']);
  });

  it('readPost round-trips a published post', () => {
    publish('round', 'Round Trip', 'the description', 'the body', '2026-02-03');

    const post = readPost({ postsDir, slug: 'round' });
    expect(post.title).toBe('Round Trip');
    expect(post.description).toBe('the description');
    expect(post.pubDate).toBe('2026-02-03');
    expect(post.body.trim()).toBe('the body');
  });

  it('savePost edits in place and keeps the original pubDate', () => {
    publish('edit-me', 'Edit Me', 'before', 'old body', '2026-02-03');

    savePost({ postsDir, slug: 'edit-me', title: 'Edited', description: 'after', body: 'new body', pubDate: '2026-02-03' });

    const post = readPost({ postsDir, slug: 'edit-me' });
    expect(post.title).toBe('Edited');
    expect(post.description).toBe('after');
    expect(post.body.trim()).toBe('new body');
    expect(post.pubDate).toBe('2026-02-03');
  });

  it('deleteDraft removes the draft and returns its path', () => {
    saveDraft({ draftsDir, slug: 'scrap', title: 'Scrap', description: 'd', body: 'b' });

    const removed = deleteDraft({ draftsDir, slug: 'scrap' });

    expect(removed).toBe(path.join(draftsDir, 'scrap.md'));
    expect(fs.existsSync(removed)).toBe(false);
    expect(listDrafts({ draftsDir })).toEqual([]);
  });

  it('deleteDraft throws for a draft that is not there', () => {
    expect(() => deleteDraft({ draftsDir, slug: 'ghost' })).toThrow(/not found/);
  });

  it('deleting a draft leaves a published post of the same slug alone', () => {
    // Publishing moves the draft into posts under the same slug, so a draft
    // re-saved afterwards shares that slug. Removing it must not disturb the
    // published copy.
    publish('shared', 'Shared', 'd', 'body', '2026-02-03');
    saveDraft({ draftsDir, slug: 'shared', title: 'Shared', description: 'd', body: 'newer' });

    deleteDraft({ draftsDir, slug: 'shared' });

    expect(fs.existsSync(path.join(postsDir, 'shared.md'))).toBe(true);
    expect(slugTaken({ draftsDir, postsDir, slug: 'shared' })).toBe('post');
  });

  it('deletePost removes the file and returns its path', () => {
    publish('goner', 'Goner', 'd', 'b', '2026-02-03');

    const removed = deletePost({ postsDir, slug: 'goner' });

    expect(removed).toBe(path.join(postsDir, 'goner.md'));
    expect(fs.existsSync(removed)).toBe(false);
  });

  it('deletePost refuses a slug that is not published', () => {
    expect(() => deletePost({ postsDir, slug: 'never-existed' })).toThrow(/not found/i);
  });
});
