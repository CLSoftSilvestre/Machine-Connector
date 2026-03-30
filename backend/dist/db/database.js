"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const dbPath = path_1.default.resolve(config_1.config.dbPath);
const dataDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
    logger_1.logger.info(`Created data directory: ${dataDir}`);
}
exports.db = new better_sqlite3_1.default(dbPath, {
    verbose: config_1.config.nodeEnv === 'development' ? (msg) => logger_1.logger.debug(`SQL: ${msg}`) : undefined,
});
// Enable WAL mode for better concurrency
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
logger_1.logger.info(`Database initialized at ${dbPath}`);
//# sourceMappingURL=database.js.map