"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opcUaService = exports.OpcUaService = void 0;
const node_opcua_1 = require("node-opcua");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const database_1 = require("../../db/database");
const websocket_1 = require("../../utils/websocket");
const EventQueueService_1 = require("../queue/EventQueueService");
class OpcUaService {
    constructor() {
        this.client = null;
        this.session = null;
        this.subscription = null;
        this.monitoredItems = new Map();
        this.connectionStatus = 'disconnected';
        this.reconnectTimer = null;
        this.reconnectDelay = 5000;
        this.isShuttingDown = false;
    }
    setStatus(status) {
        if (this.connectionStatus !== status) {
            this.connectionStatus = status;
            logger_1.logger.info(`OPC-UA status changed to: ${status}`);
            (0, websocket_1.broadcast)('opcua_status', { status });
        }
    }
    async start() {
        this.isShuttingDown = false;
        await this.connect();
    }
    async connect() {
        const endpointUrl = this.getEndpointUrl();
        const applicationName = this.getApplicationName();
        this.setStatus('connecting');
        logger_1.logger.info(`OPC-UA connecting to: ${endpointUrl}`);
        try {
            this.client = node_opcua_1.OPCUAClient.create({
                applicationName,
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: 1,
                },
                keepSessionAlive: true,
                securityMode: node_opcua_1.MessageSecurityMode.None,
                securityPolicy: 'None',
                endpointMustExist: false,
            });
            this.client.on('connection_failed', () => {
                logger_1.logger.warn('OPC-UA connection failed');
                this.setStatus('error');
                this.scheduleReconnect();
            });
            this.client.on('backoff', (retry, delay) => {
                logger_1.logger.debug(`OPC-UA backoff retry=${retry} delay=${delay}ms`);
            });
            await this.client.connect(endpointUrl);
            logger_1.logger.info('OPC-UA client connected');
            this.session = await this.client.createSession();
            logger_1.logger.info('OPC-UA session created');
            this.subscription = await this.session.createSubscription2({
                requestedPublishingInterval: 1000,
                requestedLifetimeCount: 100,
                requestedMaxKeepAliveCount: 10,
                maxNotificationsPerPublish: 100,
                publishingEnabled: true,
                priority: 1,
            });
            this.subscription.on('keepalive', () => {
                logger_1.logger.debug('OPC-UA subscription keepalive');
            });
            this.subscription.on('terminated', () => {
                logger_1.logger.warn('OPC-UA subscription terminated');
                this.scheduleReconnect();
            });
            this.setStatus('connected');
            this.reconnectDelay = config_1.config.opcua.reconnectDelay;
            await this.subscribeToAllEquipments();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`OPC-UA connection error: ${message}`);
            this.setStatus('error');
            await this.cleanupConnection();
            this.scheduleReconnect();
        }
    }
    getEndpointUrl() {
        const row = database_1.db.prepare("SELECT value FROM settings WHERE key = 'opcuaEndpointUrl'").get();
        return row?.value || config_1.config.opcua.endpointUrl;
    }
    getApplicationName() {
        const row = database_1.db.prepare("SELECT value FROM settings WHERE key = 'opcuaAppName'").get();
        return row?.value || config_1.config.opcua.applicationName;
    }
    scheduleReconnect() {
        if (this.isShuttingDown || this.reconnectTimer)
            return;
        logger_1.logger.info(`OPC-UA scheduling reconnect in ${this.reconnectDelay}ms`);
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
    async cleanupConnection() {
        this.monitoredItems.clear();
        if (this.subscription) {
            try {
                await this.subscription.terminate();
            }
            catch { /* ignore */ }
            this.subscription = null;
        }
        if (this.session) {
            try {
                await this.session.close();
            }
            catch { /* ignore */ }
            this.session = null;
        }
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch { /* ignore */ }
            this.client = null;
        }
    }
    async subscribeToEquipment(equipment) {
        if (!this.session || !this.subscription) {
            logger_1.logger.warn(`OPC-UA: cannot subscribe to ${equipment.name}, no active session`);
            return;
        }
        if (this.monitoredItems.has(equipment.id)) {
            logger_1.logger.debug(`OPC-UA: already subscribed to ${equipment.name}`);
            return;
        }
        const nodeToRead = {
            nodeId: equipment.opcua_node_id,
            attributeId: node_opcua_1.AttributeIds.Value,
        };
        const monitoringParams = {
            samplingInterval: 1000,
            discardOldest: true,
            queueSize: 10,
        };
        try {
            const monitoredItem = await this.subscription.monitor(nodeToRead, monitoringParams, node_opcua_1.TimestampsToReturn.Both);
            monitoredItem.on('changed', (dataValue) => {
                this.onDataChange(equipment, dataValue);
            });
            monitoredItem.on('err', (msg) => {
                logger_1.logger.error(`OPC-UA monitored item error for ${equipment.name}: ${msg}`);
            });
            this.monitoredItems.set(equipment.id, monitoredItem);
            logger_1.logger.info(`OPC-UA subscribed to node ${equipment.opcua_node_id} for equipment ${equipment.name}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error(`OPC-UA failed to subscribe to ${equipment.name}: ${message}`);
        }
    }
    onDataChange(equipment, dataValue) {
        const value = dataValue.value?.value;
        const statusCode = dataValue.statusCode;
        const quality = statusCode.equals(node_opcua_1.StatusCodes.Good) ? 'Good' : statusCode.toString();
        const numericValue = typeof value === 'number'
            ? value
            : (value !== null && value !== undefined ? parseFloat(String(value)) : 0);
        const sourceTimestamp = dataValue.sourceTimestamp?.toISOString() || new Date().toISOString();
        const serverTimestamp = dataValue.serverTimestamp?.toISOString() || new Date().toISOString();
        logger_1.logger.debug(`OPC-UA data change: equipment=${equipment.name} value=${numericValue} quality=${quality}`);
        EventQueueService_1.eventQueueService.enqueue({
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
                dataType: dataValue.value?.dataType !== undefined ? node_opcua_1.DataType[dataValue.value.dataType] : 'Unknown',
            },
        });
        (0, websocket_1.broadcast)('machine_status_update', {
            equipmentId: equipment.id,
            equipmentName: equipment.name,
            value: numericValue,
            quality,
            sourceTimestamp,
        });
    }
    async subscribeToAllEquipments() {
        const equipments = database_1.db.prepare('SELECT * FROM equipments WHERE enabled = 1').all();
        logger_1.logger.info(`OPC-UA subscribing to ${equipments.length} enabled equipment(s)`);
        for (const equipment of equipments) {
            await this.subscribeToEquipment(equipment);
        }
    }
    async refreshSubscriptions() {
        if (this.connectionStatus !== 'connected' || !this.subscription) {
            logger_1.logger.info('OPC-UA refreshSubscriptions: not connected, skipping');
            return;
        }
        logger_1.logger.info('OPC-UA refreshing subscriptions after equipment change');
        // Terminate monitored items that no longer exist
        const enabledEquipments = database_1.db.prepare('SELECT * FROM equipments WHERE enabled = 1').all();
        const enabledIds = new Set(enabledEquipments.map((e) => e.id));
        for (const [equipmentId, monitoredItem] of this.monitoredItems.entries()) {
            if (!enabledIds.has(equipmentId)) {
                try {
                    await monitoredItem.terminate();
                }
                catch { /* ignore */ }
                this.monitoredItems.delete(equipmentId);
                logger_1.logger.info(`OPC-UA removed subscription for equipment ${equipmentId}`);
            }
        }
        // Add subscriptions for new equipments
        for (const equipment of enabledEquipments) {
            if (!this.monitoredItems.has(equipment.id)) {
                await this.subscribeToEquipment(equipment);
            }
        }
    }
    async stop() {
        this.isShuttingDown = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        await this.cleanupConnection();
        this.setStatus('disconnected');
        logger_1.logger.info('OPC-UA service stopped');
    }
    getStatus() {
        return this.connectionStatus;
    }
}
exports.OpcUaService = OpcUaService;
exports.opcUaService = new OpcUaService();
//# sourceMappingURL=OpcUaService.js.map