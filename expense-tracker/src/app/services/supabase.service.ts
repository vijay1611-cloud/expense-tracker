import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = getSupabaseClient();
}
