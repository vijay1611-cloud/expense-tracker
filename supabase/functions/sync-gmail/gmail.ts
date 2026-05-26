// Minimal Gmail API client + multipart decoder for the sync-gmail Edge Function.

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailMessagePart;
}

export interface PdfAttachment {
  attachmentId: string;
  filename: string;
  size: number; // bytes (Gmail-reported, before fetch)
}

export interface DecodedMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  body: string;
  pdfAttachments: PdfAttachment[];
  internalDate?: string;
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export async function gmailListMessages(
  token: string,
  query: string,
  maxResults: number,
): Promise<{ ok: boolean; status: number; ids: string[] }> {
  const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, ids: [] };
  }
  const json = await res.json() as { messages?: { id: string }[] };
  return { ok: true, status: 200, ids: (json.messages ?? []).map((m) => m.id) };
}

export async function gmailGetMessage(
  token: string,
  id: string,
): Promise<GmailMessage> {
  const url = `${GMAIL_API}/messages/${id}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail get message ${id} failed: ${res.status}`);
  }
  return await res.json() as GmailMessage;
}

/**
 * Fetches an attachment by id and returns its raw bytes.
 * Gmail returns base64url-encoded data; we decode to a Uint8Array.
 */
export async function gmailGetAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const url = `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail get attachment ${attachmentId} failed: ${res.status}`);
  }
  const json = await res.json() as { data?: string };
  if (!json.data) {
    throw new Error(`Attachment ${attachmentId} returned no data`);
  }
  return base64UrlDecodeBytes(json.data);
}

function base64UrlDecodeBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlDecode(input: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(base64UrlDecodeBytes(input));
  } catch {
    return '';
  }
}

/** Convert raw bytes to standard (non-url-safe) base64 — what Gemini expects. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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

function collectParts(
  part: GmailMessagePart | undefined,
  out: { plain: string[]; html: string[]; pdfs: PdfAttachment[] },
): void {
  if (!part) return;
  if (part.parts && part.parts.length > 0) {
    for (const sub of part.parts) collectParts(sub, out);
  }
  // Inline text bodies
  if (part.body?.data) {
    const decoded = base64UrlDecode(part.body.data);
    if (part.mimeType === 'text/plain') out.plain.push(decoded);
    else if (part.mimeType === 'text/html') out.html.push(decoded);
  }
  // PDF attachments — identified by mimeType OR filename extension.
  // Attachments live at parts where body.attachmentId is set, body.data is empty.
  const isPdf =
    part.mimeType === 'application/pdf' ||
    (part.filename && /\.pdf$/i.test(part.filename));
  if (isPdf && part.body?.attachmentId) {
    out.pdfs.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename || 'attachment.pdf',
      size: part.body.size ?? 0,
    });
  }
}

function getHeader(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers ?? [];
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found?.value ?? '';
}

const BODY_BYTE_BUDGET = 8 * 1024; // 8 KB

export function decodeMessage(msg: GmailMessage): DecodedMessage {
  const out = { plain: [] as string[], html: [] as string[], pdfs: [] as PdfAttachment[] };
  collectParts(msg.payload, out);

  // Some senders (Apple, banks) ship a tiny text/plain stub and put the real
  // content — including the price — in HTML only. Pick whichever source is
  // more informative.
  const plain = out.plain.join('\n').trim();
  const html = out.html.length > 0 ? stripHtml(out.html.join('\n')) : '';

  let body: string;
  if (!plain) body = html;
  else if (!html) body = plain;
  else body = html.length > plain.length ? html : plain;

  body = body.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, BODY_BYTE_BUDGET);

  return {
    id: msg.id,
    subject: getHeader(msg, 'Subject'),
    from: getHeader(msg, 'From'),
    snippet: msg.snippet ?? '',
    body,
    pdfAttachments: out.pdfs,
    internalDate: undefined,
  };
}
