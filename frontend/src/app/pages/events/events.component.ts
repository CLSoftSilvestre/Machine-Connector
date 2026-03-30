import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/services/api.service';
import { Equipment, QueuedEvent } from '../../core/models';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCardModule,
    MatPaginatorModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './events.component.html',
  styleUrl: './events.component.scss',
})
export class EventsComponent implements OnInit, OnDestroy {
  events = signal<QueuedEvent[]>([]);
  equipments = signal<Equipment[]>([]);
  total = signal<number>(0);
  loading = signal<boolean>(false);
  autoRefresh = signal<boolean>(false);
  expandedEventId = signal<string | null>(null);

  statusFilter = 'all';
  typeFilter = 'all';
  equipmentFilter = 'all';
  pageSize = 20;
  pageIndex = 0;

  private refreshTimer?: ReturnType<typeof setInterval>;

  displayedColumns = ['type', 'equipmentName', 'status', 'createdAt', 'retryCount', 'actions'];

  constructor(
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.loadEquipments();
    this.loadEvents();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  loadEquipments(): void {
    this.apiService.getEquipments().subscribe({
      next: (eq) => this.equipments.set(eq),
    });
  }

  loadEvents(): void {
    this.loading.set(true);
    this.apiService.getEvents({
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined,
      type: this.typeFilter !== 'all' ? this.typeFilter : undefined,
      equipmentId: this.equipmentFilter !== 'all' ? this.equipmentFilter : undefined,
      limit: this.pageSize,
      offset: this.pageIndex * this.pageSize,
    }).subscribe({
      next: (res) => {
        this.events.set(res.events);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadEvents();
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.loadEvents();
  }

  toggleAutoRefresh(): void {
    if (this.autoRefresh()) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => this.loadEvents(), 10000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  clearFailed(): void {
    if (!confirm('Are you sure you want to delete all failed events? This cannot be undone.')) return;

    this.apiService.clearFailedEvents().subscribe({
      next: (res) => {
        this.snackBar.open(`Cleared ${res.deleted} failed events`, 'Close', { duration: 3000 });
        this.loadEvents();
      },
      error: () => {
        this.snackBar.open('Failed to clear events', 'Close', { duration: 3000 });
      },
    });
  }

  toggleExpand(eventId: string): void {
    this.expandedEventId.update((id) => (id === eventId ? null : eventId));
  }

  formatTimestamp(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString();
  }

  formatPayload(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, null, 2);
  }

  getStatusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }

  getTypeLabel(type: string): string {
    return type === 'MACHINE_STATUS' ? 'Machine Status' : 'Counter';
  }
}
