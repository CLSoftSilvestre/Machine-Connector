"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../utils/logger");
const IIHService_1 = require("../services/iih/IIHService");
function startScheduler() {
    logger_1.logger.info('Starting counter scheduler (every minute)');
    node_cron_1.default.schedule('* * * * *', async () => {
        const now = new Date().toISOString();
        logger_1.logger.info(`Counter scheduler tick at ${now}`);
        try {
            await IIHService_1.iihService.pollAllEquipments();
        }
        catch (err) {
            logger_1.logger.error(`Counter scheduler error: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    logger_1.logger.info('Counter scheduler started');
}
//# sourceMappingURL=CounterScheduler.js.map