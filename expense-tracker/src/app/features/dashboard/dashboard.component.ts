import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TransactionsService } from '../../services/transactions.service';
import { SyncHistoryService } from '../../services/sync-history.service';
import { AuthService } from '../../services/auth.service';
import { MonthlyTotalComponent } from './widgets/monthly-total.component';
import { CategoryBreakdownComponent } from './widgets/category-breakdown.component';
import { RecentTransactionsComponent } from './widgets/recent-transactions.component';
import { SyncButtonComponent } from './sync-button.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MonthlyTotalComponent,
    CategoryBreakdownComponent,
    RecentTransactionsComponent,
    SyncButtonComponent,
  ],
  template: `
    <div class="space-y-6">
      <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Welcome back{{ greetingName() }}
          </h1>
          <p class="mt-1 text-sm text-zinc-500">
            Here's your spending at a glance. Sync to pull the latest receipts.
          </p>
        </div>
        <app-sync-button />
      </header>

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
  private readonly history = inject(SyncHistoryService);
  private readonly auth = inject(AuthService);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.tx.load(), this.history.load()]);
  }

  greetingName(): string {
    const name = this.auth.userName();
    if (!name) return '';
    const first = name.split(/\s+/)[0];
    return first ? `, ${first}` : '';
  }
}
