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
export declare class IIHService {
    private lastStatus;
    fetchCounterData(equipment: Equipment): Promise<CounterReading | null>;
    pollAllEquipments(): Promise<void>;
    testConnection(baseUrl: string, username?: string, password?: string, counterEndpoint?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getStatus(): 'connected' | 'disconnected' | 'error' | 'unknown';
}
export declare const iihService: IIHService;
//# sourceMappingURL=IIHService.d.ts.map