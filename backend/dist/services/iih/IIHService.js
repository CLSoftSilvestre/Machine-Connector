"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.iihService = exports.IIHService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const database_1 = require("../../db/database");
const websocket_1 = require("../../utils/websocket");
const EventQueueService_1 = require("../queue/EventQueueService");
function getEffectiveConfig() {
    const getSetting = (key) => {
        const row = database_1.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row?.value;
    };
    return {
        baseUrl: getSetting('iihBaseUrl') || config_1.config.iih.baseUrl,
        username: getSetting('iihUsername') || config_1.config.iih.username,
        password: getSetting('iihPassword') || config_1.config.iih.password,
        counterEndpoint: getSetting('iihCounterEndpoint') || config_1.config.iih.counterEndpoint,
    };
}
function createAxiosInstance(cfg) {
    return axios_1.default.create({
        baseURL: cfg.baseUrl,
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
        auth: cfg.username ? { username: cfg.username, password: cfg.password } : undefined,
    });
}
class IIHService {
    constructor() {
        this.lastStatus = 'unknown';
    }
    async fetchCounterData(equipment) {
        const cfg = getEffectiveConfig();
        const client = createAxiosInstance(cfg);
        const now = new Date();
        const periodEnd = now.toISOString();
        const periodStart = new Date(now.getTime() - 60 * 1000).toISOString();
        try {
            const response = await client.get(cfg.counterEndpoint, {
                params: {
                    assetId: equipment.iih_asset_id,
                    variableId: equipment.iih_variable_id,
                    from: periodStart,
                    to: periodEnd,
                    aggregate: 'last',
                },
            });
            const data = response.data;
            const values = data.values || data.data || [];
            if (!values || values.length === 0) {
                logger_1.logger.debug(`IIH: no counter data for equipment=${equipment.name}`);
                return null;
            }
            const latest = values[values.length - 1];
            return {
                value: typeof latest.value === 'number' ? latest.value : parseFloat(String(latest.value)),
                unit: latest.unit || 'units',
                periodStart: latest.from || periodStart,
                periodEnd: latest.to || periodEnd,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`IIH fetchCounterData failed for ${equipment.name}: ${message}`);
            return null;
        }
    }
    async pollAllEquipments() {
        const equipments = database_1.db.prepare(`
      SELECT * FROM equipments WHERE enabled = 1
    `).all();
        if (equipments.length === 0) {
            logger_1.logger.debug('IIH poll: no enabled equipments');
            return;
        }
        logger_1.logger.info(`IIH poll: fetching counter data for ${equipments.length} equipment(s)`);
        let successCount = 0;
        let errorCount = 0;
        for (const equipment of equipments) {
            try {
                const reading = await this.fetchCounterData(equipment);
                if (reading !== null) {
                    const now = new Date().toISOString();
                    EventQueueService_1.eventQueueService.enqueue({
                        type: 'COUNTER',
                        equipment_id: equipment.id,
                        equipment_name: equipment.name,
                        payload: {
                            equipmentId: equipment.id,
                            equipmentName: equipment.name,
                            iihAssetId: equipment.iih_asset_id,
                            iihVariableId: equipment.iih_variable_id,
                            counterValue: reading.value,
                            unit: reading.unit,
                            periodStart: reading.periodStart,
                            periodEnd: reading.periodEnd,
                            collectedAt: now,
                        },
                    });
                    successCount++;
                }
            }
            catch (err) {
                errorCount++;
                logger_1.logger.error(`IIH poll error for ${equipment.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        const newStatus = errorCount === 0 ? 'connected' : (successCount === 0 ? 'error' : 'connected');
        if (newStatus !== this.lastStatus) {
            this.lastStatus = newStatus;
            (0, websocket_1.broadcast)('iih_status', { status: newStatus, successCount, errorCount });
        }
        logger_1.logger.info(`IIH poll complete: success=${successCount} errors=${errorCount}`);
    }
    async testConnection(baseUrl, username, password, counterEndpoint) {
        try {
            const client = axios_1.default.create({
                baseURL: baseUrl,
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' },
                auth: username ? { username, password: password || '' } : undefined,
            });
            const endpoint = counterEndpoint || config_1.config.iih.counterEndpoint;
            await client.get(endpoint, {
                params: { assetId: 'test', variableId: 'test', from: new Date().toISOString(), to: new Date().toISOString() },
            });
            return { success: true, message: 'IIH connection successful' };
        }
        catch (err) {
            if (axios_1.default.isAxiosError(err) && err.response) {
                // A response means the server is reachable (even if 4xx)
                if (err.response.status === 401) {
                    return { success: false, message: 'IIH authentication failed: invalid credentials' };
                }
                if (err.response.status === 404) {
                    return { success: true, message: `IIH server reachable but endpoint not found (${err.response.status})` };
                }
                return { success: true, message: `IIH server reachable (HTTP ${err.response.status})` };
            }
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, message: `IIH connection failed: ${message}` };
        }
    }
    getStatus() {
        return this.lastStatus;
    }
}
exports.IIHService = IIHService;
exports.iihService = new IIHService();
//# sourceMappingURL=IIHService.js.map