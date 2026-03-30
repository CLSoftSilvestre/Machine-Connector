import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WsMessage } from '../models';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;
  private isDestroyed = false;

  readonly messages$ = new Subject<WsMessage>();
  readonly connectionStatus$ = new BehaviorSubject<'connected' | 'disconnected'>('disconnected');

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.isDestroyed) return;

    const url = environment.wsUrl;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectDelay = 3000;
        this.connectionStatus$.next('connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as WsMessage;
          this.messages$.next(message);
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.connectionStatus$.next('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connectionStatus$.next('disconnected');
      };
    } catch {
      this.connectionStatus$.next('disconnected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
        this.connect();
      }
    }, this.reconnectDelay);
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    }
  }

  get messages(): Observable<WsMessage> {
    return this.messages$.asObservable();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
