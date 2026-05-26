import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import {
  Transaction,
  TransactionCategory,
} from '../models/transaction.model';

export interface TransactionFilter {
  search: string;
  category: TransactionCategory | null;
  from: string | null; // ISO YYYY-MM-DD
  to: string | null;
}

export type SortKey = 'transaction_date' | 'amount' | 'merchant' | 'category';
export type SortDir = 'asc' | 'desc';

const DEFAULT_FILTER: TransactionFilter = {
  search: '',
  category: null,
  from: null,
  to: null,
};

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _all = signal<Transaction[]>([]);
  readonly all = this._all.asReadonly();

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _filter = signal<TransactionFilter>(DEFAULT_FILTER);
  readonly filter = this._filter.asReadonly();

  private readonly _sortKey = signal<SortKey>('transaction_date');
  readonly sortKey = this._sortKey.asReadonly();

  private readonly _sortDir = signal<SortDir>('desc');
  readonly sortDir = this._sortDir.asReadonly();

  /** Filtered + sorted view. */
  readonly filtered = computed(() => {
    const f = this._filter();
    const search = f.search.trim().toLowerCase();
    const items = this._all().filter((t) => {
      if (search) {
        const hay = `${t.merchant ?? ''} ${t.category} ${t.source_subject ?? ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (f.category && t.category !== f.category) return false;
      if (f.from && t.transaction_date < f.from) return false;
      if (f.to && t.transaction_date > f.to) return false;
      return true;
    });

    const key = this._sortKey();
    const dir = this._sortDir() === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  });

  /** Sum of the current month's expenses (across the unfiltered list). */
  readonly monthlyTotal = computed(() => {
    const now = new Date();
    const ymPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this._all()
      .filter((t) => t.transaction_date.startsWith(ymPrefix))
      .reduce((sum, t) => sum + Number(t.amount), 0);
  });

  /** Category breakdown for the current month, sorted descending by amount. */
  readonly monthlyByCategory = computed(() => {
    const now = new Date();
    const ymPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const buckets = new Map<TransactionCategory, number>();
    for (const t of this._all()) {
      if (!t.transaction_date.startsWith(ymPrefix)) continue;
      buckets.set(t.category, (buckets.get(t.category) ?? 0) + Number(t.amount));
    }
    return [...buckets.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  readonly recent = computed(() =>
    [...this._all()]
      .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
      .slice(0, 10),
  );

  readonly count = computed(() => this._all().length);

  /** Primary currency in the user's data (for headline totals). */
  readonly primaryCurrency = computed(() => {
    const counts = new Map<string, number>();
    for (const t of this._all()) {
      counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
    }
    let best = 'USD';
    let bestN = 0;
    for (const [cur, n] of counts) {
      if (n > bestN) {
        best = cur;
        bestN = n;
      }
    }
    return best;
  });

  async load(): Promise<void> {
    const session = this.auth.session();
    if (!session) {
      this._all.set([]);
      return;
    }
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      this._all.set((data ?? []) as Transaction[]);
    } finally {
      this._loading.set(false);
    }
  }

  setFilter(patch: Partial<TransactionFilter>): void {
    this._filter.update((curr) => ({ ...curr, ...patch }));
  }

  resetFilter(): void {
    this._filter.set(DEFAULT_FILTER);
  }

  setSort(key: SortKey): void {
    if (this._sortKey() === key) {
      this._sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this._sortKey.set(key);
      this._sortDir.set(key === 'transaction_date' || key === 'amount' ? 'desc' : 'asc');
    }
  }
}
