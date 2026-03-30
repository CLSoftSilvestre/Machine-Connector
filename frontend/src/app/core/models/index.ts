export interface Equipment {
  id: string;
  name: string;
  description?: string;
  opcuaNodeId: string;
  iihAssetId: string;
  iihVariableId: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface QueuedEvent {
  id: string;
  type: 'MACHINE_STATUS' | 'COUNTER';
  equipmentId: string;
  equipmentName: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  retryCount: number;
  nextRetryAt?: number;
  createdAt: number;
  sentAt?: number;
  errorMessage?: string;
}

export interface EventStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  total: number;
  byType: {
    MACHINE_STATUS: number;
    COUNTER: number;
  };
}

export interface ConnectionStatus {
  opcua: 'connected' | 'disconnected' | 'connecting' | 'error';
  iih: 'connected' | 'disconnected' | 'error' | 'unknown';
  apriso: 'connected' | 'disconnected' | 'error' | 'unknown';
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  connections: ConnectionStatus;
  queue: { pending: number; failed: number };
}

export interface WsMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface AppSettings {
  opcuaEndpointUrl: string;
  opcuaAppName: string;
  iihBaseUrl: string;
  iihUsername: string;
  iihPassword: string;
  iihCounterEndpoint: string;
  aprisoBaseUrl: string;
  aprisoUsername: string;
  aprisoPassword: string;
  aprisoApiKey: string;
}
