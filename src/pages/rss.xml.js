import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { withBase } from '../lib/url';

// Feed readers only ever show recent items, and an uncapped feed grows
// without bound. 20 is the usual convention.
const FEED_LIMIT = 20;

export async function GET(context) {
  const posts = (await getCollection('posts'))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, FEED_LIMIT);
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
