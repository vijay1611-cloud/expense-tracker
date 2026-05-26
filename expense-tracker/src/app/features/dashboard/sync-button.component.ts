import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { GmailSyncService } from '../../services/gmail-sync.service';
import { AuthService } from '../../services/auth.service';
import { TransactionsService } from '../../services/transactions.service';
import { ToastService } from '../../services/toast.service';
import { SyncHistoryService } from '../../services/sync-history.service';
import { SyncError } from '../../models/sync-result.model';
import { ButtonComponent } from '../../shared/ui/button.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-sync-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, RelativeTimePipe],
  template: `
    <div class="flex flex-col items-end gap-1">
      @if (auth.isGmailConnected()) {
        <app-button variant="primary" [loading]="sync.syncing()" (click)="run()">
          @if (sync.syncing()) {
            Syncing…
          } @else {
            Sync Gmail
          }
        </app-button>
      } @else {
        <app-button variant="secondary" (click)="reconnect()">Reconnect Gmail</app-button>
      }

      @if (history.lastRun(); as last) {
        <p class="text-xs text-zinc-500">
          Last synced {{ last.started_at | relativeTime }} ·
          {{ last.inserted }} new / {{ last.scanned }} scanned
        </p>
      }
    </div>
  `,
})
export class SyncButtonComponent {
  readonly sync = inject(GmailSyncService);
  readonly auth = inject(AuthService);
  readonly history = inject(SyncHistoryService);
  private readonly tx = inject(TransactionsService);
  private readonly toast = inject(ToastService);

  readonly synced = output<void>();

  async run(): Promise<void> {
    try {
      const result = await this.sync.sync();
      if (result.inserted > 0) {
        this.toast.success(
          `Synced ${result.inserted} new transaction${result.inserted === 1 ? '' : 's'}.`,
        );
      } else if (result.scanned > 0) {
        this.toast.info(`Scanned ${result.scanned} emails — no new expenses.`);
      } else {
        this.toast.info('Inbox is up to date.');
      }
      await Promise.all([this.tx.load(), this.history.load()]);
      this.synced.emit();
    } catch (e) {
      if (e instanceof SyncError && e.code === 'GMAIL_RECONNECT_REQUIRED') {
        this.toast.info('Your Gmail connection expired. Reconnecting…');
        await this.reconnect();
        return;
      }
      this.toast.error(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  async reconnect(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not reconnect Gmail');
    }
  }
}
