import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { withBase } from '../lib/url';

export async function GET(context) {
  const posts = await getCollection('posts');
  return rss({
    title: 'Math Proofs & Devlogs',
    description: 'Math proofs done for fun, and the occasional devlog.',
    // context.site is the bare origin (no base), which would make the feed's
    // own channel <link> point at the domain root instead of the blog.
    site: new URL(withBase('/'), context.site),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      // withBase is required here: @astrojs/rss joins `link` onto `site`,
      // and `site` is the bare origin, so an unprefixed path would emit
      // https://thoughtlessnerd.github.io/posts/... (missing /blogs).
      link: withBase(`/posts/${post.id}/`),
    })),
  });
}
