import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './logger';

let wss: WebSocketServer | null = null;

interface WsMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

export function initWebSocketServer(server: http.Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    logger.info(`WebSocket client connected from ${ip}`);

    (ws as WebSocket & { isAlive: boolean }).isAlive = true;

    ws.on('pong', () => {
      (ws as WebSocket & { isAlive: boolean }).isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString()) as { type?: string };
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      logger.info(`WebSocket client disconnected from ${ip}`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket client error from ${ip}: ${err.message}`);
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
    if (!wss) return;
    wss.clients.forEach((ws) => {
      const extWs = ws as WebSocket & { isAlive: boolean };
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

  logger.info('WebSocket server initialized');
}

export function broadcast(type: string, data: unknown): void {
  if (!wss) return;

  const message: WsMessage = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  const payload = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload, (err) => {
        if (err) {
          logger.debug(`WebSocket send error: ${err.message}`);
        }
      });
    }
  });
}
