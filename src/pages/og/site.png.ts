import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og';

// Fallback card for every page that isn't a post — home, about, contact,
// archive. Without it those links share as a bare text snippet.
export const GET: APIRoute = async () => {
  const png = await renderOgImage({
    title: 'Math proofs, worked through for fun.',
    subtitle: 'thoughtlessnerd.github.io/blogs',
  });

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
