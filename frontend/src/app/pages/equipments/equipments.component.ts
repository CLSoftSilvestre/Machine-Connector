import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../core/services/api.service';
import { Equipment } from '../../core/models';
import { EquipmentDialogComponent } from './equipment-dialog/equipment-dialog.component';

@Component({
  selector: 'app-equipments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  templateUrl: './equipments.component.html',
  styleUrl: './equipments.component.scss',
})
export class EquipmentsComponent implements OnInit {
  equipments = signal<Equipment[]>([]);
  filteredEquipments = signal<Equipment[]>([]);
  loading = signal<boolean>(false);
  searchText = '';

  displayedColumns = ['name', 'description', 'opcuaNodeId', 'iihAssetId', 'status', 'actions'];

  constructor(
    private apiService: ApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadEquipments();
  }

  loadEquipments(): void {
    this.loading.set(true);
    this.apiService.getEquipments().subscribe({
      next: (eq) => {
        this.equipments.set(eq);
        this.applyFilter();
        this.loading.set(false);
      },
      error: (err) => {
        this.showError('Failed to load equipment');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  applyFilter(): void {
    const search = this.searchText.toLowerCase().trim();
    if (!search) {
      this.filteredEquipments.set(this.equipments());
    } else {
      this.filteredEquipments.set(
        this.equipments().filter(
          (e) =>
            e.name.toLowerCase().includes(search) ||
            (e.description?.toLowerCase().includes(search) ?? false) ||
            e.opcuaNodeId.toLowerCase().includes(search) ||
            e.iihAssetId.toLowerCase().includes(search),
        ),
      );
    }
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(EquipmentDialogComponent, {
      width: '560px',
      data: { mode: 'create' },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.loading.set(true);
        this.apiService.createEquipment(result).subscribe({
          next: () => {
            this.showSuccess('Equipment created successfully');
            this.loadEquipments();
          },
          error: () => {
            this.showError('Failed to create equipment');
            this.loading.set(false);
          },
        });
      }
    });
  }

  openEditDialog(equipment: Equipment): void {
    const ref = this.dialog.open(EquipmentDialogComponent, {
      width: '560px',
      data: { mode: 'edit', equipment },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.loading.set(true);
        this.apiService.updateEquipment(equipment.id, result).subscribe({
          next: () => {
            this.showSuccess('Equipment updated successfully');
            this.loadEquipments();
          },
          error: () => {
            this.showError('Failed to update equipment');
            this.loading.set(false);
          },
        });
      }
    });
  }

  deleteEquipment(equipment: Equipment): void {
    if (!confirm(`Are you sure you want to delete "${equipment.name}"?`)) return;

    this.loading.set(true);
    this.apiService.deleteEquipment(equipment.id).subscribe({
      next: () => {
        this.showSuccess(`"${equipment.name}" deleted`);
        this.loadEquipments();
      },
      error: () => {
        this.showError('Failed to delete equipment');
        this.loading.set(false);
      },
    });
  }

  toggleEquipment(equipment: Equipment): void {
    this.apiService.toggleEquipment(equipment.id).subscribe({
      next: (updated) => {
        this.showSuccess(`"${equipment.name}" ${updated.enabled ? 'enabled' : 'disabled'}`);
        this.loadEquipments();
      },
      error: () => {
        this.showError('Failed to toggle equipment');
      },
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: 'snack-success' });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: 'snack-error' });
  }
}
