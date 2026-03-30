import { Router, Request, Response } from 'express';
import { opcUaService } from '../../services/opcua/OpcUaService';
import { iihService } from '../../services/iih/IIHService';
import { eventQueueService } from '../../services/queue/EventQueueService';

const router = Router();

const startTime = Date.now();
const version = '1.0.0';

router.get('/', (_req: Request, res: Response) => {
  const stats = eventQueueService.getStats();
  const opcuaStatus = opcUaService.getStatus();
  const iihStatus = iihService.getStatus();

  const uptime = Math.floor((Date.now() - startTime) / 1000);

  const overallStatus =
    opcuaStatus === 'connected' && iihStatus !== 'error' ? 'ok' :
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

export default router;
