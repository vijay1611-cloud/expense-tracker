// Parses extracted text from a Google Pay monthly statement PDF into a list
// of structured transactions.
//
// Real GPay format (as observed in actual statements) is a 5-7 line block
// per transaction:
//
//   01 Feb, 2026                       <- date (anchor)
//   09:27 AM                           <- time
//   Paid to MUNAF PROTEINS             <- direction + merchant
//   UPI Transaction ID: 117983425544
//   Paid by IDBI Bank 0036
//   ₹140                               <- amount
//
// "Received from" blocks have the same shape but represent money IN and are
// filtered out (not expenses). The returned array contains only OUT-flows.

export interface ParsedTransaction {
  is_expense: boolean;
  merchant: string;
  amount: number;
  currency: string;        // 'INR' for GPay
  transaction_date: string; // ISO YYYY-MM-DD
  raw_type: string;        // 'Paid' for outflows we keep, kept for debug
}

const DATE_AT_LINE_START =
  /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/;

const PAID_TO = /^Paid\s+to\s+(.+?)\s*$/i;
const RECEIVED_FROM = /^Received\s+from\s+.+$/i;

// Match ₹ followed by an amount. Permissive about spacing and trailing chars.
const INR_AMOUNT = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i;

// Block scanning bound: we look at most this many lines past the date for the
// direction + merchant + amount before giving up on a block.
const BLOCK_LOOKAHEAD = 8;

export function parseGPayStatement(rawText: string): ParsedTransaction[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const dateIso = matchDate(lines[i]);
    if (!dateIso) continue;

    // Scan forward through the block until we hit the next date line OR
    // until we've collected direction + merchant + amount OR until the
    // lookahead expires.
    let direction: 'out' | 'in' | null = null;
    let merchant: string | null = null;
    let amount: number | null = null;

    const end = Math.min(i + 1 + BLOCK_LOOKAHEAD, lines.length);
    for (let j = i + 1; j < end; j++) {
      // Hitting another date means we've crossed into the next transaction.
      if (matchDate(lines[j])) break;

      if (direction === null) {
        const paid = lines[j].match(PAID_TO);
        if (paid) {
          direction = 'out';
          merchant = cleanMerchant(paid[1]);
        } else if (RECEIVED_FROM.test(lines[j])) {
          direction = 'in';
        }
      }

      if (amount === null) {
        const amt = lines[j].match(INR_AMOUNT);
        if (amt) {
          const v = parseFloat(amt[1].replace(/,/g, ''));
          if (Number.isFinite(v) && v > 0) amount = v;
        }
      }

      if (direction !== null && amount !== null) break;
    }

    if (direction === 'out' && merchant && amount !== null) {
      out.push({
        is_expense: true,
        merchant,
        amount,
        currency: 'INR',
        transaction_date: dateIso,
        raw_type: 'Paid',
      });
    }
  }

  return out;
}

function matchDate(line: string): string | null {
  // Examples we want to handle:
  //   01 Feb, 2026
  //   01 Feb 2026
  //   1 February 2026
  //   01-Feb-2026  (less common, but cheap to support)
  const dashed = line.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})\b/);
  const spaced = line.match(DATE_AT_LINE_START);
  const m = dashed ?? spaced;
  if (!m) return null;
  const monthNum = monthFromName(m[2]);
  if (!monthNum) return null;
  const day = Number(m[1]);
  if (!day || day < 1 || day > 31) return null;
  const year = Number(m[3]);
  if (!year || year < 2000 || year > 2100) return null;
  return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const key = s.toLowerCase().replace(/[.,]+$/, '');
  return MONTH_NAMES[key] ?? null;
}

function cleanMerchant(s: string): string {
  return s
    .replace(/\s*\(.*?\)\s*$/, '')   // strip trailing (parenthetical)
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim()
    .slice(0, 100);
}
