import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { isoDate } from '../lib/date';

const MATH_SPAN = /\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g;
const PLACEHOLDER = /@@MATH(\d+)@@/g;

/**
 * Strips markdown down to the words a reader would actually search for.
 *
 * Built from the markdown source rather than the rendered HTML on purpose:
 * MathJax renders formulas as SVG paths with no text nodes, so anything
 * indexed from the built page would lose every formula. From the source the
 * LaTeX survives, and a search for "ldots" or "p_1" still finds the proof.
 */
function toPlainText(markdown: string): string {
  // Math is lifted out before the markdown stripping runs and put back after.
  // Without this the emphasis rule below eats the underscores in LaTeX
  // subscripts: "p_1 p_2" would index as "p1 p2" and searching the subscript
  // would find nothing.
  const math: string[] = [];
  const stashed = markdown.replace(MATH_SPAN, (m) => {
    math.push(m.replace(/\$/g, ''));
    return `@@MATH${math.length - 1}@@`;
  });

  return stashed
    // Fence markers go, the code inside stays — a devlog's searchable terms
    // are often in the snippet.
    .replace(/```+[a-zA-Z]*\n?/g, ' ')
    .replace(/`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Keep the link text, drop the URL.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .replace(PLACEHOLDER, (_, i) => math[Number(i)] ?? '')
    .trim();
}

/**
 * The index is generated at build time from the content collection, so
 * publishing a post adds it to search with no change to this repo.
 */
export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  const index = posts.map((post) => ({
    id: post.id,
    title: post.data.title,
    description: post.data.description,
    date: isoDate(post.data.pubDate),
    text: toPlainText(post.body ?? ''),
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
