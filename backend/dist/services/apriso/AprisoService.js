"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aprisoService = exports.AprisoService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const database_1 = require("../../db/database");
function getEffectiveConfig() {
    const getSetting = (key) => {
        const row = database_1.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row?.value;
    };
    return {
        baseUrl: getSetting('aprisoBaseUrl') || config_1.config.apriso.baseUrl,
        apiKey: getSetting('aprisoApiKey') || config_1.config.apriso.apiKey,
        username: getSetting('aprisoUsername') || config_1.config.apriso.username,
        password: getSetting('aprisoPassword') || config_1.config.apriso.password,
    };
}
function isStubMode(baseUrl) {
    return !baseUrl || baseUrl.includes('mock') || baseUrl.includes('localhost') || !baseUrl.startsWith('http');
}
function createAxiosInstance(cfg) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (cfg.apiKey) {
        headers['X-API-Key'] = cfg.apiKey;
    }
    return axios_1.default.create({
        baseURL: cfg.baseUrl,
        headers,
        timeout: 15000,
        auth: cfg.username ? { username: cfg.username, password: cfg.password } : undefined,
    });
}
class AprisoService {
    async publishMachineStatus(event) {
        const cfg = getEffectiveConfig();
        if (isStubMode(cfg.baseUrl)) {
            logger_1.logger.info(`STUB: would publish MACHINE_STATUS to Apriso for equipment=${event.equipment_name} id=${event.id}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
            return;
        }
        const client = createAxiosInstance(cfg);
        const response = await client.post('/api/v1/machine-status', {
            eventId: event.id,
            equipmentId: event.equipment_id,
            equipmentName: event.equipment_name,
            timestamp: new Date().toISOString(),
            ...event.payload,
        });
        logger_1.logger.info(`Apriso MACHINE_STATUS published: event=${event.id} status=${response.status}`);
    }
    async publishCounter(event) {
        const cfg = getEffectiveConfig();
        if (isStubMode(cfg.baseUrl)) {
            logger_1.logger.info(`STUB: would publish COUNTER to Apriso for equipment=${event.equipment_name} id=${event.id}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
            return;
        }
        const client = createAxiosInstance(cfg);
        const response = await client.post('/api/v1/counter', {
            eventId: event.id,
            equipmentId: event.equipment_id,
            equipmentName: event.equipment_name,
            timestamp: new Date().toISOString(),
            ...event.payload,
        });
        logger_1.logger.info(`Apriso COUNTER published: event=${event.id} status=${response.status}`);
    }
    async testConnection(baseUrl, username, password, apiKey) {
        if (isStubMode(baseUrl)) {
            return { success: true, message: 'Apriso is in stub/mock mode. Connection test simulated successfully.' };
        }
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey)
                headers['X-API-Key'] = apiKey;
            const client = axios_1.default.create({
                baseURL: baseUrl,
                headers,
                timeout: 10000,
                auth: username ? { username, password: password || '' } : undefined,
            });
            await client.get('/api/v1/health');
            return { success: true, message: 'Apriso connection successful' };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, message: `Apriso connection failed: ${message}` };
        }
    }
}
exports.AprisoService = AprisoService;
exports.aprisoService = new AprisoService();
//# sourceMappingURL=AprisoService.js.map