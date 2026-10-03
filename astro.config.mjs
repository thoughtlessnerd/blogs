import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

export default defineConfig({
  // TODO before first deploy (Task 5): replace with your real GitHub Pages
  // URL, e.g. site: 'https://yourusername.github.io', base: '/blogs'
  site: 'https://yourusername.github.io',
  base: '/blogs',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax],
  },
});
