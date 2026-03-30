import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { EquipmentsComponent } from './pages/equipments/equipments.component';
import { EventsComponent } from './pages/events/events.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'equipments', component: EquipmentsComponent },
  { path: 'events', component: EventsComponent },
  { path: 'settings', component: SettingsComponent },
];
