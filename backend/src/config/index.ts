export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/connector.db',
  opcua: {
    endpointUrl: process.env.OPCUA_ENDPOINT_URL || 'opc.tcp://localhost:4840',
    applicationName: process.env.OPCUA_APP_NAME || 'MachineConnector',
    reconnectDelay: parseInt(process.env.OPCUA_RECONNECT_DELAY || '5000'),
  },
  iih: {
    baseUrl: process.env.IIH_BASE_URL || 'http://iih-essentials',
    username: process.env.IIH_USERNAME || '',
    password: process.env.IIH_PASSWORD || '',
    pollIntervalSeconds: parseInt(process.env.IIH_POLL_INTERVAL_SECONDS || '60'),
    counterEndpoint: process.env.IIH_COUNTER_ENDPOINT || '/IIHEssentials/v1/aggregatedvalues',
  },
  apriso: {
    baseUrl: process.env.APRISO_BASE_URL || 'http://apriso-mock:8080',
    apiKey: process.env.APRISO_API_KEY || '',
    username: process.env.APRISO_USERNAME || '',
    password: process.env.APRISO_PASSWORD || '',
  },
  queue: {
    retentionHours: parseInt(process.env.QUEUE_RETENTION_HOURS || '24'),
    processingIntervalMs: parseInt(process.env.QUEUE_PROCESSING_INTERVAL_MS || '10000'),
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '10'),
  },
};
