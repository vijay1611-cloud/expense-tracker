import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { SyncHistoryService } from '../../services/sync-history.service';
import { CardComponent } from '../../shared/ui/card.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, ButtonComponent, EmptyStateComponent, RelativeTimePipe],
  template: `
    <div class="space-y-6 max-w-2xl">
      <header>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">Settings</h1>
        <p class="mt-1 text-sm text-zinc-500">Manage your account and Gmail connection.</p>
      </header>

      <app-card>
        <h2 class="text-sm font-semibold text-zinc-900 mb-4">Profile</h2>
        <div class="flex items-center gap-4">
          @if (auth.avatarUrl(); as url) {
            <img [src]="url" alt="" class="h-12 w-12 rounded-full" referrerpolicy="no-referrer" />
          } @else {
            <span
              class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 font-semibold"
              >{{ initials() }}</span
            >
          }
          <div>
            <p class="font-medium text-zinc-900">{{ auth.userName() }}</p>
            <p class="text-sm text-zinc-500">{{ auth.userEmail() }}</p>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="text-sm font-semibold text-zinc-900 mb-1">Gmail connection</h2>
        <p class="text-sm text-zinc-500 mb-4">
          @if (auth.isGmailConnected()) {
            Connected. We'll use this token until it expires, then prompt you to reconnect.
          } @else {
            Not connected. Reconnect to sync transactions again.
          }
        </p>
        <app-button variant="secondary" (click)="reconnect()">
          @if (auth.isGmailConnected()) {
            Reconnect Gmail
          } @else {
            Connect Gmail
          }
        </app-button>
      </app-card>

      <app-card>
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="text-sm font-semibold text-zinc-900">Sync history</h2>
          @if (history.runs().length > 0) {
            <span class="text-xs text-zinc-500">last {{ history.runs().length }}</span>
          }
        </div>

        @if (history.runs().length === 0) {
          <app-empty-state
            title="No syncs yet"
            description="Click Sync Gmail on the dashboard to import your transactions."
          />
        } @else {
          <ul class="divide-y divide-zinc-100">
            @for (run of history.runs(); track run.id) {
              <li class="py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-zinc-900">
                    {{ run.started_at | relativeTime }}
                  </p>
                  <p class="text-xs text-zinc-500">
                    {{ fullDate(run.started_at) }} ·
                    {{ duration(run.started_at, run.finished_at) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-zinc-900">
                    {{ run.inserted }} new
                    <span class="text-zinc-400 font-normal">/ {{ run.scanned }}</span>
                  </p>
                  @if (run.errors_count > 0) {
                    <p class="text-xs text-rose-600">{{ run.errors_count }} errors</p>
                  }
                </div>
              </li>
            }
          </ul>
        }
      </app-card>

      <app-card>
        <h2 class="text-sm font-semibold text-zinc-900 mb-1">Session</h2>
        <p class="text-sm text-zinc-500 mb-4">Sign out of this device.</p>
        <app-button variant="danger" (click)="signOut()">Sign out</app-button>
      </app-card>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly history = inject(SyncHistoryService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  async ngOnInit(): Promise<void> {
    try {
      await this.history.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load sync history');
    }
  }

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

  fullDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  duration(startIso: string, endIso: string): string {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 1000) return '<1s';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }

  async reconnect(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not reconnect Gmail');
    }
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
