import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface InsightResponse {
  insight: string;
  stats: {
    thisMonthLabel: string;
    thisMonthTotal: number;
    lastMonthTotal: number;
    pctChange: number | null;
    topCategoriesThisMonth: { category: string; amount: number; share: number }[];
    subscriptionTotalThisMonth: number;
    transactionCountThisMonth: number;
    currency: string;
  };
}

@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly supabase = inject(SupabaseService);

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _insight = signal<InsightResponse | null>(null);
  readonly insight = this._insight.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  async load(): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._error.set(null);
    try {
      const { data, error } = await this.supabase.client.functions.invoke<InsightResponse>(
        'generate-insight',
        { body: {} },
      );
      if (error) throw error;
      if (data) this._insight.set(data);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Could not load insight');
    } finally {
      this._loading.set(false);
    }
  }

  reset(): void {
    this._insight.set(null);
    this._error.set(null);
  }
}
