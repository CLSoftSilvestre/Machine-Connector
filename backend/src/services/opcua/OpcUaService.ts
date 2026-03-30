import {
  OPCUAClient,
  ClientSession,
  ClientSubscription,
  AttributeIds,
  DataType,
  StatusCodes,
  TimestampsToReturn,
  MonitoringParametersOptions,
  ReadValueIdOptions,
  ClientMonitoredItem,
  DataValue,
  MessageSecurityMode,
} from 'node-opcua';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { db } from '../../db/database';
import { broadcast } from '../../utils/websocket';
import { eventQueueService } from '../queue/EventQueueService';
import type { Equipment } from '../iih/IIHService';

type OpcUaConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export class OpcUaService {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;
  private monitoredItems: Map<string, ClientMonitoredItem> = new Map();
  private connectionStatus: OpcUaConnectionStatus = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 5000;
  private isShuttingDown = false;

  private setStatus(status: OpcUaConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      logger.info(`OPC-UA status changed to: ${status}`);
      broadcast('opcua_status', { status });
    }
  }

  async start(): Promise<void> {
    this.isShuttingDown = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const endpointUrl = this.getEndpointUrl();
    const applicationName = this.getApplicationName();

    this.setStatus('connecting');
    logger.info(`OPC-UA connecting to: ${endpointUrl}`);

    try {
      this.client = OPCUAClient.create({
        applicationName,
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 1,
        },
        keepSessionAlive: true,
        securityMode: MessageSecurityMode.None,
        securityPolicy: 'None',
        endpointMustExist: false,
      });

      this.client.on('connection_failed', () => {
        logger.warn('OPC-UA connection failed');
        this.setStatus('error');
        this.scheduleReconnect();
      });

      this.client.on('backoff', (retry: number, delay: number) => {
        logger.debug(`OPC-UA backoff retry=${retry} delay=${delay}ms`);
      });

      await this.client.connect(endpointUrl);
      logger.info('OPC-UA client connected');

      this.session = await this.client.createSession();
      logger.info('OPC-UA session created');

      this.subscription = await this.session.createSubscription2({
        requestedPublishingInterval: 1000,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 1,
      });

      this.subscription.on('keepalive', () => {
        logger.debug('OPC-UA subscription keepalive');
      });

      this.subscription.on('terminated', () => {
        logger.warn('OPC-UA subscription terminated');
        this.scheduleReconnect();
      });

      this.setStatus('connected');
      this.reconnectDelay = config.opcua.reconnectDelay;

      await this.subscribeToAllEquipments();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`OPC-UA connection error: ${message}`);
      this.setStatus('error');
      await this.cleanupConnection();
      this.scheduleReconnect();
    }
  }

  private getEndpointUrl(): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'opcuaEndpointUrl'").get() as { value: string } | undefined;
    return row?.value || config.opcua.endpointUrl;
  }

  private getApplicationName(): string {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'opcuaAppName'").get() as { value: string } | undefined;
    return row?.value || config.opcua.applicationName;
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) return;

    logger.info(`OPC-UA scheduling reconnect in ${this.reconnectDelay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isShuttingDown) {
        await this.cleanupConnection();
        await this.connect();
      }
    }, this.reconnectDelay);

    // Exponential backoff, max 60 seconds
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
  }

  private async cleanupConnection(): Promise<void> {
    this.monitoredItems.clear();

    if (this.subscription) {
      try { await this.subscription.terminate(); } catch { /* ignore */ }
      this.subscription = null;
    }

    if (this.session) {
      try { await this.session.close(); } catch { /* ignore */ }
      this.session = null;
    }

    if (this.client) {
      try { await this.client.disconnect(); } catch { /* ignore */ }
      this.client = null;
    }
  }

  async subscribeToEquipment(equipment: Equipment): Promise<void> {
    if (!this.session || !this.subscription) {
      logger.warn(`OPC-UA: cannot subscribe to ${equipment.name}, no active session`);
      return;
    }

    if (this.monitoredItems.has(equipment.id)) {
      logger.debug(`OPC-UA: already subscribed to ${equipment.name}`);
      return;
    }

    const nodeToRead: ReadValueIdOptions = {
      nodeId: equipment.opcua_node_id,
      attributeId: AttributeIds.Value,
    };

    const monitoringParams: MonitoringParametersOptions = {
      samplingInterval: 1000,
      discardOldest: true,
      queueSize: 10,
    };

    try {
      const monitoredItem = await this.subscription.monitor(
        nodeToRead,
        monitoringParams,
        TimestampsToReturn.Both
      );

      monitoredItem.on('changed', (dataValue: DataValue) => {
        this.onDataChange(equipment, dataValue);
      });

      monitoredItem.on('err', (err: Error) => {
        logger.error(`OPC-UA monitored item error for ${equipment.name}: ${err.message}`);
      });

      this.monitoredItems.set(equipment.id, monitoredItem);
      logger.info(`OPC-UA subscribed to node ${equipment.opcua_node_id} for equipment ${equipment.name}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`OPC-UA failed to subscribe to ${equipment.name}: ${message}`);
    }
  }

  private onDataChange(equipment: Equipment, dataValue: DataValue): void {
    const value = dataValue.value?.value;
    const statusCode = dataValue.statusCode;
    const quality = statusCode.equals(StatusCodes.Good) ? 'Good' : statusCode.toString();

    const numericValue = typeof value === 'number'
      ? value
      : (value !== null && value !== undefined ? parseFloat(String(value)) : 0);

    const sourceTimestamp = dataValue.sourceTimestamp?.toISOString() || new Date().toISOString();
    const serverTimestamp = dataValue.serverTimestamp?.toISOString() || new Date().toISOString();

    logger.debug(`OPC-UA data change: equipment=${equipment.name} value=${numericValue} quality=${quality}`);

    eventQueueService.enqueue({
      type: 'MACHINE_STATUS',
      equipment_id: equipment.id,
      equipment_name: equipment.name,
      payload: {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        value: numericValue,
        quality,
        sourceTimestamp,
        serverTimestamp,
        dataType: dataValue.value?.dataType !== undefined ? DataType[dataValue.value.dataType] : 'Unknown',
      },
    });

    broadcast('machine_status_update', {
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      value: numericValue,
      quality,
      sourceTimestamp,
    });
  }

  private async subscribeToAllEquipments(): Promise<void> {
    const equipments = db.prepare('SELECT * FROM equipments WHERE enabled = 1').all() as Equipment[];
    logger.info(`OPC-UA subscribing to ${equipments.length} enabled equipment(s)`);

    for (const equipment of equipments) {
      await this.subscribeToEquipment(equipment);
    }
  }

  async refreshSubscriptions(): Promise<void> {
    if (this.connectionStatus !== 'connected' || !this.subscription) {
      logger.info('OPC-UA refreshSubscriptions: not connected, skipping');
      return;
    }

    logger.info('OPC-UA refreshing subscriptions after equipment change');

    // Terminate monitored items that no longer exist
    const enabledEquipments = db.prepare('SELECT * FROM equipments WHERE enabled = 1').all() as Equipment[];
    const enabledIds = new Set(enabledEquipments.map((e) => e.id));

    for (const [equipmentId, monitoredItem] of this.monitoredItems.entries()) {
      if (!enabledIds.has(equipmentId)) {
        try {
          await monitoredItem.terminate();
        } catch { /* ignore */ }
        this.monitoredItems.delete(equipmentId);
        logger.info(`OPC-UA removed subscription for equipment ${equipmentId}`);
      }
    }

    // Add subscriptions for new equipments
    for (const equipment of enabledEquipments) {
      if (!this.monitoredItems.has(equipment.id)) {
        await this.subscribeToEquipment(equipment);
      }
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.cleanupConnection();
    this.setStatus('disconnected');
    logger.info('OPC-UA service stopped');
  }

  getStatus(): OpcUaConnectionStatus {
    return this.connectionStatus;
  }
}

export const opcUaService = new OpcUaService();
