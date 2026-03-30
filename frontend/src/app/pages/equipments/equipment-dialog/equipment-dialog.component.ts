import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { Equipment } from '../../../core/models';

export interface EquipmentDialogData {
  equipment?: Equipment;
  mode: 'create' | 'edit';
}

@Component({
  selector: 'app-equipment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatIconModule,
  ],
  templateUrl: './equipment-dialog.component.html',
})
export class EquipmentDialogComponent implements OnInit {
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<EquipmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EquipmentDialogData,
  ) {}

  ngOnInit(): void {
    const eq = this.data.equipment;
    this.form = this.fb.group({
      name: [eq?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      description: [eq?.description ?? ''],
      opcuaNodeId: [eq?.opcuaNodeId ?? '', Validators.required],
      iihAssetId: [eq?.iihAssetId ?? '', Validators.required],
      iihVariableId: [eq?.iihVariableId ?? '', Validators.required],
      enabled: [eq?.enabled ?? true],
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  get title(): string {
    return this.data.mode === 'create' ? 'Add Equipment' : 'Edit Equipment';
  }
}
