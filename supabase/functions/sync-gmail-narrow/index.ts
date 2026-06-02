// Edge Function: sync-gmail-narrow
//
// Reads the user's enabled subject patterns from gmail_subjects. For each
// pattern, queries Gmail for `subject:"<pattern>"` (exact phrase) in the last
// 90 days. For each matched email, calls Gemini to extract one transaction.
//
// Inserts into transactions with source_email = `gmail:<gmail_message_id>` so
// it doesn't collide with PDF-derived rows (which use SHA-256 hash there).
//
// Endpoint: POST /functions/v1/sync-gmail-narrow
// Headers:  Authorization: Bearer <user_jwt>
// Body:     { providerToken: <google_access_token> }
// Returns:  { inserted, scanned, errors }

import { createClient } from 'supabase';
import { decode, gmailGet, gmailList } from './gmail.ts';
import { geminiExtract } from './gemini.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const MAX_EMAILS_PER_PATTERN = 5;
const MAX_TOTAL_EMAILS = 15;             // total cap across all patterns
const GEMINI_DELAY_MS = 7000;
const SEARCH_WINDOW = 'newer_than:90d';

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // ---- Auth ----
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing Authorization header' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  // ---- Body ----
  let providerToken: string | undefined;
  try {
    const body = await req.json() as { providerToken?: string };
    providerToken = body.providerToken;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!providerToken) return json({ error: 'Missing providerToken' }, 400);

  // ---- Load user's enabled subject patterns ----
  const { data: patterns, error: patErr } = await userClient
    .from('gmail_subjects')
    .select('pattern')
    .eq('enabled', true);
  if (patErr) return json({ error: `Read patterns failed: ${patErr.message}` }, 500);
  if (!patterns || patterns.length === 0) {
    return json({ inserted: 0, scanned: 0, errors: ['No enabled subject patterns. Add one in Settings first.'] });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Collect candidate message ids across all patterns ----
  const seenIds = new Set<string>();
  const candidates: string[] = [];
  for (const { pattern } of patterns as { pattern: string }[]) {
    if (candidates.length >= MAX_TOTAL_EMAILS) break;
    const escaped = pattern.replace(/"/g, '\\"');
    const query = `${SEARCH_WINDOW} subject:"${escaped}"`;
    const list = await gmailList(providerToken, query, MAX_EMAILS_PER_PATTERN);
    if (!list.ok) {
      if (list.status === 401 || list.status === 403) {
        return json({ error: 'Gmail token expired or insufficient scope', code: 'GMAIL_RECONNECT_REQUIRED' }, 401);
      }
      continue;
    }
    for (const id of list.ids) {
      if (!seenIds.has(id) && candidates.length < MAX_TOTAL_EMAILS) {
        seenIds.add(id);
        candidates.push(id);
      }
    }
  }
  if (candidates.length === 0) {
    return json({ inserted: 0, scanned: 0, errors: [] });
  }

  // ---- Skip already-synced messages ----
  const sourceKeys = candidates.map((id) => `gmail:${id}`);
  const { data: existing, error: existingErr } = await admin
    .from('transactions')
    .select('source_email')
    .eq('user_id', userId)
    .in('source_email', sourceKeys);
  if (existingErr) return json({ error: `DB dedup failed: ${existingErr.message}` }, 500);
  const seen = new Set((existing ?? []).map((r) => r.source_email as string));
  const fresh = candidates.filter((id) => !seen.has(`gmail:${id}`));

  // ---- For each fresh message: fetch, decode, Gemini extract ----
  type Row = {
    user_id: string;
    merchant: string | null;
    amount: number;
    currency: string;
    transaction_date: string;
    category: string;
    is_subscription: boolean;
    source_email: string;
    source_subject: string;
  };
  const rows: Row[] = [];
  const errors: string[] = [];
  let scanned = 0;

  for (const id of fresh) {
    scanned++;
    try {
      const msg = await gmailGet(providerToken, id);
      const decoded = decode(msg);
      const ext = await geminiExtract(decoded.subject, decoded.body, GEMINI_API_KEY);
      if (ext.is_expense && ext.amount !== null && ext.transaction_date !== null) {
        rows.push({
          user_id: userId,
          merchant: ext.merchant,
          amount: ext.amount,
          currency: ext.currency ?? 'INR',
          transaction_date: ext.transaction_date,
          category: ext.category,
          is_subscription: ext.is_subscription,
          source_email: `gmail:${id}`,
          source_subject: decoded.subject.slice(0, 500),
        });
      }
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (scanned < fresh.length) await sleep(GEMINI_DELAY_MS);
  }

  // ---- Insert ----
  let inserted = 0;
  if (rows.length > 0) {
    const { error: insertErr, count } = await admin
      .from('transactions')
      .upsert(rows, {
        onConflict: 'user_id,source_email',
        ignoreDuplicates: true,
        count: 'exact',
      });
    if (insertErr) {
      return json({ error: `Insert failed: ${insertErr.message}`, scanned, errors }, 500);
    }
    inserted = count ?? rows.length;
  }

  return json({ inserted, scanned, errors });
});
