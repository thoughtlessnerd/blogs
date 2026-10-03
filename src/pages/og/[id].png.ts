import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgImage } from '../../lib/og';
import { formatDate } from '../../lib/date';
import { AUTHOR } from '../../lib/config';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: Awaited<ReturnType<typeof getCollection<'posts'>>>[number] };

  const png = await renderOgImage({
    title: post.data.title,
    subtitle: `${formatDate(post.data.pubDate)} · ${AUTHOR}`,
  });

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
