// Gemini 2.0 Flash structured-output call. Uses responseSchema so the model
// must return JSON matching our shape — no string-prompt JSON wrangling needed.

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

const SYSTEM_INSTRUCTION = `You extract structured expense data from emails.
Return strict JSON matching the provided schema.

SET is_expense=true for:
- Receipts and payment confirmations ("we charged your card $X", "payment of ₹X received")
- Order confirmations with a visible price ("Order total: ₹500")
- Subscription confirmations, renewals, or trial-to-paid conversions (Apple, Spotify, Netflix, Chess.com, Amazon Prime, etc.)
- Investment purchases that debit cash (mutual fund orders, stock buys, SIP transactions on Zerodha/Groww/Coin)
- UPI / bank debits, bill payments, EMI deductions
- Anything else where money clearly moved OUT of the user's account

SET is_expense=false for:
- Marketing/promotional emails ("50% off!", "deals just for you")
- Newsletters, password resets, OTPs, account alerts without a charge
- Pure shipping/tracking updates ("your order is out for delivery") with no price
- Calendar invites, meeting notifications
- Refunds, cashbacks, credits (money IN — not OUT)
- "Free trial activated" with no payment information

Extraction rules:
- amount: numeric only (no currency symbol). If multiple totals are shown, use the TOTAL charged.
- currency: 3-letter ISO 4217. ₹ → INR, $ → USD, € → EUR, £ → GBP, ¥ → JPY. Default INR if Indian merchant context (Zerodha, Paytm, PhonePe, etc.) and symbol absent.
- transaction_date: ISO YYYY-MM-DD. Use any explicit transaction/order/charge date in the body. If only the email arrival is available, infer from the subject (e.g. "Order update - 30-04-2026" → "2026-04-30").
- merchant: the brand that charged (Apple, Zerodha, Amazon, Uber, Swiggy). Not the email sender domain.
- category: best fit from the enum. Investments → "Other". Mobile/internet bills → "Bills". Food delivery → "Food".
- is_subscription: true ONLY for clearly recurring services (monthly/yearly plans). One-off investment orders = false.

EXAMPLES:

Subject: "Your Subscription is Confirmed"
Body: "Apple — Chess.com Platinum Membership. $7.99/month. Renews monthly. Date: 5 May 2026."
→ {is_expense: true, merchant: "Chess.com", amount: 7.99, currency: "USD", transaction_date: "2026-05-05", category: "Subscriptions", is_subscription: true}

Subject: "Coin by Zerodha - Order update - 30-04-2026"
Body: "Order placed. Parag Parikh Flexi Cap Fund - Direct Plan. ₹2000.00"
→ {is_expense: true, merchant: "Zerodha", amount: 2000, currency: "INR", transaction_date: "2026-04-30", category: "Other", is_subscription: false}

Subject: "Your order has shipped"
Body: "Tracking number ABC123. Expected delivery May 5."
→ {is_expense: false, merchant: null, amount: null, currency: null, transaction_date: null, category: "Other", is_subscription: false}

Subject: "Refund processed"
Body: "We've refunded ₹500 to your account."
→ {is_expense: false, merchant: null, amount: null, currency: null, transaction_date: null, category: "Other", is_subscription: false}`;

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

// gemini-2.5-flash-lite has a more generous free tier (~15 RPM) than
// gemini-2.5-flash (~5 RPM). For structured JSON extraction it's plenty.
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const EMPTY: Extraction = {
  is_expense: false,
  merchant: null,
  amount: null,
  currency: null,
  transaction_date: null,
  category: 'Other',
  is_subscription: false,
};

export async function geminiExtract(
  subject: string,
  body: string,
  apiKey: string,
): Promise<Extraction> {
  const userText = `Subject: ${subject}\n\nBody:\n${body}`;

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`Gemini ${res.status}:`, errText.slice(0, 500));
    return { ...EMPTY };
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!raw) return { ...EMPTY };

  try {
    const parsed = JSON.parse(raw) as Partial<Extraction>;
    return normalize(parsed);
  } catch {
    console.error('Gemini returned non-JSON:', raw.slice(0, 200));
    return { ...EMPTY };
  }
}

// ============================================================================
// PDF statement extraction — returns an array of transactions, one per line item
// ============================================================================

const PDF_SYSTEM_INSTRUCTION = `You are reading a personal financial PDF — usually a UPI app monthly statement
(PhonePe, Google Pay, Paytm) or a self-emailed transaction summary.

Extract EVERY individual transaction in the document as a separate row in the
transactions array. Each row uses the same schema and rules as email extraction.

Rules:
- Each row must be an OUT-flow (money the user spent). Skip refunds, credits,
  cashback, money received, and incoming UPI requests — those go in as
  is_expense: false (which the caller will filter out).
- Skip aggregate / summary rows ("Total spent: ₹5000", "Subscriptions: ₹400",
  "April spending summary"). Only emit actual line items / individual transactions.
- One row per transaction. If the PDF lists 47 transactions, return 47 rows.
- transaction_date: ISO YYYY-MM-DD. Statements usually have a date column —
  use it verbatim.
- amount: positive number, no symbol.
- currency: 3-letter ISO. Indian UPI apps default to INR.
- merchant: the payee / recipient name as shown.
- category: best fit from the enum. UPI to a person → "Other". To a restaurant → "Food". To Uber/Ola → "Transport". Etc.
- is_subscription: true ONLY if the line clearly indicates a recurring service.

If the PDF appears empty, encrypted, or contains no real transactions, return
{ "transactions": [] }.`;

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
        // Big budget for monthly statements which can have 100+ transactions
        // (~200 tokens each). gemini-2.5-flash-lite supports up to ~65K output.
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
    // object inside the transactions array — losing only the last partial row.
    const salvaged = salvagePartialTransactions(raw);
    if (salvaged.length > 0) {
      console.warn(`Gemini PDF JSON truncated — salvaged ${salvaged.length} complete transactions out of partial response`);
      return salvaged.map(normalize);
    }
    console.error('Gemini PDF returned non-JSON:', raw.slice(0, 200));
    return [];
  }
}

/**
 * When Gemini's JSON response is cut off (MAX_TOKENS), the trailing `]}` is
 * missing and `JSON.parse` fails on the whole string. This walks the partial
 * raw text and extracts every complete `{...}` object inside the
 * `"transactions": [` array, so we don't lose the entire response.
 */
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

    // Find the matching closing `}` accounting for nested braces and string literals.
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

    if (depth !== 0) break; // truncated mid-object → stop salvaging

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
