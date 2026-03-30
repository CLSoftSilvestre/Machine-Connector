import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { HealthStatus, EventStats, QueuedEvent, ConnectionStatus } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatBadgeModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  health = signal<HealthStatus | null>(null);
  stats = signal<EventStats | null>(null);
  recentEvents = signal<QueuedEvent[]>([]);
  equipmentCount = signal<number>(0);
  loading = signal<boolean>(true);

  private healthInterval?: ReturnType<typeof setInterval>;
  private statsInterval?: ReturnType<typeof setInterval>;
  private wsSub?: Subscription;

  displayedColumns = ['type', 'equipmentName', 'status', 'createdAt', 'retryCount'];

  connections = computed<ConnectionStatus>(() => {
    return this.health()?.connections ?? {
      opcua: 'unknown' as const,
      iih: 'unknown' as const,
      apriso: 'unknown' as const,
    };
  });

  constructor(
    private apiService: ApiService,
    private wsService: WebSocketService,
  ) {}

  ngOnInit(): void {
    this.loadAll();

    this.healthInterval = setInterval(() => this.loadHealth(), 30000);
    this.statsInterval = setInterval(() => this.loadStats(), 10000);

    this.wsSub = this.wsService.messages$.subscribe((msg) => {
      if (['event_queued', 'event_status_changed', 'opcua_status', 'iih_status'].includes(msg.type)) {
        this.loadStats();
        this.loadRecentEvents();
        if (msg.type === 'opcua_status' || msg.type === 'iih_status') {
          this.loadHealth();
        }
      }
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.healthInterval);
    clearInterval(this.statsInterval);
    this.wsSub?.unsubscribe();
  }

  loadAll(): void {
    this.loading.set(true);
    this.loadHealth();
    this.loadStats();
    this.loadRecentEvents();
    this.loadEquipmentCount();
  }

  loadHealth(): void {
    this.apiService.getHealth().subscribe({
      next: (h) => {
        this.health.set(h);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadStats(): void {
    this.apiService.getEventStats().subscribe({
      next: (s) => this.stats.set(s),
    });
  }

  loadRecentEvents(): void {
    this.apiService.getEvents({ limit: 20, offset: 0 }).subscribe({
      next: (res) => this.recentEvents.set(res.events),
    });
  }

  loadEquipmentCount(): void {
    this.apiService.getEquipments().subscribe({
      next: (eq) => this.equipmentCount.set(eq.length),
    });
  }

  getConnectionStatusClass(status: string): string {
    switch (status) {
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
      case 'connecting': return 'connecting';
      case 'error': return 'error';
      default: return 'unknown';
    }
  }

  getConnectionLabel(status: string): string {
    switch (status) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  }

  getStatusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }

  formatTimestamp(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString();
  }

  formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  getSentTodayCount(): number {
    // Total sent events (approximate count of today's activity)
    return this.stats()?.sent ?? 0;
  }
}
