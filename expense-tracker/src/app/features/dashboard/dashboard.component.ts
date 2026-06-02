import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TransactionsService } from '../../services/transactions.service';
import { UploadHistoryService } from '../../services/upload-history.service';
import { GmailSubjectsService } from '../../services/gmail-subjects.service';
import { AuthService } from '../../services/auth.service';
import { MonthlyTotalComponent } from './widgets/monthly-total.component';
import { CategoryBreakdownComponent } from './widgets/category-breakdown.component';
import { RecentTransactionsComponent } from './widgets/recent-transactions.component';
import { InsightsCardComponent } from './widgets/insights-card.component';
import { UploadZoneComponent } from './upload-zone.component';
import { SyncGmailButtonComponent } from './sync-gmail-button.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MonthlyTotalComponent,
    CategoryBreakdownComponent,
    RecentTransactionsComponent,
    InsightsCardComponent,
    UploadZoneComponent,
    SyncGmailButtonComponent,
    RelativeTimePipe,
  ],
  template: `
    <div class="space-y-6">
      <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Welcome back{{ greetingName() }}
          </h1>
          <p class="mt-1 text-sm text-zinc-500">
            Upload a statement or sync from Gmail to pull in transactions.
          </p>
        </div>
        <app-sync-gmail-button />
      </header>

      <app-upload-zone />

      @if (history.lastRun(); as last) {
        <p class="text-xs text-zinc-500 text-center">
          Last upload {{ last.started_at | relativeTime }} ·
          @if (last.filename) { {{ last.filename }} · }
          {{ last.inserted }} new / {{ last.scanned }} scanned
        </p>
      }

      <app-insights-card />

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-1">
          <app-monthly-total />
        </div>
        <div class="lg:col-span-2">
          <app-category-breakdown />
        </div>
      </div>

      <app-recent-transactions />
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly tx = inject(TransactionsService);
  readonly history = inject(UploadHistoryService);
  private readonly subjects = inject(GmailSubjectsService);
  private readonly auth = inject(AuthService);

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.tx.load(),
      this.history.load(),
      this.subjects.load(),
    ]);
  }

  greetingName(): string {
    const name = this.auth.userName();
    if (!name) return '';
    const first = name.split(/\s+/)[0];
    return first ? `, ${first}` : '';
  }
}
