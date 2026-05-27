# Expense Tracker

AI-powered expense tracking. Sign in with Google, upload your monthly UPI/bank statement PDF, and get every transaction extracted automatically — merchant, amount, date, category.

**Stack:** Angular 19 (standalone, signals) · Tailwind CSS · Supabase (Postgres + Auth + Edge Functions) · Google OAuth (identity only) · Google Gemini 2.5 Flash-Lite (native PDF input).

**Live:** <https://expense-tracker-hazel-eta-39.vercel.app/>

---

## How it works

1. User signs in via Supabase Auth with the Google provider. **Only basic `email profile` scopes** — the app never reads your inbox, Drive, or any other Google data.
2. User drags a PDF statement onto the dashboard (or clicks to pick a file).
3. The browser hashes the file (SHA-256) for dedup, base64-encodes it, and POSTs to the `upload-statement` Edge Function.
4. The Edge Function:
   - Verifies the user's JWT.
   - Validates the file: PDF magic bytes, ≤5 MB, valid SHA-256 hash.
   - Checks dedup — if the same file hash already exists for this user, skips.
   - Sends the PDF to Gemini 2.5 Flash-Lite as `inlineData` with a `responseSchema` array.
   - For each extracted transaction, inserts a row into `transactions`. First row uses the bare file hash as `source_email`; subsequent rows get `<hash>:row:<N>` for uniqueness.
   - Falls back to **truncated-JSON salvage** if Gemini hits the output-token cap — recovers all complete transaction objects.
   - Records the upload in `upload_runs` (filename, size, hash, counts, duration).
5. Dashboard and Transactions pages re-read from Postgres and update via signals.

---

## Repository layout

```
.
├── expense-tracker/             Angular 19 SPA
├── supabase/
│   ├── config.toml
│   ├── migrations/              SQL: users + transactions + upload_runs + RLS
│   └── functions/
│       └── upload-statement/    Deno Edge Function (Gemini PDF extraction)
├── .env.example
├── vercel.json                  Frontend deploy config
└── README.md
```

---

## Prerequisites

- Node.js 22+ / npm 10+
- Angular CLI 19 (`npm i -g @angular/cli@19`)
- Supabase CLI (`npm i -g supabase`)
- A Supabase project (free tier is fine)
- A Google Cloud project with **Google OAuth Client (Web)** configured — Gmail API is **NOT** needed
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) — uses **gemini-2.5-flash-lite**

---

## Setup

### 1. Configure Google Cloud

1. Create / pick a Google Cloud project.
2. Configure the **OAuth consent screen**. Because we only request `email profile` (non-sensitive) scopes, **no Google verification is required** — anyone can sign in.
3. Create an **OAuth 2.0 Client ID** of type *Web application*.
4. Add authorized redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`.
5. Copy the Client ID and Client Secret.

### 2. Configure Supabase

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                              # applies migrations
```

In the Supabase dashboard:

- **Authentication → Providers → Google**: paste the Client ID and Client Secret. Enable.
- **Authentication → URL Configuration**: add `http://localhost:4200` (dev) and your production URL to Site URL + Redirect URLs.

Set the Edge Function secret:

```bash
supabase secrets set GEMINI_API_KEY=AIza...
```

> Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every Edge Function. You can't and don't need to set them manually.

Deploy the function:

```bash
supabase functions deploy upload-statement
```

### 3. Configure the frontend

```bash
cd expense-tracker
npm install
```

Open `src/environments/environment.ts` and replace `supabaseUrl` and `supabaseAnonKey` with your project's values from **Project Settings → API**.

### 4. Run

```bash
ng serve
```

Visit <http://localhost:4200>.

---

## Database schema

```text
public.users        mirrors auth.users (populated by trigger on signup)
public.transactions extracted expenses
                    - unique(user_id, source_email) for dedup
                      (source_email is repurposed: holds file_hash[:row:N])
                    - index(user_id, transaction_date desc) for dashboards
                    - RLS: auth.uid() = user_id on all CRUD
public.upload_runs  per-upload audit log (filename, size, hash, counts, timings)
                    - RLS: auth.uid() = user_id on select
```

