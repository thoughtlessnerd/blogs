const picker = document.getElementById('picker');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const typeSelect = document.getElementById('type');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const dropzone = document.getElementById('dropzone');
const statusEl = document.getElementById('status');

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

function renderPreview() {
  preview.innerHTML = marked.parse(editor.value);
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([preview]);
}

function applyMode(next) {
  mode = next;
  const published = next === 'published';
  saveDraftBtn.hidden = published;
  publishBtn.hidden = published;
  updateBtn.hidden = !published;
  deleteBtn.hidden = !published;
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

saveDraftBtn.addEventListener('click', async () => {
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
});

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
  if (!confirm(`Unpublish "${titleInput.value}"? This removes it from the live site.`)) return;

  const res = await fetch(`/api/posts/${currentSlug}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) return setStatus(data.error, true);

  clearEditor();
  await refreshPicker();
  setStatus('Unpublished and pushed to master.');
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  if (!currentSlug) return setStatus('Save a draft first so there is a place to put media.', true);

  const file = e.dataTransfer.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/upload/${currentSlug}`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) return setStatus(data.error ?? 'Upload failed', true);

  // The server decides the correct markdown for the media type — images get
  // an Astro-processed relative path, videos a literal /blogs/media URL.
  editor.value += `\n${data.markdown}\n`;
  renderPreview();
});

applyMode('new');
refreshPicker();
