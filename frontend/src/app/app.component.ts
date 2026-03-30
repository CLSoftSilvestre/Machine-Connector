import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WebSocketService } from './core/services/websocket.service';
import { ApiService } from './core/services/api.service';
import { HealthStatus } from './core/models';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'Machine Connector';
  sidenavOpened = signal(true);
  wsConnected = signal(false);
  health = signal<HealthStatus | null>(null);

  navItems: NavItem[] = [
    { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: 'equipments', label: 'Equipment', icon: 'settings_input_component' },
    { path: 'events', label: 'Events', icon: 'list_alt' },
    { path: 'settings', label: 'Settings', icon: 'settings' },
  ];

  constructor(
    private wsService: WebSocketService,
    private apiService: ApiService,
  ) {}

  ngOnInit(): void {
    this.wsService.connectionStatus$.subscribe((status) => {
      this.wsConnected.set(status === 'connected');
    });

    this.loadHealth();
    setInterval(() => this.loadHealth(), 30000);
  }

  loadHealth(): void {
    this.apiService.getHealth().subscribe({
      next: (h) => this.health.set(h),
      error: () => this.health.set(null),
    });
  }

  toggleSidenav(): void {
    this.sidenavOpened.update((v) => !v);
  }

  getOverallStatusClass(): string {
    const h = this.health();
    if (!h) return 'unknown';
    if (h.status === 'ok') return 'connected';
    if (h.status === 'degraded') return 'connecting';
    return 'error';
  }

  getOverallStatusLabel(): string {
    const h = this.health();
    if (!h) return 'Unknown';
    if (h.status === 'ok') return 'All Systems OK';
    if (h.status === 'degraded') return 'Degraded';
    return 'Error';
  }
}
