import { readFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import logger from '../utils/logger.js';
import config from '../config.js';

let db;

export function initDatabase() {
  const dbPath = resolve(config.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();

  logger.info({ dbPath }, 'Database initialized');
  return db;
}

// Applied in order; PRAGMA user_version records how many have run.
// 001 is idempotent, so databases created before versioning start at 0 safely.
const MIGRATIONS = ['001_initial.sql', '002_threads_fit_reply.sql', '003_linkedin.sql'];

function runMigrations() {
  const applied = db.pragma('user_version', { simple: true });
  for (let i = applied; i < MIGRATIONS.length; i++) {
    const sql = readFileSync(new URL(`./migrations/${MIGRATIONS[i]}`, import.meta.url), 'utf-8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${i + 1}`);
    })();
    logger.info({ migration: MIGRATIONS[i] }, 'Migration applied');
  }
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
