import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { SyncRun } from '../models/sync-run.model';

@Injectable({ providedIn: 'root' })
export class SyncHistoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _runs = signal<SyncRun[]>([]);
  readonly runs = this._runs.asReadonly();

  readonly lastRun = computed<SyncRun | null>(() => this._runs()[0] ?? null);

  async load(): Promise<void> {
    if (!this.auth.session()) {
      this._runs.set([]);
      return;
    }
    const { data, error } = await this.supabase.client
      .from('sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    this._runs.set((data ?? []) as SyncRun[]);
  }
}
