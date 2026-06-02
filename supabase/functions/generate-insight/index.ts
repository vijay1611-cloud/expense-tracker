// Edge Function: generate-insight
//
// Reads the caller's transactions for the current and previous month, builds
// a small numeric summary, and asks Gemini to produce a 2-4 sentence
// insight in natural language. The AI never sees raw merchant names or PII —
// only aggregates (total spent, top categories, MoM change, subscription
// count). That keeps cost low and privacy intact even on the free tier.
//
// Endpoint: POST /functions/v1/generate-insight
// Headers:  Authorization: Bearer <user_jwt>
// Body:     (none)
// Returns:  { insight: string, stats: { ... } }

import { createClient } from 'supabase';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

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

interface TxRow {
  amount: number;
  currency: string;
  category: string;
  is_subscription: boolean;
  transaction_date: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  // Reads use the user's own client, RLS-scoped to their own rows.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Pull the last 60 days so we can compare current vs previous month.
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const fromIso = sixtyDaysAgo.toISOString().slice(0, 10);

  const { data: rows, error: txErr } = await userClient
    .from('transactions')
    .select('amount, currency, category, is_subscription, transaction_date')
    .gte('transaction_date', fromIso)
    .order('transaction_date', { ascending: false });

  if (txErr) {
    return json({ error: `Read failed: ${txErr.message}` }, 500);
  }

  const stats = computeStats((rows ?? []) as TxRow[]);

  if (stats.thisMonthTotal === 0 && stats.lastMonthTotal === 0) {
    return json({
      insight: 'Upload a recent statement to see your first insight here.',
      stats,
    });
  }

  const insight = await askGemini(stats);
  return json({ insight, stats });
});

interface Stats {
  thisMonthLabel: string;
  thisMonthTotal: number;
  lastMonthTotal: number;
  pctChange: number | null;
  topCategoriesThisMonth: { category: string; amount: number; share: number }[];
  subscriptionTotalThisMonth: number;
  transactionCountThisMonth: number;
  currency: string;
}

function computeStats(rows: TxRow[]): Stats {
  const now = new Date();
  const thisYM = ym(now);
  const lastDate = new Date(now);
  lastDate.setMonth(lastDate.getMonth() - 1);
  const lastYM = ym(lastDate);

  const thisMonth = rows.filter((r) => r.transaction_date.startsWith(thisYM));
  const lastMonth = rows.filter((r) => r.transaction_date.startsWith(lastYM));

  const thisMonthTotal = sum(thisMonth.map((r) => r.amount));
  const lastMonthTotal = sum(lastMonth.map((r) => r.amount));

  const pctChange = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : null;

  // Top 3 categories this month
  const byCategory = new Map<string, number>();
  for (const r of thisMonth) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  }
  const topCategoriesThisMonth = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, amount]) => ({
      category,
      amount,
      share: thisMonthTotal > 0 ? (amount / thisMonthTotal) * 100 : 0,
    }));

  const subscriptionTotalThisMonth = sum(
    thisMonth.filter((r) => r.is_subscription).map((r) => r.amount),
  );

  // Pick the user's most-common currency for display
  const currencyCounts = new Map<string, number>();
  for (const r of rows) currencyCounts.set(r.currency, (currencyCounts.get(r.currency) ?? 0) + 1);
  let currency = 'INR';
  let max = 0;
  for (const [c, n] of currencyCounts) {
    if (n > max) {
      currency = c;
      max = n;
    }
  }

  return {
    thisMonthLabel: monthLabel(now),
    thisMonthTotal: round(thisMonthTotal),
    lastMonthTotal: round(lastMonthTotal),
    pctChange: pctChange === null ? null : Math.round(pctChange),
    topCategoriesThisMonth,
    subscriptionTotalThisMonth: round(subscriptionTotalThisMonth),
    transactionCountThisMonth: thisMonth.length,
    currency,
  };
}

async function askGemini(stats: Stats): Promise<string> {
  const summary = JSON.stringify({
    month: stats.thisMonthLabel,
    currency: stats.currency,
    total_this_month: stats.thisMonthTotal,
    total_last_month: stats.lastMonthTotal,
    percent_change_vs_last_month: stats.pctChange,
    transaction_count_this_month: stats.transactionCountThisMonth,
    subscription_total_this_month: stats.subscriptionTotalThisMonth,
    top_categories: stats.topCategoriesThisMonth,
  });

  const systemPrompt = `You are a concise personal-finance assistant. Given a JSON summary
of someone's monthly spending, write a friendly 2-4 sentence insight in plain English.
Always include the currency code (e.g. ₹ for INR, $ for USD). Round numbers sensibly.
If there's a big month-over-month change, call it out. Mention top categories.
Do NOT speculate beyond the data provided. No bullet points, no markdown, no headers — just plain prose.`;

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Spending summary:\n${summary}` }],
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`Gemini ${res.status}:`, errText.slice(0, 500));
    return fallbackInsight(stats);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text && text.length > 0 ? text : fallbackInsight(stats);
}

function fallbackInsight(stats: Stats): string {
  const symbol = stats.currency === 'INR' ? '₹' : stats.currency + ' ';
  const top = stats.topCategoriesThisMonth[0];
  let s = `You've spent ${symbol}${stats.thisMonthTotal.toLocaleString('en-IN')} this month across ${stats.transactionCountThisMonth} transactions.`;
  if (top) {
    s += ` Most of it was on ${top.category} (${Math.round(top.share)}%).`;
  }
  if (stats.pctChange !== null) {
    s += ` That's ${stats.pctChange > 0 ? 'up' : 'down'} ${Math.abs(stats.pctChange)}% vs last month.`;
  }
  if (stats.subscriptionTotalThisMonth > 0) {
    s += ` Subscriptions account for ${symbol}${stats.subscriptionTotalThisMonth.toLocaleString('en-IN')}.`;
  }
  return s;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + Number(b), 0);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
