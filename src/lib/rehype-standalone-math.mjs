/**
 * Promotes a paragraph that contains nothing but one maths expression into a
 * display block, so it renders centred and full size.
 *
 * remark-math only treats `$$...$$` as display maths when the delimiters sit
 * on their own lines. Written on a single line — `$$ x + y $$` — it produces
 * *inline* maths, so a formula the author clearly meant to stand alone renders
 * at text size and flush left.
 *
 * That also made the editor lie: its preview runs MathJax in the browser,
 * which treats `$$` as display wherever it appears, so the same post showed
 * five centred equations in the editor and none on the published page.
 *
 * This runs on hast rather than mdast deliberately. Retagging the markdown
 * node does not survive the mdast-to-hast step: that stage sees a node with a
 * `value` and emits it as raw text, so the LaTeX leaks onto the page instead
 * of rendering. By the time hast exists, remark-math has already produced
 * `<span class="math math-inline">`, and swapping that for a
 * `<div class="math math-display">` is all MathJax needs.
 *
 * Must be registered BEFORE rehype-mathjax, which consumes these elements.
 */
export default function rehypeStandaloneMath() {
  return (tree) => promote(tree);
}

function classesOf(node) {
  const value = node.properties?.className ?? [];
  return Array.isArray(value) ? value : String(value).split(/\s+/);
}

function promote(node) {
  if (!node || !Array.isArray(node.children)) return;

  node.children = node.children.map((child) => {
    promote(child);
    if (child.type !== 'element' || child.tagName !== 'p') return child;

    const content = child.children.filter(
      (c) => !(c.type === 'text' && c.value.trim() === '')
    );
    if (content.length !== 1 || content[0].type !== 'element') return child;
    if (!classesOf(content[0]).includes('math-inline')) return child;

    // Replaces the paragraph outright: a div cannot live inside a <p>.
    return {
      ...content[0],
      tagName: 'div',
      properties: { ...content[0].properties, className: ['math', 'math-display'] },
    };
  });
}
