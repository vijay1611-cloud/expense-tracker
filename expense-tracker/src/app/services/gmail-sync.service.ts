import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { SyncError, SyncResult } from '../models/sync-result.model';

@Injectable({ providedIn: 'root' })
export class GmailSyncService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _syncing = signal(false);
  readonly syncing = this._syncing.asReadonly();

  async sync(): Promise<SyncResult> {
    if (this._syncing()) {
      throw new SyncError('UNKNOWN', 'A sync is already in progress.');
    }
    const token = this.auth.getGmailToken();
    if (!token) {
      throw new SyncError(
        'GMAIL_RECONNECT_REQUIRED',
        'Your Gmail connection has expired. Reconnect to continue.',
      );
    }

    this._syncing.set(true);
    try {
      const { data, error } = await this.supabase.client.functions.invoke<SyncResult>(
        'sync-gmail',
        { body: { providerToken: token } },
      );

      if (error) {
        // Supabase wraps non-2xx responses in FunctionsHttpError.
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json() as { error?: string; code?: string };
            if (body.code === 'GMAIL_RECONNECT_REQUIRED') {
              throw new SyncError('GMAIL_RECONNECT_REQUIRED', body.error ?? 'Reconnect Gmail');
            }
            throw new SyncError('UNKNOWN', body.error ?? error.message);
          } catch (parseErr) {
            if (parseErr instanceof SyncError) throw parseErr;
          }
        }
        throw new SyncError('UNKNOWN', error.message);
      }

      if (!data) {
        throw new SyncError('UNKNOWN', 'Empty response from sync function.');
      }
      return data;
    } finally {
      this._syncing.set(false);
    }
  }
}
