// Minimal Gemini extraction for a single email body (text). Same response
// schema as before but tuned for the narrow-Gmail flow: the user explicitly
// added the subject pattern, so we assume the email IS a transaction unless
// the body screams otherwise.

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

const SYSTEM_INSTRUCTION = `You extract one transaction from a bank's debit/credit
alert email. Return JSON matching the schema.

CRITICAL — what counts as the merchant:
The bank that sent the email (Axis Bank, HDFC, ICICI, SBI, IDBI, Kotak, etc.)
is NEVER the merchant — it is just the sender of the alert. The real merchant
is the COUNTERPARTY where the money went, usually appearing in the body as:
  - The "Info:" / "Description:" field
  - A UPI VPA like "SWIGGY-1234@icici"
  - A POS terminal label like "POS*RELIANCE FRESH"
  - The "to" / "transferred to" / "paid to" / "merchant" name
Strip any prefixes like "VPS*", "VPA*", "POS*", "UPI*", "MERCHANT-", and trim.

Examples:
  Subject: "INR 500 was debited from your A/c no. XX9324"
  Body excerpt: "Info: UPI/SWIGGY-1234567890/Payment from..."
  → merchant: "Swiggy"

  Subject: "Transaction alert"
  Body: "Rs. 2,500 has been spent on your debit card at AMAZON RETAIL ..."
  → merchant: "Amazon"

  Subject: "Debit alert"
  Body: "POS purchase of Rs 800 at RELIANCE FRESH GANDHIPURAM was..."
  → merchant: "Reliance Fresh"

Only return merchant: "Axis Bank" (or similar) if the email is genuinely
about a BANK CHARGE — e.g. annual maintenance fee, ATM fee, SMS alert charge.
In that case category should be "Bills".

Other rules:
- Default is_expense=true if there's a clear merchant + amount + date.
- For refunds, credits, cashback, money received (any IN-flow), set
  is_expense=false.
- If no date is in the body, use today's year and the most recent date hint.
- currency: 3-letter ISO. ₹ → INR.
- category: best fit from the enum. UPI/transfers → Other; bank charges → Bills.
- If you cannot find a clear counterparty merchant, set is_expense=false.`;

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
    'is_expense', 'merchant', 'amount', 'currency',
    'transaction_date', 'category', 'is_subscription',
  ],
};

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
    return normalize(JSON.parse(raw) as Partial<Extraction>);
  } catch {
    return { ...EMPTY };
  }
}

function normalize(p: Partial<Extraction>): Extraction {
  const cat = (CATEGORIES as readonly string[]).includes(p.category ?? '')
    ? (p.category as Category)
    : 'Other';
  const amount = typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : null;
  const currency = typeof p.currency === 'string' && /^[A-Z]{3}$/.test(p.currency)
    ? p.currency : null;
  const date = typeof p.transaction_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.transaction_date)
    ? p.transaction_date : null;
  const isExpense = p.is_expense === true && amount !== null && date !== null;
  return {
    is_expense: isExpense,
    merchant: typeof p.merchant === 'string' && p.merchant.trim().length > 0
      ? p.merchant.trim() : null,
    amount,
    currency,
    transaction_date: date,
    category: cat,
    is_subscription: p.is_subscription === true,
  };
}
