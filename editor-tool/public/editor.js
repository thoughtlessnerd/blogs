const picker = document.getElementById('picker');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const typeSelect = document.getElementById('type');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const dropzone = document.getElementById('dropzone');
const statusEl = document.getElementById('status');

const mediaInput = document.getElementById('mediaInput');
const addMediaBtn = document.getElementById('addMedia');
const saveDraftBtn = document.getElementById('saveDraft');
const publishBtn = document.getElementById('publish');
const updateBtn = document.getElementById('update');
const deleteBtn = document.getElementById('delete');

// mode: 'new' | 'draft' | 'published'. A published post is edited and pushed
// in place; a draft is saved locally until you publish it.
let mode = 'new';
let currentSlug = null;
let currentPubDate = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('status--error', isError);
  if (msg && !isError) setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 4000);
}

// Mirrors src/lib/rehype-image-size.mjs. The preview is only useful if it
// agrees with the published page, so the same rule has to run in both.
const IMAGE_SIZE = /^(\d+(?:\.\d+)?)(px|%)?$/;

function applyImageSizes(root) {
  for (const img of root.querySelectorAll('img[title]')) {
    const match = IMAGE_SIZE.exec(img.title.trim());
    if (!match) continue;
    const [, amount, unit] = match;
    img.style.maxWidth = unit === '%' ? `${amount}%` : `${amount}px`;
    img.removeAttribute('title');
  }
}

// Maths is lifted out before marked runs and put back afterwards.
//
// Without this the preview quietly lies: marked applies markdown escaping
// inside the maths, so a doubled backslash becomes a single one and "\in"
// previews as the correct symbol. Astro hands the maths to MathJax verbatim,
// where "\\" is a line break and the rest renders as the letters i and n. The
// author then sees a symbol here and gibberish on the published page.
const MATH_SPAN = /\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g;

function renderPreview() {
  const maths = [];
  const stashed = editor.value.replace(MATH_SPAN, (m) => {
    maths.push(m);
    return `@@MATH${maths.length - 1}@@`;
  });

  const html = marked
    .parse(stashed)
    .replace(/@@MATH(\d+)@@/g, (_, i) => maths[Number(i)] ?? '');

  preview.innerHTML = html;
  applyImageSizes(preview);
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([preview]);
}

function applyMode(next) {
  mode = next;
  const published = next === 'published';
  saveDraftBtn.hidden = published;
  publishBtn.hidden = published;
  updateBtn.hidden = !published;
  // Drafts are deletable too; only an unsaved new post has nothing to remove.
  deleteBtn.hidden = next === 'new';
}

editor.addEventListener('input', renderPreview);

async function refreshPicker() {
  const [drafts, posts] = await Promise.all([
    fetch('/api/drafts').then((r) => r.json()),
    fetch('/api/posts').then((r) => r.json()),
  ]);

  picker.innerHTML = '<option value="">— new post —</option>';
  const addGroup = (label, items, prefix) => {
    if (!items.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = `${prefix}:${item.slug}`;
      opt.textContent = item.title ?? item.slug;
      group.append(opt);
    }
    picker.append(group);
  };
  addGroup('Drafts', drafts, 'draft');
  addGroup('Published', posts, 'post');

  picker.value = currentSlug ? `${mode === 'published' ? 'post' : 'draft'}:${currentSlug}` : '';
}

function clearEditor() {
  currentSlug = null;
  currentPubDate = null;
  titleInput.value = descriptionInput.value = editor.value = '';
  typeSelect.value = 'math';
  applyMode('new');
  renderPreview();
}

function load(entry) {
  titleInput.value = entry.title ?? '';
  descriptionInput.value = entry.description ?? '';
  typeSelect.value = entry.type ?? 'math';
  editor.value = entry.body ?? '';
  currentSlug = entry.slug;
  currentPubDate = entry.pubDate ?? null;
  renderPreview();
}

picker.addEventListener('change', async () => {
  const value = picker.value;
  if (!value) return clearEditor();

  const [kind, slug] = value.split(/:(.+)/);
  const res = await fetch(kind === 'post' ? `/api/posts/${slug}` : `/api/drafts/${slug}`);
  if (!res.ok) return setStatus('Could not open that.', true);

  applyMode(kind === 'post' ? 'published' : 'draft');
  load(await res.json());
});

async function saveDraftNow() {
  const res = await fetch('/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: titleInput.value,
      description: descriptionInput.value,
      type: typeSelect.value,
      body: editor.value,
      // Keep the slug when re-saving an open draft, so renaming the title
      // doesn't strand a half-written copy under the old name.
      slug: mode === 'draft' ? currentSlug : undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) return setStatus(data.error, true);

  currentSlug = data.slug;
  applyMode('draft');
  await refreshPicker();
  setStatus(
    data.renamedFrom
      ? `Saved as "${data.slug}" — "${data.renamedFrom}" was taken.`
      : `Draft saved: ${data.slug}`
  );
}

saveDraftBtn.addEventListener('click', saveDraftNow);

