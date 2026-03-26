import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Login - Curator AI'
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard - Curator AI'
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./components/upload/upload.component').then(m => m.UploadComponent),
    title: 'Upload - Curator AI'
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./components/documents/documents.component').then(m => m.DocumentsComponent),
    title: 'Documents - Curator AI'
  },
  {
    path: 'archive',
    loadComponent: () =>
      import('./components/archive/archive.component').then(m => m.ArchiveComponent),
    title: 'Archive - Curator AI'
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
