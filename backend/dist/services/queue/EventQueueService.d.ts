export interface QueuedEvent {
    id: string;
    type: 'MACHINE_STATUS' | 'COUNTER';
    equipment_id: string;
    equipment_name: string;
    payload: Record<string, unknown>;
    status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
    retry_count: number;
    next_retry_at?: number;
    created_at: number;
    sent_at?: number;
    error_message?: string;
}
export interface QueueStats {
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    total: number;
}
export declare class EventQueueService {
    private processingLoopTimer;
    private cleanupTimer;
    private aprisoService;
    setAprisoService(svc: {
        publishMachineStatus(event: QueuedEvent): Promise<void>;
        publishCounter(event: QueuedEvent): Promise<void>;
    }): void;
    enqueue(event: Omit<QueuedEvent, 'id' | 'status' | 'retry_count' | 'created_at'>): void;
    processQueue(): Promise<void>;
    private processEvent;
    startProcessingLoop(): void;
    stopProcessingLoop(): void;
    cleanup(): void;
    getStats(): QueueStats;
}
export declare const eventQueueService: EventQueueService;
//# sourceMappingURL=EventQueueService.d.ts.map