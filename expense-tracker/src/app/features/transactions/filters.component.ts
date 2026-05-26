import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TransactionsService } from '../../services/transactions.service';
import {
  TRANSACTION_CATEGORIES,
  TransactionCategory,
} from '../../models/transaction.model';
import { ChipComponent } from '../../shared/ui/chip.component';

@Component({
  selector: 'app-transactions-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ChipComponent],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <input
          type="search"
          [ngModel]="tx.filter().search"
          (ngModelChange)="onSearch($event)"
          placeholder="Search merchant, category, subject…"
          class="flex-1 min-w-[12rem] rounded-xl border-zinc-200 bg-white focus:ring-zinc-900 focus:border-zinc-900 text-sm shadow-card"
        />
        <input
          type="date"
          [ngModel]="tx.filter().from"
          (ngModelChange)="onFrom($event)"
          class="rounded-xl border-zinc-200 bg-white focus:ring-zinc-900 focus:border-zinc-900 text-sm shadow-card"
        />
        <input
          type="date"
          [ngModel]="tx.filter().to"
          (ngModelChange)="onTo($event)"
          class="rounded-xl border-zinc-200 bg-white focus:ring-zinc-900 focus:border-zinc-900 text-sm shadow-card"
        />
        @if (hasFilter()) {
          <button
            type="button"
            (click)="tx.resetFilter()"
            class="text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-ring rounded px-2 py-1"
          >
            Clear
          </button>
        }
      </div>

      <div class="flex flex-wrap gap-2">
        <app-chip [active]="tx.filter().category === null" (toggle)="setCategory(null)">
          All
        </app-chip>
        @for (cat of categories; track cat) {
          <app-chip [active]="tx.filter().category === cat" (toggle)="setCategory(cat)">
            {{ cat }}
          </app-chip>
        }
      </div>
    </div>
  `,
})
export class TransactionsFiltersComponent {
  readonly tx = inject(TransactionsService);
  readonly categories = TRANSACTION_CATEGORIES;

  onSearch(value: string): void {
    this.tx.setFilter({ search: value });
  }

  onFrom(value: string): void {
    this.tx.setFilter({ from: value || null });
  }

  onTo(value: string): void {
    this.tx.setFilter({ to: value || null });
  }

  setCategory(cat: TransactionCategory | null): void {
    this.tx.setFilter({ category: cat });
  }

  hasFilter(): boolean {
    const f = this.tx.filter();
    return !!(f.search || f.category || f.from || f.to);
  }
}
