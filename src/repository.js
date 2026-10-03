import { getDb } from './db.js';
import { domainFor, normalizeUrl, parseHttpUrl } from './urlUtils.js';
import { reindexLink } from './searchIndex.js';

export function createLink({ url, notes = '', category = '', tags = [], keepDuplicate = false }) {
  const db = getDb();
  const parsed = parseHttpUrl(url);
  const normalized = normalizeUrl(parsed.toString());
  const existing = db.prepare('SELECT * FROM links WHERE normalized_url = ? AND duplicate_of_id IS NULL').get(normalized);
  if (existing && !keepDuplicate) return { duplicate: true, link: hydrateLink(existing.id) };

  const categoryId = ensureCategory(db, category);
  const duplicateOfId = existing?.id || null;
  const result = db.prepare(`
    INSERT INTO links (url, normalized_url, title, domain, notes, category_id, duplicate_of_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(parsed.toString(), keepDuplicate ? `${normalized}#duplicate-${Date.now()}` : normalized, parsed.hostname, domainFor(parsed.toString()), notes, categoryId, duplicateOfId);
  setTags(db, result.lastInsertRowid, tags);
  reindexLink(db, result.lastInsertRowid);
  return { duplicate: false, link: hydrateLink(result.lastInsertRowid) };
}

export function applyMetadata(id, metadata, status = 'ready', error = '') {
  const db = getDb();
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
  if (!link) return null;
  db.prepare(`
    UPDATE links
    SET title = COALESCE(NULLIF(?, ''), title),
        domain = COALESCE(NULLIF(?, ''), domain),
        description = COALESCE(?, description),
        favicon_url = COALESCE(NULLIF(?, ''), favicon_url),
        image_url = COALESCE(NULLIF(?, ''), image_url),
        content_type = COALESCE(NULLIF(?, ''), content_type),
        metadata_status = ?,
        metadata_error = ?
    WHERE id = ?
  `).run(
    metadata.title || '',
    metadata.domain || '',
    metadata.description ?? '',
    metadata.favicon_url || '',
    metadata.image_url || '',
    metadata.content_type || '',
    status,
    error,
    id
  );
  reindexLink(db, id);
  return hydrateLink(id);
}

export function markMetadataFailed(id, message) {
  const db = getDb();
  db.prepare('UPDATE links SET metadata_status = ?, metadata_error = ? WHERE id = ?').run('failed', String(message || 'Metadata unavailable').slice(0, 300), id);
  reindexLink(db, id);
  return hydrateLink(id);
}

export function listLinks(query = {}) {
  const db = getDb();
  const params = {};
  const where = [];
  let from = 'links l';
  let order = 'l.created_at DESC';

  if (query.search) {
    from += ' JOIN link_search s ON s.rowid = l.id';
    where.push('s.link_search MATCH @search');
    params.search = ftsQuery(query.search);
  }
  if (query.view === 'inbox') where.push('l.category_id IS NULL AND l.is_archived = 0');
  if (query.view === 'favorites') where.push('l.is_favorite = 1 AND l.is_archived = 0');
  if (query.view === 'read-later') where.push('l.is_read = 0 AND l.is_archived = 0');
  if (query.view === 'archived') where.push('l.is_archived = 1');
  if (!query.includeArchived && query.view !== 'archived') where.push('l.is_archived = 0');
  if (query.categoryId) {
    where.push('l.category_id = @categoryId');
    params.categoryId = Number(query.categoryId);
  }
  if (query.domain) {
    where.push('l.domain = @domain');
    params.domain = query.domain;
  }
  if (query.tagId) {
    from += ' JOIN link_tags filter_lt ON filter_lt.link_id = l.id';
    where.push('filter_lt.tag_id = @tagId');
    params.tagId = Number(query.tagId);
  }
  if (query.read === 'read') where.push('l.is_read = 1');
  if (query.read === 'unread') where.push('l.is_read = 0');
  if (query.sort === 'oldest') order = 'l.created_at ASC';
  if (query.sort === 'alpha') order = 'LOWER(COALESCE(NULLIF(l.title, \'\'), l.url)) ASC';
  if (query.sort === 'accessed') order = 'l.last_accessed_at DESC NULLS LAST, l.created_at DESC';

  const rows = db.prepare(`
    SELECT DISTINCT l.id
    FROM ${from}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${order}
    LIMIT 300
  `).all(params);
  return rows.map((row) => hydrateLink(row.id));
}

export function hydrateLink(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT l.*, c.name AS category
    FROM links l
    LEFT JOIN categories c ON c.id = l.category_id
    WHERE l.id = ?
  `).get(id);
  if (!row) return null;
  row.tags = db.prepare(`
    SELECT t.id, t.name
    FROM tags t
    JOIN link_tags lt ON lt.tag_id = t.id
    WHERE lt.link_id = ?
    ORDER BY t.name
  `).all(id);
  return row;
}

export function updateLink(id, patch) {
  const db = getDb();
  const current = hydrateLink(id);
  if (!current) return null;
  const categoryId = Object.hasOwn(patch, 'category') ? ensureCategory(db, patch.category) : current.category_id;
  db.prepare(`
    UPDATE links
    SET notes = ?, category_id = ?, is_read = ?, is_favorite = ?, is_archived = ?
    WHERE id = ?
  `).run(
    Object.hasOwn(patch, 'notes') ? String(patch.notes || '') : current.notes,
    categoryId,
    boolValue(patch.is_read, current.is_read),
    boolValue(patch.is_favorite, current.is_favorite),
    boolValue(patch.is_archived, current.is_archived),
    id
  );
  if (Object.hasOwn(patch, 'tags')) setTags(db, id, patch.tags || []);
  reindexLink(db, id);
  return hydrateLink(id);
}

export function recordAccess(id) {
  const db = getDb();
  db.prepare('UPDATE links SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return hydrateLink(id);
}

export function deleteLink(id) {
  const db = getDb();
  db.prepare('DELETE FROM link_search WHERE rowid = ?').run(id);
  return db.prepare('DELETE FROM links WHERE id = ?').run(id).changes > 0;
}

export function listFacets() {
  const db = getDb();
  return {
    categories: db.prepare('SELECT id, name FROM categories ORDER BY name').all(),
    tags: db.prepare('SELECT id, name FROM tags ORDER BY name').all(),
    domains: db.prepare('SELECT domain, COUNT(*) AS count FROM links WHERE domain IS NOT NULL GROUP BY domain ORDER BY count DESC, domain').all()
  };
}

function ensureCategory(db, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  db.prepare('INSERT OR IGNORE INTO categories(name) VALUES (?)').run(clean);
  return db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(clean).id;
}

function ensureTag(db, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(clean);
  return db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(clean).id;
}

function setTags(db, linkId, tags) {
  db.prepare('DELETE FROM link_tags WHERE link_id = ?').run(linkId);
  const insert = db.prepare('INSERT OR IGNORE INTO link_tags(link_id, tag_id) VALUES (?, ?)');
  for (const tag of tags) {
    const id = ensureTag(db, tag);
    if (id) insert.run(linkId, id);
  }
}

function boolValue(value, fallback) {
  if (value === undefined) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

function ftsQuery(input) {
  return String(input)
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
}

