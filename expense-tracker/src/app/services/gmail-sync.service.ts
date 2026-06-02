import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface GmailSyncResult {
  inserted: number;
  scanned: number;
  errors: string[];
}

export type GmailSyncErrorCode = 'GMAIL_RECONNECT_REQUIRED' | 'NO_PATTERNS' | 'UNKNOWN';

export class GmailSyncError extends Error {
  constructor(public readonly code: GmailSyncErrorCode, message: string) {
    super(message);
    this.name = 'GmailSyncError';
  }
}

@Injectable({ providedIn: 'root' })
export class GmailSyncService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _syncing = signal(false);
  readonly syncing = this._syncing.asReadonly();

  async sync(): Promise<GmailSyncResult> {
    if (this._syncing()) throw new GmailSyncError('UNKNOWN', 'Sync already in progress');
    const token = this.auth.getGmailToken();
    if (!token) {
      throw new GmailSyncError(
        'GMAIL_RECONNECT_REQUIRED',
        'Gmail connection expired. Click Connect Gmail in Settings to reconnect.',
      );
    }

    this._syncing.set(true);
    try {
      const { data, error } = await this.supabase.client.functions.invoke<GmailSyncResult>(
        'sync-gmail-narrow',
        { body: { providerToken: token } },
      );

      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json() as { error?: string; code?: string };
            if (body.code === 'GMAIL_RECONNECT_REQUIRED') {
              throw new GmailSyncError('GMAIL_RECONNECT_REQUIRED', body.error ?? 'Reconnect Gmail');
            }
            throw new GmailSyncError('UNKNOWN', body.error ?? error.message);
          } catch (e) {
            if (e instanceof GmailSyncError) throw e;
          }
        }
        throw new GmailSyncError('UNKNOWN', error.message);
      }
      if (!data) throw new GmailSyncError('UNKNOWN', 'Empty response from sync function');
      return data;
    } finally {
      this._syncing.set(false);
    }
  }
}
