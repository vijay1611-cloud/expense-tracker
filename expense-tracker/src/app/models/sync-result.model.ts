export interface SyncResult {
  inserted: number;
  scanned: number;
  errors: string[];
}

export type SyncErrorCode =
  | 'GMAIL_RECONNECT_REQUIRED'
  | 'UNAUTHORIZED'
  | 'NETWORK'
  | 'UNKNOWN';

export class SyncError extends Error {
  constructor(public readonly code: SyncErrorCode, message: string) {
    super(message);
    this.name = 'SyncError';
  }
}
