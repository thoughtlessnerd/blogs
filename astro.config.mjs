// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import rehypeStandaloneMath from './src/lib/rehype-standalone-math.mjs';
import rehypeImageSize from './src/lib/rehype-image-size.mjs';

export default defineConfig({
  // Deploy target: https://thoughtlessnerd.github.io/blogs
  site: 'https://thoughtlessnerd.github.io',
  base: '/blogs',
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    // Order matters: the promotion has to happen before MathJax consumes
    // these elements.
    rehypePlugins: [rehypeStandaloneMath, rehypeImageSize, rehypeMathjax],
  },
});
