import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Equipment,
  QueuedEvent,
  EventStats,
  HealthStatus,
  AppSettings,
} from '../models';

export interface EventsResponse {
  events: QueuedEvent[];
  total: number;
}

export interface EventFilterParams {
  status?: string;
  type?: string;
  equipmentId?: string;
  limit?: number;
  offset?: number;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Equipment endpoints
  getEquipments(): Observable<Equipment[]> {
    return this.http.get<Equipment[]>(`${this.base}/equipments`);
  }

  getEquipment(id: string): Observable<Equipment> {
    return this.http.get<Equipment>(`${this.base}/equipments/${id}`);
  }

  createEquipment(data: Partial<Equipment>): Observable<Equipment> {
    return this.http.post<Equipment>(`${this.base}/equipments`, data);
  }

  updateEquipment(id: string, data: Partial<Equipment>): Observable<Equipment> {
    return this.http.put<Equipment>(`${this.base}/equipments/${id}`, data);
  }

  deleteEquipment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/equipments/${id}`);
  }

  toggleEquipment(id: string): Observable<Equipment> {
    return this.http.post<Equipment>(`${this.base}/equipments/${id}/toggle`, {});
  }

  // Event endpoints
  getEvents(params?: EventFilterParams): Observable<EventsResponse> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.type) httpParams = httpParams.set('type', params.type);
      if (params.equipmentId) httpParams = httpParams.set('equipmentId', params.equipmentId);
      if (params.limit !== undefined) httpParams = httpParams.set('limit', params.limit.toString());
      if (params.offset !== undefined) httpParams = httpParams.set('offset', params.offset.toString());
    }
    return this.http.get<EventsResponse>(`${this.base}/events`, { params: httpParams });
  }

  getEventStats(): Observable<EventStats> {
    return this.http.get<EventStats>(`${this.base}/events/stats`);
  }

  clearFailedEvents(): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${this.base}/events/failed`);
  }

  // Settings endpoints
  getSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(`${this.base}/settings`);
  }

  saveSettings(settings: Partial<AppSettings>): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.base}/settings`, settings);
  }

  testConnection(
    type: 'opcua' | 'iih' | 'apriso',
    params: Record<string, string>
  ): Observable<TestConnectionResult> {
    return this.http.post<TestConnectionResult>(`${this.base}/settings/test-${type}`, params);
  }

  // Health endpoint
  getHealth(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.base}/health`);
  }
}
