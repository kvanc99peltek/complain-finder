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

  const migrationPath = new URL('./migrations/001_initial.sql', import.meta.url);
  const migration = readFileSync(migrationPath, 'utf-8');
  db.exec(migration);

  logger.info({ dbPath }, 'Database initialized');
  return db;
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
