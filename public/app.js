const state = {
  links: [],
  facets: { categories: [], tags: [], domains: [] },
  selectedId: null,
  filters: { view: 'all', search: '', sort: 'newest' },
  duplicate: null
};

const app = document.querySelector('#app');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === undefined || child === null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function load() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (value && value !== 'all' && value !== 'newest') params.set(key, value);
  }
  const data = await api(`/api/links?${params}`);
  state.links = data.links;
  state.facets = data.facets;
  if (!state.selectedId && state.links[0]) state.selectedId = state.links[0].id;
  render();
}

function render() {
  app.replaceChildren(el('div', { class: 'shell' }, [
    sidebar(),
    mainPane(),
    detailPane()
  ]));
}

function sidebar() {
  const views = [
    ['all', 'All links'],
    ['inbox', 'Inbox / Unsorted'],
    ['favorites', 'Favorites'],
    ['read-later', 'Read later'],
    ['archived', 'Archived']
  ];
  return el('aside', { class: 'sidebar' }, [
    el('div', { class: 'brand' }, [el('h1', { text: 'aRKive' }), el('span', { text: 'local' })]),
    el('nav', { class: 'nav' }, views.map(([id, label]) => el('button', {
      class: state.filters.view === id ? 'active' : '',
      text: label,
      onclick: () => setFilter({ view: id })
    }))),
    facetSection('Categories', state.facets.categories, (item) => setFilter({ categoryId: item.id, tagId: '', domain: '', view: 'all' })),
    facetSection('Tags', state.facets.tags, (item) => setFilter({ tagId: item.id, categoryId: '', domain: '', view: 'all' })),
    el('section', { class: 'sidebar-section' }, [
      el('h2', { text: 'Domains' }),
      el('div', { class: 'facet-list' }, state.facets.domains.slice(0, 16).map((item) => el('button', {
        text: `${item.domain} (${item.count})`,
        onclick: () => setFilter({ domain: item.domain, categoryId: '', tagId: '', view: 'all' })
      })))
    ])
  ]);
}

function facetSection(title, items, onPick) {
  return el('section', { class: 'sidebar-section' }, [
    el('h2', { text: title }),
    el('div', { class: 'facet-list' }, items.slice(0, 18).map((item) => el('button', {
      text: item.name,
      onclick: () => onPick(item)
    })))
  ]);
}

function mainPane() {
  return el('section', { class: 'main' }, [
    captureBox(),
    toolbar(),
    activeFilters(),
    state.links.length ? el('div', { class: 'list' }, state.links.map(linkCard)) : el('div', { class: 'empty' }, [
      el('strong', { text: 'Nothing here yet.' }),
      el('div', { text: 'Paste a URL above. You can sort it out later.' })
    ])
  ]);
}

function captureBox() {
  const url = el('input', { placeholder: 'Paste a URL and press Enter', autocomplete: 'off' });
  const notes = el('input', { placeholder: 'Optional note' });
  const category = el('input', { placeholder: 'Category (optional)' });
  const tags = el('input', { placeholder: 'Tags, comma separated (optional)' });
  const save = async (keepDuplicate = false) => {
    const body = {
      url: url.value,
      notes: notes.value,
      category: category.value,
      tags: splitTags(tags.value),
      keepDuplicate
    };
    try {
      const data = await api('/api/links', { method: 'POST', body: JSON.stringify(body) });
      state.selectedId = data.link.id;
      state.duplicate = null;
      url.value = '';
      notes.value = '';
      category.value = '';
      tags.value = '';
      await load();
      setStatus('Saved locally. Fetching metadata in the background.');
      setTimeout(load, 1400);
    } catch (error) {
      if (error.status === 409) {
        state.duplicate = { existing: error.data.link, body };
        render();
      } else {
        setStatus(error.message);
      }
    }
  };
  url.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save(false);
  });
  return el('form', { class: 'capture', onsubmit: (event) => { event.preventDefault(); save(false); } }, [
    el('div', { class: 'capture-row' }, [url, el('button', { class: 'primary', type: 'submit', text: 'Save' })]),
    el('div', { class: 'capture-extra' }, [notes, category]),
    tags,
    duplicateBox(save)
  ]);
}

function duplicateBox(save) {
  const box = el('div', { class: `duplicate ${state.duplicate ? 'show' : ''}` });
  if (!state.duplicate) return box;
  const existing = state.duplicate.existing;
  box.append(
    el('strong', { text: 'Already saved.' }),
    el('div', { text: existing.title || existing.url }),
    el('div', { class: 'actions' }, [
      el('button', { class: 'ghost', type: 'button', text: 'Open existing', onclick: () => { state.selectedId = existing.id; state.duplicate = null; render(); } }),
      el('button', { class: 'ghost', type: 'button', text: 'Keep duplicate', onclick: () => save(true) })
    ])
  );
  return box;
}

function toolbar() {
  return el('div', { class: 'toolbar' }, [
    el('input', {
      placeholder: 'Search URLs, titles, notes, tags, categories...',
      value: state.filters.search || '',
      oninput: debounce((event) => setFilter({ search: event.target.value }), 180)
    }),
    el('select', { onchange: (event) => setFilter({ read: event.target.value }) }, [
      option('', 'Any state'),
      option('unread', 'Unread'),
      option('read', 'Read')
    ]),
    el('select', { onchange: (event) => setFilter({ sort: event.target.value }) }, [
      option('newest', 'Newest'),
      option('oldest', 'Oldest'),
      option('alpha', 'Alphabetical'),
      option('accessed', 'Recently accessed')
    ])
  ]);
}

