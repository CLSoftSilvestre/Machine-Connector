"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = require("../utils/logger");
const equipments_1 = __importDefault(require("./routes/equipments"));
const events_1 = __importDefault(require("./routes/events"));
const settings_1 = __importDefault(require("./routes/settings"));
const health_1 = __importDefault(require("./routes/health"));
exports.app = (0, express_1.default)();
exports.app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
exports.app.use(express_1.default.json({ limit: '1mb' }));
exports.app.use(express_1.default.urlencoded({ extended: true }));
// Request logging middleware
exports.app.use((req, _res, next) => {
    logger_1.logger.debug(`${req.method} ${req.path}`);
    next();
});
// Mount routes
exports.app.use('/api/equipments', equipments_1.default);
exports.app.use('/api/events', events_1.default);
exports.app.use('/api/settings', settings_1.default);
exports.app.use('/api/health', health_1.default);
// 404 handler
exports.app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Global error handler
exports.app.use((err, _req, res, _next) => {
    logger_1.logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});
function startServer(httpServer) {
    logger_1.logger.info('Express server configured and mounted');
}
//# sourceMappingURL=server.js.map