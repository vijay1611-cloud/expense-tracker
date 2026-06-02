import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TransactionsService } from '../../../services/transactions.service';
import { CardComponent } from '../../../shared/ui/card.component';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { CategoryIconComponent } from '../../../shared/ui/category-icon.component';
import { CATEGORY_STYLES } from '../../../shared/category';
import { TransactionCategory } from '../../../models/transaction.model';

@Component({
  selector: 'app-category-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, CurrencyFormatPipe, EmptyStateComponent, CategoryIconComponent],
  template: `
    <app-card>
      <div class="flex items-baseline justify-between mb-4">
        <h2 class="text-sm font-semibold text-zinc-900">By category</h2>
        <span class="text-xs text-zinc-500">{{ monthLabel }}</span>
      </div>

      @if (rows().length === 0) {
        <app-empty-state title="No spending yet" description="Upload a statement to see categories." />
      } @else {
        <ul class="space-y-4">
          @for (row of rows(); track row.category) {
            <li>
              <div class="flex items-center justify-between text-sm mb-1.5">
                <span class="inline-flex items-center gap-2 font-medium text-zinc-800">
                  <span
                    [class]="
                      'inline-flex h-7 w-7 items-center justify-center rounded-lg ' +
                      iconBg(row.category) +
                      ' ' +
                      iconText(row.category)
                    "
                  >
                    <app-category-icon [category]="row.category" size="0.875rem" />
                  </span>
                  {{ row.category }}
                </span>
                <span class="text-zinc-900 font-semibold">
                  {{ row.amount | currencyFormat: tx.primaryCurrency() }}
                </span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                <div
                  [class]="'h-full rounded-full transition-all ' + barClass(row.category)"
                  [style.width.%]="(row.amount / total()) * 100"
                ></div>
              </div>
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class CategoryBreakdownComponent {
  readonly tx = inject(TransactionsService);
  readonly rows = this.tx.monthlyByCategory;
  readonly total = computed(() => this.tx.monthlyTotal() || 1);
  readonly monthLabel = new Date().toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  iconBg(c: TransactionCategory): string {
    return CATEGORY_STYLES[c].iconBgClass;
  }

  iconText(c: TransactionCategory): string {
    return CATEGORY_STYLES[c].iconTextClass;
  }

  barClass(c: TransactionCategory): string {
    return CATEGORY_STYLES[c].barClass;
  }
}
