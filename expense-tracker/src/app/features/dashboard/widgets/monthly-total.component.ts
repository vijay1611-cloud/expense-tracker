import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TransactionsService } from '../../../services/transactions.service';
import { CardComponent } from '../../../shared/ui/card.component';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';

@Component({
  selector: 'app-monthly-total',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, CurrencyFormatPipe, SkeletonComponent],
  template: `
    <app-card>
      <p class="text-sm font-medium text-zinc-500">This month</p>
      @if (tx.loading() && tx.count() === 0) {
        <div class="mt-3">
          <app-skeleton height="2.25rem" width="50%" />
        </div>
      } @else {
        <p class="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
          {{ tx.monthlyTotal() | currencyFormat: tx.primaryCurrency() }}
        </p>
        <p class="mt-1 text-xs text-zinc-500">
          {{ monthLabel }} · {{ tx.monthlyByCategory().length }} categories
        </p>
      }
    </app-card>
  `,
})
export class MonthlyTotalComponent {
  readonly tx = inject(TransactionsService);
  readonly monthLabel = new Date().toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