function option(value, text) {
  const node = el('option', { value, text });
  if (state.filters.sort === value || state.filters.read === value) node.selected = true;
  return node;
}

function activeFilters() {
  const entries = Object.entries(state.filters).filter(([, value]) => value && value !== 'all' && value !== 'newest');
  return el('div', { class: 'status', id: 'status' }, entries.length ? [
    ...entries.map(([key, value]) => el('button', { class: 'chip', text: `${key}: ${value}`, onclick: () => setFilter({ [key]: '' }) })),
    el('button', { class: 'chip', text: 'Clear', onclick: () => { state.filters = { view: 'all', search: '', sort: 'newest' }; load(); } })
  ] : 'Ready.');
}

function linkCard(link) {
  const selected = state.selectedId === link.id;
  return el('article', { class: `link-card ${selected ? 'selected' : ''}` }, [
    el('div', { class: 'link-top' }, [
      el('div', {}, [
        el('h2', { class: 'link-title' }, [el('button', { text: link.title || link.url, onclick: () => { state.selectedId = link.id; render(); } })]),
        el('div', { class: 'domain', text: link.domain || new URL(link.url).hostname })
      ]),
      el('div', { class: 'actions' }, [
        stateButton(link, 'is_favorite', '★', 'Favorite'),
        stateButton(link, 'is_read', '✓', 'Read'),
        stateButton(link, 'is_archived', '↧', 'Archive'),
        el('button', { class: 'icon-btn', title: 'Open original URL', text: '↗', onclick: () => openLink(link) })
      ])
    ]),
    link.description ? el('p', { class: 'description', text: link.description }) : null,
    link.notes ? el('p', { class: 'notes-preview', text: link.notes }) : null,
    el('div', { class: 'meta-row' }, [
      link.category ? el('span', { class: 'pill category', text: link.category }) : el('span', { class: 'pill muted', text: 'Unsorted' }),
      ...link.tags.map((tag) => el('span', { class: 'pill', text: `#${tag.name}` })),
      el('span', { class: 'pill muted', text: dateLabel(link.created_at) }),
      el('span', { class: 'pill muted', text: link.metadata_status })
    ])
  ]);
}

function stateButton(link, key, label, title) {
  return el('button', {
    class: `icon-btn ${link[key] ? 'on' : ''}`,
    title,
    text: label,
    onclick: () => patchLink(link.id, { [key]: link[key] ? 0 : 1 })
  });
}

function detailPane() {
  const link = state.links.find((item) => item.id === state.selectedId);
  if (!link) return el('aside', { class: 'detail' }, [el('h2', { text: 'Details' }), el('p', { class: 'small', text: 'Select a link to edit its notes, tags, and category.' })]);
  const notes = el('textarea', { text: link.notes || '' });
  const category = el('input', { value: link.category || '', placeholder: 'Unsorted' });
  const tags = el('input', { value: link.tags.map((tag) => tag.name).join(', '), placeholder: 'research, course, later' });
  return el('aside', { class: 'detail' }, [
    el('h2', { text: link.title || link.url }),
    el('div', { class: 'small', text: link.url }),
    el('div', { class: 'detail-grid' }, [
      el('label', {}, [el('span', { text: 'My notes' }), notes]),
      el('label', {}, [el('span', { text: 'Category' }), category]),
      el('label', {}, [el('span', { text: 'Tags' }), tags]),
      el('button', { class: 'primary', text: 'Save changes', onclick: async () => {
        await patchLink(link.id, { notes: notes.value, category: category.value, tags: splitTags(tags.value) });
        setStatus('Saved changes locally.');
      } }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'ghost', text: 'Refresh metadata', onclick: () => api(`/api/links/${link.id}/refresh-metadata`, { method: 'POST' }).then(() => setTimeout(load, 1200)) }),
        el('button', { class: 'ghost', text: 'Delete', onclick: () => removeLink(link.id) })
      ]),
      el('div', { class: 'small', text: `Added ${dateLabel(link.created_at)}${link.last_accessed_at ? ` · opened ${dateLabel(link.last_accessed_at)}` : ''}` })
    ])
  ]);
}

async function openLink(link) {
  await api(`/api/links/${link.id}/access`, { method: 'POST' });
  window.open(link.url, '_blank', 'noopener,noreferrer');
  load();
}

async function patchLink(id, patch) {
  await api(`/api/links/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  await load();
}

async function removeLink(id) {
  if (!confirm('Delete this saved link?')) return;
  await api(`/api/links/${id}`, { method: 'DELETE' });
  state.selectedId = null;
  await load();
}

function setFilter(patch) {
  state.filters = { ...state.filters, ...patch };
  load();
}

function setStatus(message) {
  const node = document.querySelector('#status');
  if (node) node.textContent = message;
}

function splitTags(value) {
  return String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value.replace(' ', 'T')));
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

load().catch((error) => {
  app.replaceChildren(el('div', { class: 'empty' }, [`Could not start aRKive: ${error.message}`]));
});

