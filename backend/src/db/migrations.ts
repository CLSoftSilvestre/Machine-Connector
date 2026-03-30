import { db } from './database';
import { logger } from '../utils/logger';

export function runMigrations(): void {
  logger.info('Running database migrations...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS equipments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      opcua_node_id TEXT NOT NULL,
      iih_asset_id TEXT NOT NULL,
      iih_variable_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS event_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('MACHINE_STATUS', 'COUNTER')),
      equipment_id TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      sent_at INTEGER,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_event_queue_status ON event_queue(status);
    CREATE INDEX IF NOT EXISTS idx_event_queue_created_at ON event_queue(created_at);
    CREATE INDEX IF NOT EXISTS idx_event_queue_equipment_id ON event_queue(equipment_id);
  `);

  logger.info('Database migrations completed');
}
