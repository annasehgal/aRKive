function indexPayload(db, linkId) {
  const link = db.prepare(`
    SELECT l.*, c.name AS category
    FROM links l
    LEFT JOIN categories c ON c.id = l.category_id
    WHERE l.id = ?
  `).get(linkId);
  if (!link) return null;
  const tags = db.prepare(`
    SELECT t.name
    FROM tags t
    JOIN link_tags lt ON lt.tag_id = t.id
    WHERE lt.link_id = ?
    ORDER BY t.name
  `).all(linkId).map((tag) => tag.name).join(' ');
  return { link, tags };
}

export function reindexLink(db, linkId) {
  const payload = indexPayload(db, linkId);
  db.prepare('DELETE FROM link_search WHERE rowid = ?').run(linkId);
  if (!payload) return;
  const { link, tags } = payload;
  db.prepare(`
    INSERT INTO link_search(rowid, title, url, domain, description, notes, category, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    link.id,
    link.title || '',
    link.url || '',
    link.domain || '',
    link.description || '',
    link.notes || '',
    link.category || '',
    tags
  );
}

