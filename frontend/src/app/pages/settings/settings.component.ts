import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/services/api.service';
import { AppSettings } from '../../core/models';

interface TestResult {
  success: boolean;
  message: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  form!: FormGroup;
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  testingOpcua = signal<boolean>(false);
  testingIih = signal<boolean>(false);
  testingApriso = signal<boolean>(false);

  testOpcuaResult = signal<TestResult | null>(null);
  testIihResult = signal<TestResult | null>(null);
  testAprisoResult = signal<TestResult | null>(null);

  showIihPassword = signal<boolean>(false);
  showAprisoPassword = signal<boolean>(false);

  isAprisoStub = signal<boolean>(true);

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      // OPC-UA
      opcuaEndpointUrl: [''],
      opcuaAppName: [''],
      // IIH
      iihBaseUrl: [''],
      iihUsername: [''],
      iihPassword: [''],
      iihCounterEndpoint: [''],
      // Apriso
      aprisoBaseUrl: [''],
      aprisoUsername: [''],
      aprisoPassword: [''],
      aprisoApiKey: [''],
    });

    this.loadSettings();
  }

  loadSettings(): void {
    this.loading.set(true);
    this.apiService.getSettings().subscribe({
      next: (settings) => {
        const patch: Partial<AppSettings> = {};
        for (const [key, value] of Object.entries(settings)) {
          (patch as Record<string, string>)[key] = String(value || '');
        }
        this.form.patchValue(patch);
        this.checkAprisoStubMode();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load settings', 'Close', { duration: 3000 });
      },
    });
  }

  checkAprisoStubMode(): void {
    const url = String(this.form.get('aprisoBaseUrl')?.value || '');
    this.isAprisoStub.set(!url || url.includes('mock') || url.includes('localhost'));
  }

  saveSettings(): void {
    this.saving.set(true);
    const values = this.form.value as Record<string, string>;

    // Don't save masked password values
    const toSave: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== '***' && value !== null && value !== undefined) {
        toSave[key] = value;
      }
    }

    this.apiService.saveSettings(toSave).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Settings saved successfully', 'Close', { duration: 3000 });
        this.checkAprisoStubMode();
      },
      error: () => {
        this.saving.set(false);
        this.snackBar.open('Failed to save settings', 'Close', { duration: 5000 });
      },
    });
  }

  testOpcua(): void {
    const endpointUrl = String(this.form.get('opcuaEndpointUrl')?.value || '');
    if (!endpointUrl) {
      this.testOpcuaResult.set({ success: false, message: 'Please enter an OPC-UA endpoint URL' });
      return;
    }

    this.testingOpcua.set(true);
    this.testOpcuaResult.set(null);

    this.apiService.testConnection('opcua', { endpointUrl }).subscribe({
      next: (result) => {
        this.testOpcuaResult.set(result);
        this.testingOpcua.set(false);
      },
      error: () => {
        this.testOpcuaResult.set({ success: false, message: 'Test request failed' });
        this.testingOpcua.set(false);
      },
    });
  }

  testIih(): void {
    const baseUrl = String(this.form.get('iihBaseUrl')?.value || '');
    if (!baseUrl) {
      this.testIihResult.set({ success: false, message: 'Please enter an IIH base URL' });
      return;
    }

    this.testingIih.set(true);
    this.testIihResult.set(null);

    const params: Record<string, string> = { baseUrl };
    const username = this.form.get('iihUsername')?.value as string;
    const password = this.form.get('iihPassword')?.value as string;
    const counterEndpoint = this.form.get('iihCounterEndpoint')?.value as string;

    if (username) params['username'] = username;
    if (password && password !== '***') params['password'] = password;
    if (counterEndpoint) params['counterEndpoint'] = counterEndpoint;

    this.apiService.testConnection('iih', params).subscribe({
      next: (result) => {
        this.testIihResult.set(result);
        this.testingIih.set(false);
      },
      error: () => {
        this.testIihResult.set({ success: false, message: 'Test request failed' });
        this.testingIih.set(false);
      },
    });
  }

  toggleIihPassword(): void {
    this.showIihPassword.update(v => !v);
  }

  toggleAprisoPassword(): void {
    this.showAprisoPassword.update(v => !v);
  }

  testApriso(): void {
    const baseUrl = String(this.form.get('aprisoBaseUrl')?.value || '');
    if (!baseUrl) {
      this.testAprisoResult.set({ success: false, message: 'Please enter an Apriso base URL' });
      return;
    }

    this.testingApriso.set(true);
    this.testAprisoResult.set(null);

    const params: Record<string, string> = { baseUrl };
    const username = this.form.get('aprisoUsername')?.value as string;
    const password = this.form.get('aprisoPassword')?.value as string;
    const apiKey = this.form.get('aprisoApiKey')?.value as string;

    if (username) params['username'] = username;
    if (password && password !== '***') params['password'] = password;
    if (apiKey && apiKey !== '***') params['apiKey'] = apiKey;

    this.apiService.testConnection('apriso', params).subscribe({
      next: (result) => {
        this.testAprisoResult.set(result);
        this.testingApriso.set(false);
      },
      error: () => {
        this.testAprisoResult.set({ success: false, message: 'Test request failed' });
        this.testingApriso.set(false);
      },
    });
  }
}
