"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocketServer = initWebSocketServer;
exports.broadcast = broadcast;
const ws_1 = require("ws");
const logger_1 = require("./logger");
let wss = null;
function initWebSocketServer(server) {
    wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        logger_1.logger.info(`WebSocket client connected from ${ip}`);
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message.toString());
                if (parsed.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                }
            }
            catch {
                // ignore malformed messages
            }
        });
        ws.on('close', () => {
            logger_1.logger.info(`WebSocket client disconnected from ${ip}`);
        });
        ws.on('error', (err) => {
            logger_1.logger.error(`WebSocket client error from ${ip}: ${err.message}`);
        });
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            data: { message: 'Connected to Machine Connector' },
            timestamp: new Date().toISOString(),
        }));
    });
    // Keepalive ping/pong every 30s
    const pingInterval = setInterval(() => {
        if (!wss)
            return;
        wss.clients.forEach((ws) => {
            const extWs = ws;
            if (!extWs.isAlive) {
                extWs.terminate();
                return;
            }
            extWs.isAlive = false;
            extWs.ping();
        });
    }, 30000);
    wss.on('close', () => {
        clearInterval(pingInterval);
    });
    logger_1.logger.info('WebSocket server initialized');
}
function broadcast(type, data) {
    if (!wss)
        return;
    const message = {
        type,
        data,
        timestamp: new Date().toISOString(),
    };
    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(payload, (err) => {
                if (err) {
                    logger_1.logger.debug(`WebSocket send error: ${err.message}`);
                }
            });
        }
    });
}
//# sourceMappingURL=websocket.js.map