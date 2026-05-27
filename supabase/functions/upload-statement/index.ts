// Edge Function: upload-statement
// POST /functions/v1/upload-statement
// Headers: Authorization: Bearer <user_jwt>
// Body (JSON): { filename: string, fileBase64: string, fileHash: string }
//
// fileBase64 is standard base64 (not url-safe) of the PDF bytes.
// fileHash is SHA-256 hex of the raw bytes, used for dedup.
//
// Returns: { inserted, scanned, errors, uploadRunId }

import { createClient } from 'supabase';
import { geminiExtractFromPdf } from './gemini.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

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

interface UploadRequestBody {
  filename?: string;
  fileBase64?: string;
  fileHash?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  const startedAt = new Date();

  // ---- Auth: verify user JWT ----
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

  // ---- Parse + validate body ----
  let body: UploadRequestBody;
  try {
    body = await req.json() as UploadRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const filename = (body.filename ?? '').slice(0, 255).trim();
  const fileBase64 = body.fileBase64 ?? '';
  const fileHash = body.fileHash ?? '';

  if (!filename || !fileBase64 || !fileHash) {
    return json({ error: 'Missing filename, fileBase64, or fileHash' }, 400);
  }
  if (!/\.pdf$/i.test(filename)) {
    return json({ error: 'Only PDF files are supported' }, 400);
  }
  if (!/^[a-f0-9]{64}$/i.test(fileHash)) {
    return json({ error: 'fileHash must be a 64-character SHA-256 hex string' }, 400);
  }

  // Decode to validate size + verify it's a real PDF
  let bytes: Uint8Array;
  try {
    const bin = atob(fileBase64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: 'fileBase64 is not valid base64' }, 400);
  }
  if (bytes.length === 0) {
    return json({ error: 'Empty file' }, 400);
  }
  if (bytes.length > MAX_PDF_BYTES) {
    return json({
      error: `File is ${(bytes.length / 1024 / 1024).toFixed(1)}MB, exceeds ${MAX_PDF_BYTES / 1024 / 1024}MB cap`,
    }, 413);
  }
  const isPdf = bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (!isPdf) {
    return json({ error: 'File is not a valid PDF (missing %PDF- header)' }, 400);
  }

  // ---- Admin client for RLS-bypass inserts ----
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Dedup: have we already processed this exact file for this user? ----
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
    // Already processed. Still record the upload attempt for transparency.
    await admin.from('upload_runs').insert({
      user_id: userId,
      filename,
      file_size_bytes: bytes.length,
      file_hash: fileHash,
      inserted: 0,
      scanned: 0,
      errors_count: 0,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
    });
    return json({
      inserted: 0,
      scanned: 0,
      errors: [],
      alreadyProcessed: true,
    });
  }

  // ---- Extract via Gemini ----
  const extractions = await geminiExtractFromPdf(fileBase64, GEMINI_API_KEY);

  // ---- Filter to real expenses + build rows ----
  const rows = extractions
    .filter((e) => e.is_expense && e.amount !== null && e.transaction_date !== null)
    .map((e, idx) => ({
      user_id: userId,
      merchant: e.merchant,
      amount: e.amount as number,
      currency: e.currency ?? 'INR',
      transaction_date: e.transaction_date as string,
      category: e.category,
      is_subscription: e.is_subscription,
      // First row uses bare hash; subsequent rows get :row:N suffix
      source_email: idx === 0 ? fileHash : `${fileHash}:row:${idx}`,
      source_subject: filename.slice(0, 500),
    }));

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
        { error: `Insert failed: ${insertErr.message}`, scanned: extractions.length, errors: [] },
        500,
      );
    }
    inserted = count ?? rows.length;
  }

  // ---- Record the upload run (best-effort) ----
  let uploadRunId: string | null = null;
  try {
    const { data: runRow } = await admin
      .from('upload_runs')
      .insert({
        user_id: userId,
        filename,
        file_size_bytes: bytes.length,
        file_hash: fileHash,
        inserted,
        scanned: extractions.length,
        errors_count: 0,
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
    scanned: extractions.length,
    errors: [],
    uploadRunId,
  });
});
