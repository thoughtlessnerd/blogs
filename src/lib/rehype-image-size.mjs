/**
 * Lets a post set an image's display size from markdown.
 *
 * Markdown has no syntax for this, so the image *title* carries it — the
 * second, optional string in `![alt](path "title")`. A title that is nothing
 * but a size is treated as one and removed; any other title is left alone as a
 * real tooltip.
 *
 *   ![stars](../../assets/posts/x/stars.png "420")     -> at most 420px wide
 *   ![stars](../../assets/posts/x/stars.png "420px")   -> the same
 *   ![stars](../../assets/posts/x/stars.png "60%")     -> 60% of the column
 *   ![stars](../../assets/posts/x/stars.png "A field") -> ordinary title
 *
 * Applied as max-width rather than width so the image still shrinks on a
 * narrow screen, and the intrinsic width/height Astro emits stay untouched so
 * the browser keeps reserving the right space and nothing jumps while loading.
 */
const SIZE = /^(\d+(?:\.\d+)?)(px|%)?$/;

export default function rehypeImageSize() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    visit(child);
    if (child.type !== 'element' || child.tagName !== 'img') continue;

    const title = child.properties?.title;
    if (typeof title !== 'string') continue;

    const match = SIZE.exec(title.trim());
    if (!match) continue;

    const [, amount, unit] = match;
    const width = unit === '%' ? `${amount}%` : `${amount}px`;
    const existing = child.properties.style ? `${child.properties.style};` : '';
    child.properties.style = `${existing}max-width:${width}`;
    // It was a size instruction, not a tooltip, so do not leave it hovering.
    delete child.properties.title;
  }
}
