import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { GmailSubject } from '../models/gmail-subject.model';

@Injectable({ providedIn: 'root' })
export class GmailSubjectsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<GmailSubject[]>([]);
  readonly items = this._items.asReadonly();

  async load(): Promise<void> {
    if (!this.auth.session()) {
      this._items.set([]);
      return;
    }
    const { data, error } = await this.supabase.client
      .from('gmail_subjects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    this._items.set((data ?? []) as GmailSubject[]);
  }

  async add(pattern: string): Promise<void> {
    const trimmed = pattern.trim();
    if (!trimmed) throw new Error('Pattern cannot be empty');
    if (trimmed.length > 200) throw new Error('Pattern too long (max 200 chars)');
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not signed in');
    const { error } = await this.supabase.client
      .from('gmail_subjects')
      .insert({ user_id: userId, pattern: trimmed, enabled: true });
    if (error) {
      if (error.code === '23505') throw new Error('That pattern is already saved.');
      throw error;
    }
    await this.load();
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('gmail_subjects')
      .update({ enabled })
      .eq('id', id);
    if (error) throw error;
    await this.load();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('gmail_subjects')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await this.load();
  }
}
