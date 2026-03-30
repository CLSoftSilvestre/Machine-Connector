import { Router, Request, Response } from 'express';
import { db } from '../../db/database';
import { logger } from '../../utils/logger';
import { iihService } from '../../services/iih/IIHService';
import { aprisoService } from '../../services/apriso/AprisoService';
import * as OPCUAClient from 'node-opcua';

const router = Router();

const PASSWORD_KEYS = ['iihPassword', 'aprisoPassword'];
const SENSITIVE_KEYS = [...PASSWORD_KEYS, 'aprisoApiKey'];

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

function maskSensitive(key: string, value: string): string {
  if (SENSITIVE_KEYS.includes(key) && value) {
    return '***';
  }
  return value;
}

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM settings ORDER BY key').all() as SettingRow[];
    const settings: Record<string, string> = {};

    for (const row of rows) {
      settings[row.key] = maskSensitive(row.key, row.value);
    }

    res.json(settings);
  } catch (err) {
    logger.error(`GET /settings error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
router.put('/', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;

  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Request body must be a key-value object' });
    return;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const upsertMany = db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        // Skip if value is masked (don't overwrite with placeholder)
        if (value === '***') continue;
        upsert.run(key, String(value), now);
      }
    });

    upsertMany(Object.entries(updates));

    logger.info(`Settings updated: ${Object.keys(updates).join(', ')}`);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    logger.error(`PUT /settings error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// POST /api/settings/test-opcua
router.post('/test-opcua', async (req: Request, res: Response) => {
  const { endpointUrl } = req.body as { endpointUrl?: string };

  if (!endpointUrl) {
    res.status(400).json({ error: 'endpointUrl is required' });
    return;
  }

  logger.info(`Testing OPC-UA connection to: ${endpointUrl}`);

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

    logger.info(`OPC-UA test connection successful: ${endpointUrl}`);
    res.json({ success: true, message: `Successfully connected to OPC-UA server at ${endpointUrl}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`OPC-UA test connection failed: ${endpointUrl} - ${message}`);
    res.json({ success: false, message: `OPC-UA connection failed: ${message}` });
  }
});

// POST /api/settings/test-iih
router.post('/test-iih', async (req: Request, res: Response) => {
  const { baseUrl, username, password, counterEndpoint } = req.body as {
    baseUrl?: string;
    username?: string;
    password?: string;
    counterEndpoint?: string;
  };

  if (!baseUrl) {
    res.status(400).json({ error: 'baseUrl is required' });
    return;
  }

  logger.info(`Testing IIH connection to: ${baseUrl}`);

  const result = await iihService.testConnection(baseUrl, username, password, counterEndpoint);
  res.json(result);
});

// POST /api/settings/test-apriso
router.post('/test-apriso', async (req: Request, res: Response) => {
  const { baseUrl, username, password, apiKey } = req.body as {
    baseUrl?: string;
    username?: string;
    password?: string;
    apiKey?: string;
  };

  if (!baseUrl) {
    res.status(400).json({ error: 'baseUrl is required' });
    return;
  }

  logger.info(`Testing Apriso connection to: ${baseUrl}`);

  const result = await aprisoService.testConnection(baseUrl, username, password, apiKey);
  res.json(result);
});

export default router;
