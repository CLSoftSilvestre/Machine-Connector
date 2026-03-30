import type { Equipment } from '../iih/IIHService';
type OpcUaConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
export declare class OpcUaService {
    private client;
    private session;
    private subscription;
    private monitoredItems;
    private connectionStatus;
    private reconnectTimer;
    private reconnectDelay;
    private isShuttingDown;
    private setStatus;
    start(): Promise<void>;
    private connect;
    private getEndpointUrl;
    private getApplicationName;
    private scheduleReconnect;
    private cleanupConnection;
    subscribeToEquipment(equipment: Equipment): Promise<void>;
    private onDataChange;
    private subscribeToAllEquipments;
    refreshSubscriptions(): Promise<void>;
    stop(): Promise<void>;
    getStatus(): OpcUaConnectionStatus;
}
export declare const opcUaService: OpcUaService;
export {};
//# sourceMappingURL=OpcUaService.d.ts.map