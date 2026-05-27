// Gemini 2.5 Flash-Lite PDF extraction.
// Receives a PDF (base64) and returns an array of structured expense rows.

export const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Travel',
  'Health',
  'Subscriptions',
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

export interface Extraction {
  is_expense: boolean;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  transaction_date: string | null;
  category: Category;
  is_subscription: boolean;
}

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const PDF_SYSTEM_INSTRUCTION = `You are reading a personal financial PDF — usually a UPI app monthly statement
(PhonePe, Google Pay, Paytm) or a bank/credit-card statement.

Extract EVERY individual transaction in the document as a separate row in the
transactions array.

Rules:
- Each row must be an OUT-flow (money the user spent). Skip refunds, credits,
  cashback, money received, and incoming UPI requests — those should be
  is_expense: false (the caller filters them out).
- Skip aggregate / summary rows ("Total spent: ₹5000", "Subscriptions: ₹400",
  monthly summary, opening/closing balance). Only emit actual line items.
- One row per transaction. If the PDF lists 47 transactions, return 47 rows.
- transaction_date: ISO YYYY-MM-DD. Statements always have a date column.
- amount: positive number, no symbol.
- currency: 3-letter ISO. Indian UPI/bank statements default to INR.
- merchant: the payee / recipient name as shown.
- category: best fit from the enum. UPI to a person → "Other". To a
  restaurant → "Food". To Uber/Ola/Metro → "Transport". To Netflix/Spotify →
  "Subscriptions". Mobile/internet/electricity → "Bills".
- is_subscription: true ONLY for clearly recurring services. One-off
  investment orders or single payments = false.

If the PDF is empty, encrypted, or contains no real transactions, return
{ "transactions": [] }.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_expense: { type: 'boolean' },
    merchant: { type: 'string', nullable: true },
    amount: { type: 'number', nullable: true },
    currency: { type: 'string', nullable: true },
    transaction_date: { type: 'string', nullable: true },
    category: { type: 'string', enum: CATEGORIES as unknown as string[] },
    is_subscription: { type: 'boolean' },
  },
  required: [
    'is_expense',
    'merchant',
    'amount',
    'currency',
    'transaction_date',
    'category',
    'is_subscription',
  ],
};

const PDF_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: RESPONSE_SCHEMA,
    },
  },
  required: ['transactions'],
};

export async function geminiExtractFromPdf(
  pdfBase64: string,
  apiKey: string,
): Promise<Extraction[]> {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PDF_SYSTEM_INSTRUCTION }] },
      contents: [{
        role: 'user',
        parts: [
          { text: 'Extract every transaction from this statement.' },
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PDF_RESPONSE_SCHEMA,
        temperature: 0.1,
        // Large budget for monthly statements (100+ transactions × ~200 tokens).
        // gemini-2.5-flash-lite supports up to ~65K output.
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`Gemini PDF ${res.status}:`, errText.slice(0, 500));
    return [];
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!raw) {
    const block = json.promptFeedback?.blockReason;
    if (block) console.warn(`Gemini PDF blocked: ${block}`);
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { transactions?: Partial<Extraction>[] };
    const items = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    return items.map(normalize);
  } catch {
    // Truncated mid-JSON (e.g. MAX_TOKENS). Salvage every complete `{...}`
    // object inside the transactions array.
    const salvaged = salvagePartialTransactions(raw);
    if (salvaged.length > 0) {
      console.warn(`Gemini PDF JSON truncated — salvaged ${salvaged.length} complete transactions out of partial response`);
      return salvaged.map(normalize);
    }
    console.error('Gemini PDF returned non-JSON:', raw.slice(0, 200));
    return [];
  }
}

function salvagePartialTransactions(raw: string): Partial<Extraction>[] {
  const arrayMatch = raw.indexOf('"transactions"');
  if (arrayMatch === -1) return [];
  const bracketStart = raw.indexOf('[', arrayMatch);
  if (bracketStart === -1) return [];

  const out: Partial<Extraction>[] = [];
  let i = bracketStart + 1;

  while (i < raw.length) {
    while (i < raw.length && (raw[i] === ' ' || raw[i] === ',' || raw[i] === '\n' || raw[i] === '\r' || raw[i] === '\t')) {
      i++;
    }
    if (i >= raw.length || raw[i] === ']') break;
    if (raw[i] !== '{') break;

    let depth = 1;
    let inString = false;
    let escape = false;
    let j = i + 1;
    while (j < raw.length && depth > 0) {
      const c = raw[j];
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = !inString;
      } else if (!inString) {
        if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      j++;
    }

    if (depth !== 0) break;

    try {
      out.push(JSON.parse(raw.slice(i, j)) as Partial<Extraction>);
    } catch {
      // Skip a malformed object; continue with the next.
    }
    i = j;
  }
  return out;
}

function normalize(p: Partial<Extraction>): Extraction {
  const cat = (CATEGORIES as readonly string[]).includes(p.category ?? '')
    ? (p.category as Category)
    : 'Other';

  const amount = typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : null;
  const currency = typeof p.currency === 'string' && /^[A-Z]{3}$/.test(p.currency)
    ? p.currency
    : null;
  const date = typeof p.transaction_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.transaction_date)
    ? p.transaction_date
    : null;

  const isExpense = p.is_expense === true && amount !== null && date !== null;

  return {
    is_expense: isExpense,
    merchant: typeof p.merchant === 'string' && p.merchant.trim().length > 0
      ? p.merchant.trim()
      : null,
    amount,
    currency,
    transaction_date: date,
    category: cat,
    is_subscription: p.is_subscription === true,
  };
}
