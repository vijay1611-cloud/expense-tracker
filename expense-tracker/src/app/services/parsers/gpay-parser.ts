// Parses extracted text from a Google Pay monthly statement PDF into a list
// of structured transactions. Heuristic: works against the standard GPay
// statement template that lists each transaction across a few lines with a
// date, the counterparty's name/handle, a type (Paid/Received), and an amount.
//
// Returns expense rows only. Refunds, money received, and aggregate rows are
// filtered out by `is_expense: false` on the parsed entry.

export interface ParsedTransaction {
  is_expense: boolean;
  merchant: string;
  amount: number;
  currency: string;        // 'INR' for GPay
  transaction_date: string; // ISO YYYY-MM-DD
  raw_type: string;        // 'Paid' / 'Received' / 'Sent' etc., kept for debug
}

const INR_AMOUNT = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i;
// Date forms commonly seen in GPay PDFs:
//   2 Apr 2026 | 02-04-2026 | 02/04/2026 | 2 April 2026
const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => string | null }[] = [
  // 2 Apr 2026 / 02 April 2026
  {
    re: /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/,
    parse: (m) => isoFromParts(m[1], monthFromName(m[2]), m[3]),
  },
  // 02-04-2026 / 02/04/2026 (assumed DD-MM-YYYY for India)
  {
    re: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
    parse: (m) => isoFromParts(m[1], Number(m[2]), m[3]),
  },
  // 2026-04-02 (ISO direct)
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    parse: (m) => `${m[1]}-${m[2]}-${m[3]}`,
  },
];

// Keywords classifying the transaction direction.
const OUTFLOW_HINTS = /\b(paid|sent|to|debit|debited|spent)\b/i;
const INFLOW_HINTS = /\b(received|from|credit|credited|refund|cashback|reversal)\b/i;

export function parseGPayStatement(rawText: string): ParsedTransaction[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedTransaction[] = [];

  // Sliding window of 1-4 lines tries to assemble one transaction at a time.
  // Each GPay transaction usually occupies 2-3 lines in the extracted text:
  //   <merchant / counterparty>
  //   Paid / Received   ₹123.45   2 Apr 2026
  // We look for a line containing both an amount AND a date, then take the
  // immediately preceding lines as the merchant context.
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(Math.max(0, i - 2), i + 2).join(' ');
    const amountMatch = window.match(INR_AMOUNT);
    if (!amountMatch) continue;

    const dateIso = findDate(window);
    if (!dateIso) continue;

    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    // Decide direction
    const outflow = OUTFLOW_HINTS.test(window);
    const inflow = INFLOW_HINTS.test(window);
    if (inflow && !outflow) continue;       // skip credits/refunds
    if (!outflow && !inflow) continue;      // skip ambiguous

    const merchant = extractMerchant(lines, i, amountMatch.index ?? -1, dateIso);
    if (!merchant) continue;

    // Dedup within the same statement (parser may match overlapping windows)
    const key = `${dateIso}|${amount}|${merchant.toLowerCase()}`;
    if (out.some((t) => `${t.transaction_date}|${t.amount}|${t.merchant.toLowerCase()}` === key)) {
      continue;
    }

    out.push({
      is_expense: true,
      merchant,
      amount,
      currency: 'INR',
      transaction_date: dateIso,
      raw_type: outflow ? 'Paid' : 'Sent',
    });
  }
  return out;
}

function findDate(window: string): string | null {
  for (const { re, parse } of DATE_PATTERNS) {
    const m = window.match(re);
    if (m) {
      const iso = parse(m);
      if (iso) return iso;
    }
  }
  return null;
}

function isoFromParts(day: string, monthNum: number | null, year: string): string | null {
  if (!monthNum || monthNum < 1 || monthNum > 12) return null;
  const d = Number(day);
  if (!d || d < 1 || d > 31) return null;
  return `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthFromName(s: string): number | null {
  return MONTH_NAMES[s.toLowerCase()] ?? null;
}

function extractMerchant(
  lines: string[],
  matchedIndex: number,
  _amountPos: number,
  _date: string,
): string | null {
  // Walk back up to 2 lines from the match looking for a non-amount, non-date,
  // non-keyword line. That's our best guess for the merchant name.
  for (let j = matchedIndex; j >= Math.max(0, matchedIndex - 2); j--) {
    const line = lines[j];
    if (!line) continue;
    if (INR_AMOUNT.test(line)) continue;
    if (findDate(line)) continue;
    if (/^(paid|received|sent|to|from)\b/i.test(line)) continue;
    if (line.length < 2 || line.length > 80) continue;
    // Strip transaction id-like tokens
    const cleaned = line
      .replace(/UPI Ref(?:erence)?:?\s*\d+/i, '')
      .replace(/Transaction\s*ID:?\s*\S+/i, '')
      .replace(/^\W+|\W+$/g, '')
      .trim();
    if (cleaned.length >= 2) return cleaned.slice(0, 80);
  }
  return null;
}
