import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

const dbPath = path.resolve(config.dbPath);
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info(`Created data directory: ${dataDir}`);
}

export const db = new Database(dbPath, {
  verbose: config.nodeEnv === 'development' ? (msg) => logger.debug(`SQL: ${msg}`) : undefined,
});

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

logger.info(`Database initialized at ${dbPath}`);
