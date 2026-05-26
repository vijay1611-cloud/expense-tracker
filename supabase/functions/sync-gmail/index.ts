// Edge Function: sync-gmail
// POST /functions/v1/sync-gmail
// Headers: Authorization: Bearer <user_jwt>
// Body:    { providerToken: <google_access_token> }
//
// Returns: { inserted, scanned, errors }

import { createClient } from 'supabase';
import {
  bytesToBase64,
  decodeMessage,
  gmailGetAttachment,
  gmailGetMessage,
  gmailListMessages,
} from './gmail.ts';
import { geminiExtract, geminiExtractFromPdf } from './gemini.ts';
import { keywordPrefilter } from './filter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const MAX_EMAILS_PER_SYNC = 15;          // 15 * up-to-2 calls * 7s ≈ 140s budget for worst case
const GEMINI_DELAY_MS = 7000;            // ~8.5 RPM, safely under observed free-tier ~20 RPM cap even when both inline+PDF calls fire
const MAX_PDF_BYTES = 5 * 1024 * 1024;   // 5 MB — well under Gemini's 20 MB inlineData cap

// DEBUG ONLY — when set, this Gmail search query REPLACES the default broad
// query, so the function only processes emails matching it. Use the same
// syntax as Gmail's web search box. Bypasses dedup so the same email can be
// re-processed across syncs. Reset to '' when done debugging.
const SEARCH_QUERY_OVERRIDE = '';
// Match either:
//   (a) emails whose SUBJECT contains a transaction keyword, OR
//   (b) emails with a finance-related PDF attachment (filename contains
//       "statement", "invoice", "receipt", "transactions", "summary"). This
//       catches files like `gpay_statement_2026.pdf` where Gmail's subject
//       tokenizer wouldn't match `subject:statement`.
// More targeted than `has:attachment filename:pdf` — skips resumes, contracts,
// and other non-financial PDFs so the 15-message cap isn't wasted.
const GMAIL_QUERY =
  'newer_than:30d (' +
  'subject:receipt OR subject:invoice OR subject:payment OR subject:order OR ' +
  'subject:subscription OR subject:transaction OR subject:debited OR subject:charged OR ' +
  'subject:spent OR subject:purchase OR subject:paid OR subject:successful OR ' +
  'subject:statement OR subject:summary OR ' +
  'subject:"your receipt" OR subject:"order confirmed" OR subject:"payment confirmation" OR ' +
  'filename:statement OR filename:invoice OR filename:receipt OR filename:transactions OR filename:summary' +
  ')';

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

  // ---- Body: provider token ----
  let providerToken: string | undefined;
  try {
    const body = await req.json() as { providerToken?: string };
    providerToken = body.providerToken;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!providerToken) {
    return json({ error: 'Missing providerToken' }, 400);
  }

  // ---- Admin client for RLS-bypass inserts ----
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Gmail: list messages ----
  const effectiveQuery = SEARCH_QUERY_OVERRIDE || GMAIL_QUERY;
  const effectiveMax = SEARCH_QUERY_OVERRIDE ? 5 : MAX_EMAILS_PER_SYNC;

  const list = await gmailListMessages(providerToken, effectiveQuery, effectiveMax);
  if (!list.ok) {
    if (list.status === 401 || list.status === 403) {
      return json({ error: 'Gmail token expired or insufficient scope', code: 'GMAIL_RECONNECT_REQUIRED' }, 401);
    }
    return json({ error: `Gmail list failed: ${list.status}` }, 502);
  }
  if (list.ids.length === 0) {
    return json({ inserted: 0, scanned: 0, errors: [] });
  }

  let fresh: string[];
  if (SEARCH_QUERY_OVERRIDE) {
    // Debug path: bypass dedup so the same email can be re-tested across syncs.
    fresh = list.ids;
  } else {
    const { data: existing, error: existingErr } = await admin
      .from('transactions')
      .select('source_email')
      .eq('user_id', userId)
      .in('source_email', list.ids);
    if (existingErr) {
      return json({ error: `DB dedup query failed: ${existingErr.message}` }, 500);
    }
    const seen = new Set((existing ?? []).map((r) => r.source_email as string));
    fresh = list.ids.filter((id) => !seen.has(id));
  }

  // ---- Process each new message sequentially ----
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

  // Helper: build a row from a successful extraction.
  const toRow = (
    e: { merchant: string | null; amount: number; currency: string | null; transaction_date: string; category: string; is_subscription: boolean },
    sourceEmail: string,
    subject: string,
  ): Row => ({
    user_id: userId,
    merchant: e.merchant,
    amount: e.amount,
    currency: e.currency ?? 'INR',
    transaction_date: e.transaction_date,
    category: e.category,
    is_subscription: e.is_subscription,
    source_email: sourceEmail,
    source_subject: subject.slice(0, 500),
  });

  for (const id of fresh) {
    scanned++;
    let didGeminiCall = false;

    try {
      const msg = await gmailGetMessage(providerToken, id);
      const decoded = decodeMessage(msg);
      let inlineRowAdded = false;

      // --- 1. Inline text/HTML body extraction ---
      if (keywordPrefilter(decoded.body, decoded.snippet, decoded.subject)) {
        const ext = await geminiExtract(decoded.subject, decoded.body, GEMINI_API_KEY);
        didGeminiCall = true;
        if (ext.is_expense && ext.amount !== null && ext.transaction_date !== null) {
          rows.push(toRow(
            { ...ext, amount: ext.amount, transaction_date: ext.transaction_date },
            id,
            decoded.subject,
          ));
          inlineRowAdded = true;
        }
      }

      // --- 2. PDF attachments (cap to first 1 per email) ---
      const pdf = decoded.pdfAttachments[0];
      if (pdf) {
        if (pdf.size > MAX_PDF_BYTES) {
          errors.push(`${id}: PDF "${pdf.filename}" is ${(pdf.size / 1024 / 1024).toFixed(1)}MB, exceeds ${MAX_PDF_BYTES / 1024 / 1024}MB cap`);
        } else {
          // Throttle between Gemini calls if we already made one for inline body.
          if (didGeminiCall) await sleep(GEMINI_DELAY_MS);

          try {
            const bytes = await gmailGetAttachment(providerToken, id, pdf.attachmentId);
            const pdfBase64 = bytesToBase64(bytes);
            const extractions = await geminiExtractFromPdf(pdfBase64, GEMINI_API_KEY);
            didGeminiCall = true;

            let pdfRowIndex = 0;
            for (const ext of extractions) {
              if (!ext.is_expense || ext.amount === null || !ext.transaction_date) continue;

              // First row claims the bare msg_id if no inline row exists, so
              // dedup .in() still matches on subsequent syncs. Later rows get a suffix.
              const sourceEmail = !inlineRowAdded && pdfRowIndex === 0
                ? id
                : `${id}:pdf:${pdf.attachmentId}:${pdfRowIndex}`;

              rows.push(toRow(
                { ...ext, amount: ext.amount, transaction_date: ext.transaction_date },
                sourceEmail,
                `${decoded.subject} — ${pdf.filename}`,
              ));
              pdfRowIndex++;
            }
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            errors.push(`${id}: PDF "${pdf.filename}": ${m}`);
          }
        }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      errors.push(`${id}: ${m}`);
    }

    // Throttle between messages whenever we hit Gemini at all.
    if (didGeminiCall && scanned < fresh.length) {
      await sleep(GEMINI_DELAY_MS);
    }
  }

  // ---- Bulk upsert with dedup ----
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
        { error: `Insert failed: ${insertErr.message}`, scanned, errors },
        500,
      );
    }
    inserted = count ?? rows.length;
  }

  // ---- Record the run (best-effort; never fail the response on this) ----
  try {
    await admin.from('sync_runs').insert({
      user_id: userId,
      inserted,
      scanned,
      errors_count: errors.length,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to record sync_run:', e);
  }

  return json({ inserted, scanned, errors });
});
