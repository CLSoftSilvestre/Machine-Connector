"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const OpcUaService_1 = require("../../services/opcua/OpcUaService");
const IIHService_1 = require("../../services/iih/IIHService");
const EventQueueService_1 = require("../../services/queue/EventQueueService");
const router = (0, express_1.Router)();
const startTime = Date.now();
const version = '1.0.0';
router.get('/', (_req, res) => {
    const stats = EventQueueService_1.eventQueueService.getStats();
    const opcuaStatus = OpcUaService_1.opcUaService.getStatus();
    const iihStatus = IIHService_1.iihService.getStatus();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const overallStatus = opcuaStatus === 'connected' && iihStatus !== 'error' ? 'ok' :
        opcuaStatus === 'error' || iihStatus === 'error' ? 'degraded' : 'ok';
    res.json({
        status: overallStatus,
        version,
        uptime,
        connections: {
            opcua: opcuaStatus,
            iih: iihStatus,
            apriso: 'unknown',
        },
        queue: {
            pending: stats.pending,
            failed: stats.failed,
        },
    });
});
exports.default = router;
//# sourceMappingURL=health.js.map