publishBtn.addEventListener('click', async () => {
  if (!currentSlug) return setStatus('Save a draft first.', true);
  if (!confirm(`Commit & push "${titleInput.value}" to master?`)) return;

  let res = await fetch(`/api/publish/${currentSlug}`, { method: 'POST' });
  let data = await res.json();

  // 409 means a live post already owns this slug. Publishing anyway would
  // destroy it, so make the choice explicit instead.
  if (res.status === 409 && data.suggestedSlug) {
    const useNew = confirm(
      `${data.error}\n\nOK  → publish as "${data.suggestedSlug}" (keeps both)\n` +
        `Cancel → overwrite the existing post (its content is lost)`
    );
    const query = useNew ? `?as=${encodeURIComponent(data.suggestedSlug)}` : '?overwrite=true';
    if (!useNew && !confirm('Really overwrite the published post? This cannot be undone.')) return;

    res = await fetch(`/api/publish/${currentSlug}${query}`, { method: 'POST' });
    data = await res.json();
  }

  if (!res.ok) return setStatus(data.error ?? 'Publish failed', true);

  clearEditor();
  await refreshPicker();
  setStatus(`Published ${data.slug} and pushed to master.`);
});

updateBtn.addEventListener('click', async () => {
  if (!confirm(`Commit & push an update to "${titleInput.value}"?`)) return;

  const res = await fetch(`/api/posts/${currentSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: titleInput.value,
      description: descriptionInput.value,
      type: typeSelect.value,
      body: editor.value,
      pubDate: currentPubDate,
    }),
  });
  const data = await res.json();
  if (!res.ok) return setStatus(data.error, true);

  await refreshPicker();
  setStatus('Updated and pushed to master.');
});

deleteBtn.addEventListener('click', async () => {
  const isDraft = mode === 'draft';

  // Worth distinguishing: an unpublished post still exists in git history, but
  // a draft is gitignored, so deleting one really is the end of it.
  const question = isDraft
    ? `Delete draft "${titleInput.value}"? Drafts are not in git, so this cannot be undone.`
    : `Unpublish "${titleInput.value}"? This removes it from the live site.`;
  if (!confirm(question)) return;

  const url = isDraft ? `/api/drafts/${currentSlug}` : `/api/posts/${currentSlug}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) return setStatus(data.error, true);

  clearEditor();
  await refreshPicker();
  setStatus(isDraft ? 'Draft deleted.' : 'Unpublished and pushed to master.');
});

/**
 * Media is stored in a folder named after the slug, so a slug has to exist.
 * Rather than refusing the drop and sending the writer off to press Save
 * Draft, save one for them. A title is the only thing that cannot be invented.
 */
async function ensureSlug() {
  if (currentSlug) return currentSlug;
  if (!titleInput.value.trim()) {
    setStatus('Give the post a title first — it decides where media is stored.', true);
    return null;
  }
  await saveDraftNow();
  return currentSlug;
}

/** Inserts at the caret rather than appending, so media lands where you are. */
function insertAtCursor(text) {
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? editor.value.length;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const block = lead + text + '\n';
  editor.value = before + block + after;
  const caret = (before + block).length;
  editor.setSelectionRange(caret, caret);
  editor.focus();
  renderPreview();
}

async function uploadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (list.length === 0) return;

  const slug = await ensureSlug();
  if (!slug) return;

  for (const [i, file] of list.entries()) {
    const counter = list.length > 1 ? ` (${i + 1}/${list.length})` : '';
    setStatus(`Uploading ${file.name || 'file'}${counter}…`);

    const formData = new FormData();
    // A pasted screenshot arrives as a nameless blob, so give it a name.
    const ext = (file.type.split('/')[1] || 'png').split('+')[0];
    formData.append('file', file, file.name || `pasted-${Date.now()}.${ext}`);

    let data;
    try {
      const res = await fetch(`/api/upload/${slug}`, { method: 'POST', body: formData });
      data = await res.json();
      if (!res.ok) return setStatus(data.error ?? 'Upload failed', true);
    } catch {
      return setStatus('Upload failed — is the editor server still running?', true);
    }

    // The server decides the markdown for the media type: images get an
    // Astro-processed relative path, videos a literal /blogs/media URL.
    insertAtCursor(data.markdown);
  }

  setStatus(list.length === 1 ? 'Media added.' : `${list.length} files added.`);
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  await uploadFiles(e.dataTransfer.files);
});

// A screenshot on the clipboard arrives as a file item alongside the text
// flavours, so only swallow the paste when a file is actually present —
// otherwise ordinary text pasting would stop working.
editor.addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (files.length === 0) return;
  e.preventDefault();
  await uploadFiles(files);
});

addMediaBtn.addEventListener('click', () => mediaInput.click());
mediaInput.addEventListener('change', async () => {
  await uploadFiles(mediaInput.files);
  // Cleared so picking the same file twice still fires a change event.
  mediaInput.value = '';
});

applyMode('new');
refreshPicker();
