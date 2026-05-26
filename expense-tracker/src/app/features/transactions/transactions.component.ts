import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TransactionsService, SortKey } from '../../services/transactions.service';
import { CardComponent } from '../../shared/ui/card.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { CategoryBadgeComponent } from '../../shared/ui/category-badge.component';
import { TransactionsFiltersComponent } from './filters.component';
import { SyncButtonComponent } from '../dashboard/sync-button.component';

@Component({
  selector: 'app-transactions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardComponent,
    CurrencyFormatPipe,
    EmptyStateComponent,
    SkeletonComponent,
    CategoryBadgeComponent,
    TransactionsFiltersComponent,
    SyncButtonComponent,
  ],
  template: `
    <div class="space-y-6">
      <header class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">Transactions</h1>
          <p class="mt-1 text-sm text-zinc-500">
            {{ tx.filtered().length }} of {{ tx.count() }} shown
          </p>
        </div>
        <app-sync-button />
      </header>

      <app-card>
        <app-transactions-filters />
      </app-card>

      <app-card [padded]="false">
        @if (tx.loading() && tx.count() === 0) {
          <div class="p-6 space-y-3">
            <app-skeleton height="2rem" />
            <app-skeleton height="2rem" />
            <app-skeleton height="2rem" />
          </div>
        } @else if (tx.filtered().length === 0) {
          <app-empty-state
            title="No matching transactions"
            description="Try a different filter, or sync your Gmail to import more."
          />
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-zinc-100 text-sm">
              <thead class="bg-stone-50 text-zinc-500 text-xs uppercase tracking-wide">
                <tr>
                  @for (col of columns; track col.key) {
                    <th
                      [class]="col.align === 'right' ? 'px-6 py-3 text-right' : 'px-6 py-3 text-left'"
                    >
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-medium hover:text-zinc-900 focus-ring rounded"
                        (click)="sort(col.key)"
                      >
                        {{ col.label }}
                        <span class="text-zinc-400">{{ arrow(col.key) }}</span>
                      </button>
                    </th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 bg-white">
                @for (t of tx.filtered(); track t.id) {
                  <tr class="hover:bg-stone-50/60 transition-colors">
                    <td class="px-6 py-3 text-zinc-700 whitespace-nowrap">{{ t.transaction_date }}</td>
                    <td class="px-6 py-3">
                      <div class="font-medium text-zinc-900">{{ t.merchant || '—' }}</div>
                      @if (t.source_subject) {
                        <div class="text-xs text-zinc-500 truncate max-w-xs">{{ t.source_subject }}</div>
                      }
                    </td>
                    <td class="px-6 py-3">
                      <app-category-badge [category]="t.category" />
                      @if (t.is_subscription) {
                        <span
                          class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"
                        >
                          subscription
                        </span>
                      }
                    </td>
                    <td class="px-6 py-3 text-right font-semibold text-zinc-900 whitespace-nowrap">
                      {{ t.amount | currencyFormat: t.currency }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-card>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  readonly tx = inject(TransactionsService);

  readonly columns: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'transaction_date', label: 'Date', align: 'left' },
    { key: 'merchant', label: 'Merchant', align: 'left' },
    { key: 'category', label: 'Category', align: 'left' },
    { key: 'amount', label: 'Amount', align: 'right' },
  ];

  async ngOnInit(): Promise<void> {
    await this.tx.load();
  }

  sort(key: SortKey): void {
    this.tx.setSort(key);
  }

  arrow(key: SortKey): string {
    if (this.tx.sortKey() !== key) return '';
    return this.tx.sortDir() === 'asc' ? '↑' : '↓';
  }
}
