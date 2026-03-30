"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const IIHService_1 = require("../../services/iih/IIHService");
const AprisoService_1 = require("../../services/apriso/AprisoService");
const OPCUAClient = __importStar(require("node-opcua"));
const router = (0, express_1.Router)();
const PASSWORD_KEYS = ['iihPassword', 'aprisoPassword'];
const SENSITIVE_KEYS = [...PASSWORD_KEYS, 'aprisoApiKey'];
function maskSensitive(key, value) {
    if (SENSITIVE_KEYS.includes(key) && value) {
        return '***';
    }
    return value;
}
// GET /api/settings
router.get('/', (_req, res) => {
    try {
        const rows = database_1.db.prepare('SELECT * FROM settings ORDER BY key').all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = maskSensitive(row.key, row.value);
        }
        res.json(settings);
    }
    catch (err) {
        logger_1.logger.error(`GET /settings error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// PUT /api/settings
router.put('/', (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
        res.status(400).json({ error: 'Request body must be a key-value object' });
        return;
    }
    try {
        const now = Math.floor(Date.now() / 1000);
        const upsert = database_1.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
        const upsertMany = database_1.db.transaction((entries) => {
            for (const [key, value] of entries) {
                // Skip if value is masked (don't overwrite with placeholder)
                if (value === '***')
                    continue;
                upsert.run(key, String(value), now);
            }
        });
        upsertMany(Object.entries(updates));
        logger_1.logger.info(`Settings updated: ${Object.keys(updates).join(', ')}`);
        res.json({ success: true, message: 'Settings saved successfully' });
    }
    catch (err) {
        logger_1.logger.error(`PUT /settings error: ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});
// POST /api/settings/test-opcua
router.post('/test-opcua', async (req, res) => {
    const { endpointUrl } = req.body;
    if (!endpointUrl) {
        res.status(400).json({ error: 'endpointUrl is required' });
        return;
    }
    logger_1.logger.info(`Testing OPC-UA connection to: ${endpointUrl}`);
    try {
        const client = OPCUAClient.OPCUAClient.create({
            applicationName: 'MachineConnectorTest',
            connectionStrategy: { initialDelay: 500, maxRetry: 0 },
            securityMode: OPCUAClient.MessageSecurityMode.None,
            securityPolicy: 'None',
            endpointMustExist: false,
        });
        await client.connect(endpointUrl);
        const session = await client.createSession();
        await session.close();
        await client.disconnect();
        logger_1.logger.info(`OPC-UA test connection successful: ${endpointUrl}`);
        res.json({ success: true, message: `Successfully connected to OPC-UA server at ${endpointUrl}` });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn(`OPC-UA test connection failed: ${endpointUrl} - ${message}`);
        res.json({ success: false, message: `OPC-UA connection failed: ${message}` });
    }
});
// POST /api/settings/test-iih
router.post('/test-iih', async (req, res) => {
    const { baseUrl, username, password, counterEndpoint } = req.body;
    if (!baseUrl) {
        res.status(400).json({ error: 'baseUrl is required' });
        return;
    }
    logger_1.logger.info(`Testing IIH connection to: ${baseUrl}`);
    const result = await IIHService_1.iihService.testConnection(baseUrl, username, password, counterEndpoint);
    res.json(result);
});
// POST /api/settings/test-apriso
router.post('/test-apriso', async (req, res) => {
    const { baseUrl, username, password, apiKey } = req.body;
    if (!baseUrl) {
        res.status(400).json({ error: 'baseUrl is required' });
        return;
    }
    logger_1.logger.info(`Testing Apriso connection to: ${baseUrl}`);
    const result = await AprisoService_1.aprisoService.testConnection(baseUrl, username, password, apiKey);
    res.json(result);
});
exports.default = router;
//# sourceMappingURL=settings.js.map