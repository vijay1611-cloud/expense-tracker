import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

const GMAIL_TOKEN_KEY = 'gmail_provider_token';
const GMAIL_TOKEN_EXP_KEY = 'gmail_provider_token_exp';
// Google access tokens last ~1 hour; we expire ours slightly early to be safe.
const TOKEN_TTL_MS = 55 * 60 * 1000;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();

  readonly userEmail = computed(() => this._session()?.user.email ?? null);
  readonly userName = computed(
    () =>
      (this._session()?.user.user_metadata?.['full_name'] as string | undefined) ??
        this.userEmail() ??
        null,
  );
  readonly avatarUrl = computed(
    () =>
      (this._session()?.user.user_metadata?.['avatar_url'] as string | undefined) ?? null,
  );

  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.bootstrap();
    this.supabase.client.auth.onAuthStateChange((event, session) => {
      this._session.set(session ?? null);
      // provider_token is only populated on the SIGNED_IN event after OAuth.
      if (event === 'SIGNED_IN' && session?.provider_token) {
        this.persistGmailToken(session.provider_token);
      }
      if (event === 'SIGNED_OUT') {
        this.clearGmailToken();
      }
    });
  }

  /** Resolves once the initial session has been loaded from storage. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  private async bootstrap(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this._session.set(data.session);
    // If we already have a session but no stored token (e.g. refresh after first login),
    // and the session itself carries provider_token, capture it.
    if (data.session?.provider_token) {
      this.persistGmailToken(data.session.provider_token);
    }
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: GMAIL_SCOPE,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    this.clearGmailToken();
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
  }

  /** Returns the Gmail access token if still within its TTL, otherwise null. */
  getGmailToken(): string | null {
    if (typeof window === 'undefined') return null;
    const token = sessionStorage.getItem(GMAIL_TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(GMAIL_TOKEN_EXP_KEY) ?? 0);
    if (!token || !exp || Date.now() > exp) return null;
    return token;
  }

  isGmailConnected(): boolean {
    return this.getGmailToken() !== null;
  }

  private persistGmailToken(token: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(GMAIL_TOKEN_KEY, token);
    sessionStorage.setItem(GMAIL_TOKEN_EXP_KEY, String(Date.now() + TOKEN_TTL_MS));
  }

  private clearGmailToken(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(GMAIL_TOKEN_KEY);
    sessionStorage.removeItem(GMAIL_TOKEN_EXP_KEY);
  }
}
