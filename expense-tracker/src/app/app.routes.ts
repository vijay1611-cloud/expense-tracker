import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
    pathMatch: 'full',
  },

  {
    path: '',
    loadComponent: () =>
      import('./layouts/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      {
        path: 'login',
        canActivate: [publicGuard],
        loadComponent: () =>
          import('./features/auth/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'auth/callback',
        loadComponent: () =>
          import('./features/auth/callback.component').then((m) => m.AuthCallbackComponent),
      },
    ],
  },

  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/app-layout.component').then((m) => m.AppLayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then(
            (m) => m.TransactionsComponent,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
