import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { UploadHistoryService } from '../../services/upload-history.service';
import { GmailSubjectsService } from '../../services/gmail-subjects.service';
import { CardComponent } from '../../shared/ui/card.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CardComponent,
    ButtonComponent,
    EmptyStateComponent,
    RelativeTimePipe,
  ],
  template: `
    <div class="space-y-6 max-w-2xl">
      <header>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">Settings</h1>
        <p class="mt-1 text-sm text-zinc-500">Account, Gmail integration, and upload history.</p>
      </header>

      <!-- Profile -->
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

      <!-- Gmail integration -->
      <app-card>
        <h2 class="text-sm font-semibold text-zinc-900 mb-1">Gmail integration <span class="text-xs font-normal text-zinc-500">(optional)</span></h2>
        <p class="text-sm text-zinc-500 mb-4">
          Pull transactions from emails whose <strong>subject contains an exact phrase</strong> you list below.
          We never scan the rest of your inbox.
        </p>

        <div class="mb-4">
          @if (auth.isGmailConnected()) {
            <div class="inline-flex items-center gap-2 text-sm text-emerald-700">
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
              Gmail connected
            </div>
          } @else {
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-zinc-500">
                Click below to grant read-only access. Required before adding subject patterns can do anything.
              </p>
              <app-button variant="secondary" size="sm" (click)="connectGmail()">Connect Gmail</app-button>
            </div>
          }
        </div>

        <div class="border-t border-zinc-100 pt-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">Subject patterns</h3>

          <form class="flex gap-2 mb-3" (ngSubmit)="addPattern()">
            <input
              type="text"
              [(ngModel)]="newPattern"
              name="pattern"
              placeholder='e.g. "Your HDFC Bank Statement"'
              class="flex-1 rounded-xl border-zinc-200 bg-white focus:ring-zinc-900 focus:border-zinc-900 text-sm shadow-card"
              maxlength="200"
              [disabled]="adding()"
            />
            <app-button type="submit" variant="primary" size="sm" [loading]="adding()">Add</app-button>
          </form>

          @if (subjects.items().length === 0) {
            <p class="text-xs text-zinc-500 italic">No patterns yet. Add one above to start matching.</p>
          } @else {
            <ul class="divide-y divide-zinc-100">
              @for (item of subjects.items(); track item.id) {
                <li class="py-2.5 flex items-center justify-between gap-3">
                  <div class="min-w-0 flex-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      [checked]="item.enabled"
                      (change)="toggle(item.id, !item.enabled)"
                      class="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      [attr.aria-label]="'Enable pattern: ' + item.pattern"
                    />
                    <code class="text-sm text-zinc-800 truncate">{{ item.pattern }}</code>
                  </div>
                  <button
                    type="button"
                    class="text-xs text-zinc-500 hover:text-rose-600 focus-ring rounded px-2 py-1"
                    (click)="remove(item.id)"
                  >
                    Delete
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      </app-card>

      <!-- Upload history -->
      <app-card>
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="text-sm font-semibold text-zinc-900">Upload history</h2>
          @if (history.runs().length > 0) {
            <span class="text-xs text-zinc-500">last {{ history.runs().length }}</span>
          }
        </div>

        @if (history.runs().length === 0) {
          <app-empty-state
            title="No uploads yet"
            description="Upload a statement on the dashboard to get started."
          />
        } @else {
          <ul class="divide-y divide-zinc-100">
            @for (run of history.runs(); track run.id) {
              <li class="py-3 flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-zinc-900 truncate">
                    {{ run.filename || 'Untitled file' }}
                  </p>
                  <p class="text-xs text-zinc-500">
                    {{ run.started_at | relativeTime }} ·
                    {{ fileSize(run.file_size_bytes) }} ·
                    {{ duration(run.started_at, run.finished_at) }}
                  </p>
                </div>
                <div class="text-right shrink-0">
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

      <!-- Session -->
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
  readonly history = inject(UploadHistoryService);
  readonly subjects = inject(GmailSubjectsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  newPattern = '';
  readonly adding = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.history.load(), this.subjects.load()]);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load settings data');
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

  fileSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  duration(startIso: string, endIso: string): string {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 1000) return '<1s';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }

  async connectGmail(): Promise<void> {
    try {
      await this.auth.connectGmail();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not connect Gmail');
    }
  }

  async addPattern(): Promise<void> {
    const value = this.newPattern.trim();
    if (!value || this.adding()) return;
    this.adding.set(true);
    try {
      await this.subjects.add(value);
      this.newPattern = '';
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not add pattern');
    } finally {
      this.adding.set(false);
    }
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    try {
      await this.subjects.toggle(id, enabled);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not update pattern');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.subjects.remove(id);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not delete pattern');
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
