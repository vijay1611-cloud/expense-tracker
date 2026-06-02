import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TransactionsService } from '../../../services/transactions.service';
import { CardComponent } from '../../../shared/ui/card.component';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { CategoryIconComponent } from '../../../shared/ui/category-icon.component';
import { CATEGORY_STYLES } from '../../../shared/category';
import { TransactionCategory } from '../../../models/transaction.model';

@Component({
  selector: 'app-recent-transactions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardComponent,
    CurrencyFormatPipe,
    EmptyStateComponent,
    RouterLink,
    CategoryIconComponent,
  ],
  template: `
    <app-card>
      <div class="flex items-baseline justify-between mb-4">
        <h2 class="text-sm font-semibold text-zinc-900">Recent transactions</h2>
        <a
          routerLink="/transactions"
          class="text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-ring rounded"
          >View all →</a
        >
      </div>

      @if (tx.recent().length === 0) {
        <app-empty-state
          title="Nothing yet"
          description="Upload a statement to populate transactions."
        />
      } @else {
        <ul class="divide-y divide-zinc-100">
          @for (t of tx.recent(); track t.id) {
            <li class="py-3 flex items-center gap-3">
              <span
                [class]="
                  'inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ' +
                  iconBg(t.category) +
                  ' ' +
                  iconText(t.category)
                "
              >
                <app-category-icon [category]="t.category" size="1rem" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-zinc-900 truncate">
                  {{ t.merchant || 'Unknown merchant' }}
                </p>
                <p class="text-xs text-zinc-500">
                  {{ t.transaction_date }} · {{ t.category }}
                  @if (t.is_subscription) {
                    · <span class="text-emerald-700">subscription</span>
                  }
                </p>
              </div>
              <span class="text-sm font-semibold text-zinc-900 whitespace-nowrap">
                {{ t.amount | currencyFormat: t.currency }}
              </span>
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class RecentTransactionsComponent {
  readonly tx = inject(TransactionsService);

  iconBg(c: TransactionCategory): string {
    return CATEGORY_STYLES[c].iconBgClass;
  }

  iconText(c: TransactionCategory): string {
    return CATEGORY_STYLES[c].iconTextClass;
  }
}
