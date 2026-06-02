import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GmailSyncService, GmailSyncError } from '../../services/gmail-sync.service';
import { AuthService } from '../../services/auth.service';
import { GmailSubjectsService } from '../../services/gmail-subjects.service';
import { TransactionsService } from '../../services/transactions.service';
import { UploadHistoryService } from '../../services/upload-history.service';
import { ToastService } from '../../services/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';

@Component({
  selector: 'app-sync-gmail-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, RouterLink],
  template: `
    @if (subjects.items().length === 0) {
      <a routerLink="/settings" class="text-xs text-zinc-500 hover:text-zinc-900 underline decoration-dotted">
        Set up Gmail patterns to enable sync
      </a>
    } @else if (!auth.isGmailConnected()) {
      <app-button variant="secondary" size="sm" (click)="connect()">Connect Gmail</app-button>
    } @else {
      <app-button variant="secondary" size="sm" [loading]="sync.syncing()" (click)="run()">
        @if (sync.syncing()) {
          Syncing…
        } @else {
          Sync Gmail
        }
      </app-button>
    }
  `,
})
export class SyncGmailButtonComponent {
  readonly sync = inject(GmailSyncService);
  readonly auth = inject(AuthService);
  readonly subjects = inject(GmailSubjectsService);
  private readonly tx = inject(TransactionsService);
  private readonly history = inject(UploadHistoryService);
  private readonly toast = inject(ToastService);

  async run(): Promise<void> {
    try {
      const result = await this.sync.sync();
      if (result.inserted > 0) {
        this.toast.success(
          `Synced ${result.inserted} new transaction${result.inserted === 1 ? '' : 's'} from Gmail.`,
        );
      } else if (result.scanned > 0) {
        this.toast.info(`Scanned ${result.scanned} email${result.scanned === 1 ? '' : 's'} — nothing new to import.`);
      } else if (result.errors[0]) {
        this.toast.info(result.errors[0]);
      } else {
        this.toast.info('Gmail is up to date.');
      }
      await Promise.all([this.tx.load(), this.history.load()]);
    } catch (e) {
      if (e instanceof GmailSyncError && e.code === 'GMAIL_RECONNECT_REQUIRED') {
        this.toast.info('Gmail connection expired. Reconnecting…');
        await this.connect();
        return;
      }
      this.toast.error(e instanceof Error ? e.message : 'Gmail sync failed');
    }
  }

  async connect(): Promise<void> {
    try {
      await this.auth.connectGmail();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not connect Gmail');
    }
  }
}
