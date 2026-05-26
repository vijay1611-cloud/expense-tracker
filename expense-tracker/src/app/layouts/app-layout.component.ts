import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { ToastService } from '../services/toast.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-app-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonComponent],
  template: `
    <div class="min-h-screen flex bg-stone-50">
      <!-- Sidebar (desktop) -->
      <aside
        class="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-zinc-100 bg-white"
      >
        <div class="px-6 py-6 border-b border-zinc-100">
          <a routerLink="/dashboard" class="flex items-center gap-2 focus-ring rounded">
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-sm"
              >E</span
            >
            <span class="font-semibold tracking-tight text-zinc-900">Expense</span>
          </a>
        </div>

        <nav class="flex-1 px-3 py-4 space-y-1">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-zinc-100 text-zinc-900"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-stone-50 transition-colors focus-ring"
            >
              <span class="text-base" aria-hidden="true">{{ item.icon }}</span>
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="border-t border-zinc-100 p-4">
          <div class="flex items-center gap-3 mb-3 min-w-0">
            @if (auth.avatarUrl(); as url) {
              <img [src]="url" alt="" class="h-8 w-8 rounded-full" referrerpolicy="no-referrer" />
            } @else {
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 font-medium text-sm"
                >{{ initials() }}</span
              >
            }
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-zinc-900 truncate">{{ auth.userName() }}</p>
              <p class="text-xs text-zinc-500 truncate">{{ auth.userEmail() }}</p>
            </div>
          </div>
          <app-button variant="ghost" size="sm" [fullWidth]="true" (click)="signOut()">
            Sign out
          </app-button>
        </div>
      </aside>

      <!-- Mobile topbar -->
      <header
        class="md:hidden fixed inset-x-0 top-0 z-30 bg-white/90 backdrop-blur border-b border-zinc-100"
      >
        <div class="flex items-center justify-between px-4 py-3">
          <a routerLink="/dashboard" class="flex items-center gap-2 focus-ring rounded">
            <span
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-xs"
              >E</span
            >
            <span class="font-semibold tracking-tight text-zinc-900">Expense</span>
          </a>
          <button
            type="button"
            class="rounded-md p-2 text-zinc-600 hover:bg-stone-100 focus-ring"
            (click)="menuOpen.set(!menuOpen())"
            aria-label="Toggle menu"
          >
            @if (menuOpen()) {
              <span aria-hidden="true">✕</span>
            } @else {
              <span aria-hidden="true">☰</span>
            }
          </button>
        </div>
        @if (menuOpen()) {
          <nav class="border-t border-zinc-100 px-2 py-2 space-y-1">
            @for (item of nav; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="bg-zinc-100 text-zinc-900"
                class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600"
                (click)="menuOpen.set(false)"
              >
                <span aria-hidden="true">{{ item.icon }}</span>
                {{ item.label }}
              </a>
            }
            <button
              type="button"
              class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600"
              (click)="signOut()"
            >
              <span aria-hidden="true">↪</span> Sign out
            </button>
          </nav>
        }
      </header>

      <!-- Main -->
      <main class="flex-1 md:pl-64 pt-14 md:pt-0">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AppLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly menuOpen = signal(false);

  readonly nav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '◧' },
    { label: 'Transactions', path: '/transactions', icon: '☰' },
    { label: 'Settings', path: '/settings', icon: '⚙' },
  ];

  initials(): string {
    const name = this.auth.userName() ?? this.auth.userEmail() ?? '';
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/login');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Sign out failed');
    }
  }
}
