export declare const config: {
    port: number;
    nodeEnv: string;
    dbPath: string;
    opcua: {
        endpointUrl: string;
        applicationName: string;
        reconnectDelay: number;
    };
    iih: {
        baseUrl: string;
        username: string;
        password: string;
        pollIntervalSeconds: number;
        counterEndpoint: string;
    };
    apriso: {
        baseUrl: string;
        apiKey: string;
        username: string;
        password: string;
    };
    queue: {
        retentionHours: number;
        processingIntervalMs: number;
        maxRetries: number;
    };
};
//# sourceMappingURL=index.d.ts.map