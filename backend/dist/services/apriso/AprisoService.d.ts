import type { QueuedEvent } from '../queue/EventQueueService';
export declare class AprisoService {
    publishMachineStatus(event: QueuedEvent): Promise<void>;
    publishCounter(event: QueuedEvent): Promise<void>;
    testConnection(baseUrl: string, username?: string, password?: string, apiKey?: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
export declare const aprisoService: AprisoService;
//# sourceMappingURL=AprisoService.d.ts.map