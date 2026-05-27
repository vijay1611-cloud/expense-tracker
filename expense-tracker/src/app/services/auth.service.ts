import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

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
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this._session.set(session ?? null);
    });
  }

  /** Resolves once the initial session has been loaded from storage. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  private async bootstrap(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this._session.set(data.session);
  }

  async signInWithGoogle(): Promise<void> {
    // Only basic profile scopes — no Gmail access. This means the app doesn't
    // need Google's OAuth verification process and anyone can sign in.
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
  }
}
