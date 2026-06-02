// Edge Function: upload-statement
//
// The client-side parses the PDF, runs the rules engine, and POSTs the
// already-structured transactions to us. This function's job is purely:
//   1. Verify the user's JWT
//   2. Validate the payload shape
//   3. Dedup against existing rows by file hash
//   4. Insert the rows (RLS-bypass via service role, scoped to verified user)
//   5. Log an upload_run audit row
//
// AI is no longer involved in this path — it is reserved for the
// generate-insight function instead.
//
// Endpoint: POST /functions/v1/upload-statement
// Headers:  Authorization: Bearer <user_jwt>
// Body:     {
//             filename: string,
//             fileSize: number,
//             fileHash: string (64-char SHA-256 hex),
//             transactions: StructuredTransaction[]
//           }

import { createClient } from 'supabase';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VALID_CATEGORIES = new Set([
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Travel',
  'Health',
  'Subscriptions',
  'Other',
]);

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

interface IncomingTransaction {
  merchant?: unknown;
  amount?: unknown;
  currency?: unknown;
  transaction_date?: unknown;
  category?: unknown;
  is_subscription?: unknown;
}

interface UploadRequestBody {
  filename?: string;
  fileSize?: number;
  fileHash?: string;
  transactions?: IncomingTransaction[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  const startedAt = new Date();

  // ---- Auth ----
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const userId = userData.user.id;

  // ---- Validate body ----
  let body: UploadRequestBody;
  try {
    body = await req.json() as UploadRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const filename = typeof body.filename === 'string' ? body.filename.slice(0, 255).trim() : '';
  const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;
  const fileHash = typeof body.fileHash === 'string' ? body.fileHash : '';
  const incoming = Array.isArray(body.transactions) ? body.transactions : [];

  if (!filename) return json({ error: 'Missing filename' }, 400);
  if (!/^[a-f0-9]{64}$/i.test(fileHash)) {
    return json({ error: 'fileHash must be a 64-character SHA-256 hex string' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Dedup: have we already processed this exact file? ----
  const { data: existing, error: existingErr } = await admin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('source_email', fileHash)
    .limit(1);
  if (existingErr) {
    return json({ error: `DB dedup query failed: ${existingErr.message}` }, 500);
  }
  if (existing && existing.length > 0) {
    await admin.from('upload_runs').insert({
      user_id: userId,
      filename,
      file_size_bytes: fileSize,
      file_hash: fileHash,
      inserted: 0,
      scanned: incoming.length,
      errors_count: 0,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
    });
    return json({
      inserted: 0,
      scanned: incoming.length,
      errors: [],
      alreadyProcessed: true,
    });
  }

  // ---- Validate + shape rows ----
  const errors: string[] = [];
  const rows: Array<{
    user_id: string;
    merchant: string | null;
    amount: number;
    currency: string;
    transaction_date: string;
    category: string;
    is_subscription: boolean;
    source_email: string;
    source_subject: string;
  }> = [];

  incoming.forEach((t, idx) => {
    const merchant = typeof t.merchant === 'string' ? t.merchant.trim().slice(0, 200) : '';
    const amount = typeof t.amount === 'number' && Number.isFinite(t.amount) && t.amount > 0
      ? t.amount
      : null;
    const currency = typeof t.currency === 'string' && /^[A-Z]{3}$/.test(t.currency)
      ? t.currency
      : 'INR';
    const transaction_date = typeof t.transaction_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.transaction_date)
      ? t.transaction_date
      : null;
    const category = typeof t.category === 'string' && VALID_CATEGORIES.has(t.category)
      ? t.category
      : 'Other';
    const is_subscription = t.is_subscription === true;

    if (!merchant || amount === null || !transaction_date) {
      errors.push(`Row ${idx}: missing merchant/amount/date`);
      return;
    }

    rows.push({
      user_id: userId,
      merchant,
      amount,
      currency,
      transaction_date,
      category,
      is_subscription,
      source_email: idx === 0 ? fileHash : `${fileHash}:row:${idx}`,
      source_subject: filename.slice(0, 500),
    });
  });

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
      return json(
        { error: `Insert failed: ${insertErr.message}`, scanned: incoming.length, errors },
        500,
      );
    }
    inserted = count ?? rows.length;
  }

  // ---- Audit row (best-effort) ----
  let uploadRunId: string | null = null;
  try {
    const { data: runRow } = await admin
      .from('upload_runs')
      .insert({
        user_id: userId,
        filename,
        file_size_bytes: fileSize,
        file_hash: fileHash,
        inserted,
        scanned: incoming.length,
        errors_count: errors.length,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    uploadRunId = runRow?.id ?? null;
  } catch (e) {
    console.error('Failed to record upload_run:', e);
  }

  return json({
    inserted,
    scanned: incoming.length,
    errors,
    uploadRunId,
  });
});
