const draftPicker = document.getElementById('draftPicker');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const typeSelect = document.getElementById('type');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const dropzone = document.getElementById('dropzone');

let currentSlug = null;

function renderPreview() {
  preview.innerHTML = marked.parse(editor.value);
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([preview]);
  }
}

editor.addEventListener('input', renderPreview);

async function refreshDraftList() {
  const drafts = await (await fetch('/api/drafts')).json();
  draftPicker.innerHTML = '<option value="">— new post —</option>';
  for (const d of drafts) {
    const opt = document.createElement('option');
    opt.value = d.slug;
    opt.textContent = d.title ?? d.slug;
    draftPicker.append(opt);
  }
  draftPicker.value = currentSlug ?? '';
}

// Without this, a saved draft could never be reopened — the whole point of
// saving one is coming back to it in a later session.
draftPicker.addEventListener('change', async () => {
  const slug = draftPicker.value;
  if (!slug) {
    currentSlug = null;
    titleInput.value = descriptionInput.value = editor.value = '';
    renderPreview();
    return;
  }
  const res = await fetch(`/api/drafts/${slug}`);
  if (!res.ok) {
    alert('Could not open that draft.');
    return;
  }
  const draft = await res.json();
  currentSlug = draft.slug;
  titleInput.value = draft.title ?? '';
  descriptionInput.value = draft.description ?? '';
  typeSelect.value = draft.type ?? 'math';
  editor.value = draft.body ?? '';
  renderPreview();
});

document.getElementById('saveDraft').addEventListener('click', async () => {
  if (!titleInput.value.trim()) {
    alert('Give the post a title first — the filename comes from it.');
    return;
  }
  const res = await fetch('/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: titleInput.value,
      description: descriptionInput.value,
      type: typeSelect.value,
      body: editor.value,
    }),
  });
  const data = await res.json();
  currentSlug = data.slug;
  await refreshDraftList();
  alert(`Draft saved: ${currentSlug}`);
});

document.getElementById('publish').addEventListener('click', async () => {
  if (!currentSlug) {
    alert('Save a draft first.');
    return;
  }
  const confirmed = confirm(`Commit & push "${titleInput.value}" to master?`);
  if (!confirmed) return;

  const res = await fetch(`/api/publish/${currentSlug}`, { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    currentSlug = null;
    await refreshDraftList();
    alert('Published and pushed to master!');
  } else {
    alert(`Publish failed: ${data.error}`);
  }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  if (!currentSlug) {
    alert('Save a draft first so there is a place to put media.');
    return;
  }
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/upload/${currentSlug}`, { method: 'POST', body: formData });
  const data = await res.json();
  // The server decides the correct markdown for the media type — images get
  // an Astro-processed relative path, videos a literal /blogs/media URL.
  editor.value += `\n${data.markdown}\n`;
  renderPreview();
});

refreshDraftList();
