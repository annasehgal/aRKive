import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arkive-test-'));
process.chdir(tmp);

const repo = await import('../src/repository.js');
const db = await import('../src/db.js');

test.after(() => {
  db.closeDb();
});

test('saves locally before metadata exists', () => {
  const result = repo.createLink({
    url: 'example.com/paper?utm_source=newsletter',
    notes: 'Read before meeting',
    category: 'Research',
    tags: ['AI', 'paper']
  });
  assert.equal(result.duplicate, false);
  assert.equal(result.link.metadata_status, 'pending');
  assert.equal(result.link.notes, 'Read before meeting');
  assert.equal(result.link.category, 'Research');
  assert.deepEqual(result.link.tags.map((tag) => tag.name).sort(), ['AI', 'paper'].sort());
});

test('detects duplicate normalized URLs', () => {
  const result = repo.createLink({ url: 'https://example.com/paper/?utm_medium=social' });
  assert.equal(result.duplicate, true);
  assert.equal(result.link.domain, 'example.com');
});

test('searches notes, category, and tags with local FTS', () => {
  const links = repo.listLinks({ search: 'meeting research ai' });
  assert.equal(links.length, 1);
  assert.equal(links[0].notes, 'Read before meeting');
});

test('updates notes, tags, category, and states', () => {
  const [link] = repo.listLinks({});
  const updated = repo.updateLink(link.id, {
    notes: 'Potential acoustic sensing source',
    category: 'Grad School',
    tags: ['professor', 'Stanford'],
    is_read: 1,
    is_favorite: 1
  });
  assert.equal(updated.notes, 'Potential acoustic sensing source');
  assert.equal(updated.category, 'Grad School');
  assert.equal(updated.is_read, 1);
  assert.equal(updated.is_favorite, 1);
  assert.deepEqual(updated.tags.map((tag) => tag.name).sort(), ['Stanford', 'professor'].sort());
});

test('filters inbox, favorites, archive, and sorting', () => {
  const [link] = repo.listLinks({});
  assert.equal(repo.listLinks({ view: 'favorites' }).length, 1);
  assert.equal(repo.listLinks({ view: 'inbox' }).length, 0);
  repo.updateLink(link.id, { is_archived: 1 });
  assert.equal(repo.listLinks({}).length, 0);
  assert.equal(repo.listLinks({ view: 'archived' }).length, 1);
});

