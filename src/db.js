import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'arkive.sqlite');

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function getDbPath() {
  return DB_PATH;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      title TEXT,
      domain TEXT,
      description TEXT,
      favicon_url TEXT,
      image_url TEXT,
      content_type TEXT,
      notes TEXT NOT NULL DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      metadata_status TEXT NOT NULL DEFAULT 'pending',
      metadata_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at TEXT,
      duplicate_of_id INTEGER REFERENCES links(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS links_normalized_unique
      ON links(normalized_url)
      WHERE duplicate_of_id IS NULL;

    CREATE INDEX IF NOT EXISTS links_domain_idx ON links(domain);
    CREATE INDEX IF NOT EXISTS links_created_idx ON links(created_at);
    CREATE INDEX IF NOT EXISTS links_state_idx ON links(is_read, is_favorite, is_archived);

    CREATE TABLE IF NOT EXISTS link_tags (
      link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (link_id, tag_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS link_search USING fts5(
      title,
      url,
      domain,
      description,
      notes,
      category,
      tags,
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS links_updated_at
    AFTER UPDATE ON links
    BEGIN
      UPDATE links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