See migrations in `supabase/migrations/` for the full DDL.

---

## Edge Function: `upload-statement`

Endpoint: `POST /functions/v1/upload-statement`
Headers: `Authorization: Bearer <user_jwt>`
Body:

```json
{
  "filename": "gpay_statement_apr_2026.pdf",
  "fileBase64": "JVBERi0xLjUKJeLj...",
  "fileHash": "ab12cd34...64hex chars"
}
```

Response:

```json
{
  "inserted": 47,
  "scanned": 50,
  "errors": [],
  "uploadRunId": "uuid"
}
```

Key behaviours:

- **JWT verified** server-side via `supabase-js`; never trusts the caller's claimed user ID.
- **Service role** client used for inserts to bypass RLS, scoped to the verified `user.id`.
- **File validation:** PDF magic bytes (`%PDF-`), size ≤5 MB, base64 well-formed, hash is 64 hex chars.
- **Dedup** via SHA-256 hash check before extraction — re-uploading the same file is a no-op.
- **Gemini structured output** (`responseSchema`) for the transactions array, normalized to safe types.
- **Salvage** logic recovers complete transactions when Gemini's JSON is truncated by the output cap.

---

## Verification (smoke test)

1. `ng serve`, open <http://localhost:4200>. Landing page renders.
2. Click **Sign in with Google**, pick your account. Land on `/dashboard`.
3. Drag a UPI/bank statement PDF onto the upload zone (or click to pick).
4. After 10–60 seconds, a toast reads `Imported N transactions from <filename>`.
5. Dashboard shows monthly total + category breakdown + recent transactions.
6. Drop the **same file** again → toast says "This file has already been processed".
7. `/transactions` page: type in search, click category chips, click column headers to sort.
8. `/settings` page: see your profile + the upload history.
9. Sign out, hit `/dashboard` directly → redirected to `/login` (auth guard).
10. In Supabase SQL editor, try to read another user's rows → empty (RLS).

---

## Known MVP limits

- **5 MB per PDF** — well under Gemini's 20 MB cap, balances quality vs Edge Function timeout.
- **PDF only** — no images, CSV, or Excel yet.
- **One file at a time** — no batch upload.
- **No password-protected PDFs** — encrypted PDFs are sent to Gemini but return no transactions.
- **Naive currency sum** — totals are added without FX conversion. Primary display currency is the user's most-common.
- **No manual transaction editing UI yet** — Gemini's category is final for the MVP.

---

## Privacy posture

- **No Gmail / inbox access.** Sign-in uses only basic `email profile` scopes.
- **Only the file you upload** is sent to Gemini — never anything else.
- **The PDF itself is not stored** in our database. Only the extracted structured rows (merchant, amount, date, category) are persisted, plus the filename + hash for dedup/audit.
- **Free-tier Gemini** may use prompts for model improvement. For zero-retention, enable billing on the Google Cloud project — the same API key automatically switches to paid-tier policies (no code changes).

---

## Project decisions worth knowing

- **Standalone components only**, no NgModules.
- **Signals over RxJS** for application state. No NgRx.
- **Strict TypeScript** with no `any`.
- **Tailwind v3** with `@tailwindcss/forms`. Apple-leaning palette: `stone-50` background, `zinc-900` foreground, `rounded-2xl` cards, soft `shadow-card`.
- **No chart library** — the category breakdown is a CSS bar list driven by computed percentages.
- **Functional route guards** (`CanActivateFn`) and lazy-loaded routes.
- **All secrets** live as Supabase secrets or in untracked environment files.

---

## Scripts

```bash
# from /expense-tracker
ng serve              # dev server on :4200
ng build              # production build into dist/
```

```bash
# from project root
supabase functions serve upload-statement     # run the function locally
supabase functions deploy upload-statement    # deploy
supabase db push                              # apply migrations
```

---

## License

MIT — see source for details.
