import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { db } from '../../db/database';
import { broadcast } from '../../utils/websocket';
import { eventQueueService } from '../queue/EventQueueService';

export interface Equipment {
  id: string;
  name: string;
  description?: string;
  opcua_node_id: string;
  iih_asset_id: string;
  iih_variable_id: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface CounterReading {
  value: number;
  unit: string;
  periodStart: string;
  periodEnd: string;
}

interface SettingRow {
  value: string;
}

function getEffectiveConfig(): { baseUrl: string; username: string; password: string; counterEndpoint: string } {
  const getSetting = (key: string): string | undefined => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    return row?.value;
  };

  return {
    baseUrl: getSetting('iihBaseUrl') || config.iih.baseUrl,
    username: getSetting('iihUsername') || config.iih.username,
    password: getSetting('iihPassword') || config.iih.password,
    counterEndpoint: getSetting('iihCounterEndpoint') || config.iih.counterEndpoint,
  };
}

function createAxiosInstance(cfg: ReturnType<typeof getEffectiveConfig>): AxiosInstance {
  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    auth: cfg.username ? { username: cfg.username, password: cfg.password } : undefined,
  });
}

interface IIHAggregatedValue {
  value: number;
  unit?: string;
  from?: string;
  to?: string;
}

interface IIHResponse {
  values?: IIHAggregatedValue[];
  data?: IIHAggregatedValue[];
}

export class IIHService {
  private lastStatus: 'connected' | 'disconnected' | 'error' | 'unknown' = 'unknown';

  async fetchCounterData(equipment: Equipment): Promise<CounterReading | null> {
    const cfg = getEffectiveConfig();
    const client = createAxiosInstance(cfg);

    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(now.getTime() - 60 * 1000).toISOString();

    try {
      const response = await client.get<IIHResponse>(cfg.counterEndpoint, {
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
        logger.debug(`IIH: no counter data for equipment=${equipment.name}`);
        return null;
      }

      const latest = values[values.length - 1];
      return {
        value: typeof latest.value === 'number' ? latest.value : parseFloat(String(latest.value)),
        unit: latest.unit || 'units',
        periodStart: latest.from || periodStart,
        periodEnd: latest.to || periodEnd,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`IIH fetchCounterData failed for ${equipment.name}: ${message}`);
      return null;
    }
  }

  async pollAllEquipments(): Promise<void> {
    const equipments = db.prepare(`
      SELECT * FROM equipments WHERE enabled = 1
    `).all() as Equipment[];

    if (equipments.length === 0) {
      logger.debug('IIH poll: no enabled equipments');
      return;
    }

    logger.info(`IIH poll: fetching counter data for ${equipments.length} equipment(s)`);

    let successCount = 0;
    let errorCount = 0;

    for (const equipment of equipments) {
      try {
        const reading = await this.fetchCounterData(equipment);

        if (reading !== null) {
          const now = new Date().toISOString();
          eventQueueService.enqueue({
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
      } catch (err) {
        errorCount++;
        logger.error(`IIH poll error for ${equipment.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const newStatus = errorCount === 0 ? 'connected' : (successCount === 0 ? 'error' : 'connected');

    if (newStatus !== this.lastStatus) {
      this.lastStatus = newStatus;
      broadcast('iih_status', { status: newStatus, successCount, errorCount });
    }

    logger.info(`IIH poll complete: success=${successCount} errors=${errorCount}`);
  }

  async testConnection(baseUrl: string, username?: string, password?: string, counterEndpoint?: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = axios.create({
        baseURL: baseUrl,
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
        auth: username ? { username, password: password || '' } : undefined,
      });

      const endpoint = counterEndpoint || config.iih.counterEndpoint;
      await client.get(endpoint, {
        params: { assetId: 'test', variableId: 'test', from: new Date().toISOString(), to: new Date().toISOString() },
      });

      return { success: true, message: 'IIH connection successful' };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
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

  getStatus(): 'connected' | 'disconnected' | 'error' | 'unknown' {
    return this.lastStatus;
  }
}

export const iihService = new IIHService();
