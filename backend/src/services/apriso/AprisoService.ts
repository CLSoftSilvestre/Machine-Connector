import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { db } from '../../db/database';
import type { QueuedEvent } from '../queue/EventQueueService';

interface SettingRow {
  value: string;
}

function getEffectiveConfig(): { baseUrl: string; apiKey: string; username: string; password: string } {
  const getSetting = (key: string): string | undefined => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    return row?.value;
  };

  return {
    baseUrl: getSetting('aprisoBaseUrl') || config.apriso.baseUrl,
    apiKey: getSetting('aprisoApiKey') || config.apriso.apiKey,
    username: getSetting('aprisoUsername') || config.apriso.username,
    password: getSetting('aprisoPassword') || config.apriso.password,
  };
}

function isStubMode(baseUrl: string): boolean {
  return !baseUrl || baseUrl.includes('mock') || baseUrl.includes('localhost') || !baseUrl.startsWith('http');
}

function createAxiosInstance(cfg: ReturnType<typeof getEffectiveConfig>): AxiosInstance {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (cfg.apiKey) {
    headers['X-API-Key'] = cfg.apiKey;
  }

  return axios.create({
    baseURL: cfg.baseUrl,
    headers,
    timeout: 15000,
    auth: cfg.username ? { username: cfg.username, password: cfg.password } : undefined,
  });
}

export class AprisoService {
  async publishMachineStatus(event: QueuedEvent): Promise<void> {
    const cfg = getEffectiveConfig();

    if (isStubMode(cfg.baseUrl)) {
      logger.info(`STUB: would publish MACHINE_STATUS to Apriso for equipment=${event.equipment_name} id=${event.id}`);
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

    logger.info(`Apriso MACHINE_STATUS published: event=${event.id} status=${response.status}`);
  }

  async publishCounter(event: QueuedEvent): Promise<void> {
    const cfg = getEffectiveConfig();

    if (isStubMode(cfg.baseUrl)) {
      logger.info(`STUB: would publish COUNTER to Apriso for equipment=${event.equipment_name} id=${event.id}`);
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

    logger.info(`Apriso COUNTER published: event=${event.id} status=${response.status}`);
  }

  async testConnection(baseUrl: string, username?: string, password?: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    if (isStubMode(baseUrl)) {
      return { success: true, message: 'Apriso is in stub/mock mode. Connection test simulated successfully.' };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const client = axios.create({
        baseURL: baseUrl,
        headers,
        timeout: 10000,
        auth: username ? { username, password: password || '' } : undefined,
      });

      await client.get('/api/v1/health');
      return { success: true, message: 'Apriso connection successful' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Apriso connection failed: ${message}` };
    }
  }
}

export const aprisoService = new AprisoService();
