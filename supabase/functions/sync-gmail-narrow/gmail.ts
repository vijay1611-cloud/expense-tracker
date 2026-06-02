// Minimal Gmail API helpers — list by query, get full message, decode body.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailHeader { name: string; value: string }
export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailMessagePart[];
}
export interface GmailMessage {
  id: string;
  snippet?: string;
  payload?: GmailMessagePart;
}

export interface DecodedMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  body: string;
}

export async function gmailList(
  token: string,
  query: string,
  maxResults: number,
): Promise<{ ok: boolean; status: number; ids: string[] }> {
  const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { ok: false, status: res.status, ids: [] };
  const json = await res.json() as { messages?: { id: string }[] };
  return { ok: true, status: 200, ids: (json.messages ?? []).map((m) => m.id) };
}

export async function gmailGet(token: string, id: string): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail get ${id} failed: ${res.status}`);
  return await res.json() as GmailMessage;
}

function b64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch { return ''; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function collect(part: GmailMessagePart | undefined, out: { plain: string[]; html: string[] }): void {
  if (!part) return;
  if (part.parts?.length) for (const sub of part.parts) collect(sub, out);
  if (part.body?.data) {
    const decoded = b64UrlDecode(part.body.data);
    if (part.mimeType === 'text/plain') out.plain.push(decoded);
    else if (part.mimeType === 'text/html') out.html.push(decoded);
  }
}

function header(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers ?? [];
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

const BODY_BUDGET = 8 * 1024;

export function decode(msg: GmailMessage): DecodedMessage {
  const out = { plain: [] as string[], html: [] as string[] };
  collect(msg.payload, out);
  const plain = out.plain.join('\n').trim();
  const html = out.html.length ? stripHtml(out.html.join('\n')) : '';
  let body: string;
  if (!plain) body = html;
  else if (!html) body = plain;
  else body = html.length > plain.length ? html : plain;
  body = body.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, BODY_BUDGET);
  return {
    id: msg.id,
    subject: header(msg, 'Subject'),
    from: header(msg, 'From'),
    snippet: msg.snippet ?? '',
    body,
  };
}
