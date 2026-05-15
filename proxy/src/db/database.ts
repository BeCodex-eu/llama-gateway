import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { SETTING_DEFAULTS } from '../lib/llama-settings';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): void {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      model       TEXT    NOT NULL DEFAULT 'unknown',
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms   INTEGER NOT NULL DEFAULT 0,
      prompt        TEXT    NOT NULL DEFAULT '',
      response_preview TEXT NOT NULL DEFAULT '',
      endpoint    TEXT    NOT NULL DEFAULT '/v1/chat/completions',
      status_code INTEGER NOT NULL DEFAULT 200
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_model     ON requests(model);

    CREATE TABLE IF NOT EXISTS models (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    UNIQUE NOT NULL,
      path       TEXT    NOT NULL DEFAULT '',
      last_used  TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertDefaults = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      insertDefault.run(key, value);
    }
  });
  insertDefaults(Object.entries(SETTING_DEFAULTS));
  syncBootstrapConnectionDefaults(db);
}

function syncBootstrapConnectionDefaults(db: Database.Database): void {
  const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const current = Object.fromEntries(settings.map(({ key, value }) => [key, value]));
  const desiredHost = config.llamaHost;
  const currentHost = current.llama_host || '';

  if (!currentHost) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('llama_host', ?)").run(desiredHost);
  }

  const desiredPort = String(config.llamaPort);
  const currentPort = current.llama_port || '';
  if (!currentPort) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('llama_port', ?)").run(desiredPort);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
