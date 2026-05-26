// Cheap keyword regex run before paying for a Gemini call.
// Returns true if the message looks plausibly transactional.
const EXPENSE_REGEX =
  /\b(receipt|invoice|order(?:ed)?|payment|paid|charged|charge|debited|credited|subscription|renewal|purchase|transaction|billed|total\s*[:\-]?\s*[\$£€₹]|amount\s*[:\-]?|usd|eur|inr|gbp)\b/i;

export function keywordPrefilter(
  body: string,
  snippet: string,
  subject: string,
): boolean {
  if (EXPENSE_REGEX.test(subject)) return true;
  if (EXPENSE_REGEX.test(snippet)) return true;
  return EXPENSE_REGEX.test(body.slice(0, 2000));
}
