# Expense Tracker

AI-powered expense tracking. Sign in with Google, connect Gmail, and watch your receipts, invoices, and subscription charges turn into clean transactions automatically.

**Stack:** Angular 19 (standalone, signals) · Tailwind CSS · Supabase (Postgres + Auth + Edge Functions) · Google OAuth · Gmail API · Google Gemini 2.5 Flash-Lite.

---

## How it works

1. User signs in via Supabase Auth with the Google provider and grants `gmail.readonly`.
2. The browser captures the Google `provider_token` from the session and stores it in `sessionStorage` (TTL ~55 min).
3. User clicks **Sync Gmail** on the dashboard.
4. The Angular app invokes the `sync-gmail` Edge Function with the user's Supabase JWT and the Google token.
5. The Edge Function:
   - Verifies the JWT.
   - Calls Gmail `users.messages.list` with a 30-day transaction query (up to 20 messages).
   - De-duplicates against already-synced `source_email` IDs.
   - For each new message:
     - **Inline body path:** decodes multipart body, runs a keyword pre-filter, calls Gemini with a strict `responseSchema`, and inserts the result into `transactions`.
     - **PDF attachment path:** if the message has a PDF attachment ≤5 MB (e.g., a PhonePe/GPay/Paytm monthly statement), fetches it via `users.messages.attachments.get`, sends it to Gemini as `inlineData` (`application/pdf`), and inserts **all** transactions returned — one row per line item.
6. Dashboard and Transactions pages re-read from Postgres and update via signals.

---

## Repository layout

```
.
├── expense-tracker/        Angular 19 SPA
├── supabase/
│   ├── config.toml
│   ├── migrations/         SQL: users + transactions + RLS + signup trigger
│   └── functions/
│       └── sync-gmail/     Deno Edge Function (Gmail + Gemini + insert)
├── .env.example
└── README.md
```

---

## Prerequisites

- Node.js 22+ / npm 10+
- Angular CLI 19 (`npm i -g @angular/cli@19`)
- Supabase CLI (`npm i -g supabase`)
- A Supabase project (free tier is fine)
- A Google Cloud project with the **Gmail API** enabled and an OAuth 2.0 Web Client
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) — uses **gemini-2.5-flash-lite** (free tier: ~15 RPM)

---

## Setup

### 1. Configure Google Cloud

1. Create / pick a Google Cloud project.
2. Enable **Gmail API**.
3. Configure the **OAuth consent screen** and add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. Create an **OAuth 2.0 Client ID** of type *Web application*.
5. Add an authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
6. Keep the Client ID and Client Secret handy.

### 2. Configure Supabase

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                              # applies the migration
```

In the Supabase dashboard:

- **Authentication → Providers → Google**: paste the Client ID and Client Secret. Enable the provider.
- **Authentication → URL Configuration**: add `http://localhost:4200` to Site URL and `http://localhost:4200/auth/callback` to additional redirect URLs (plus your production URLs once you deploy).

Set the Edge Function secret:

```bash
supabase secrets set GEMINI_API_KEY=AIza...
```

> Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every Edge Function by Supabase — you cannot (and don't need to) set them manually. The CLI will reject any secret name starting with `SUPABASE_`.

Deploy the function:

```bash
supabase functions deploy sync-gmail
```

### 3. Configure the frontend

```bash
cd expense-tracker
npm install
```

Open `src/environments/environment.ts` and `environment.prod.ts` and replace `supabaseUrl` and `supabaseAnonKey` with your project's values from **Project Settings → API**.

### 4. Run

```bash
ng serve
```

Visit <http://localhost:4200>.

---

## Database schema

```text
public.users            mirrors auth.users (populated by trigger on signup)
public.transactions     extracted expenses
                        - unique(user_id, source_email) for Gmail-message dedup
                        - index(user_id, transaction_date desc) for dashboards
                        - RLS: auth.uid() = user_id on all CRUD
```

See [`supabase/migrations/20260525000000_init.sql`](supabase/migrations/20260525000000_init.sql) for the full DDL.

---

## Edge Function: `sync-gmail`

Endpoint: `POST /functions/v1/sync-gmail`
Headers: `Authorization: Bearer <user_jwt>`
Body: `{ "providerToken": "<google_access_token>" }`

Response:

```json
{ "inserted": 4, "scanned": 18, "errors": [] }
```

Key behaviours:

- **JWT verified** server-side via `supabase-js`; never trusts the caller's claimed user ID.
- **Service role** client used for inserts to bypass RLS, scoped to the verified `user.id`.
- **Dedup** via DB unique index + `upsert ignoreDuplicates`. For PDF-extracted rows, the first row claims the bare Gmail message ID so subsequent syncs short-circuit; later rows get a `:pdf:<attId>:<n>` suffix to stay unique within the constraint.
- **Gemini structured output** (`responseSchema`) guarantees the JSON shape; the Edge Function normalises again and defaults to `is_expense:false` on any ambiguity.
- **Throttled** to ~12 requests/min to stay under the Gemini-2.5-flash-lite free-tier 15-RPM cap.
- **PDF handling:** Gemini 2.5-flash-lite reads `application/pdf` as inline data directly; no client-side PDF parsing library needed.

---

## Verification (smoke test)

1. `ng serve`, open <http://localhost:4200>. Landing page renders.
2. Click **Sign in with Google**, complete consent (Gmail readonly listed). Land on `/dashboard`.
3. DevTools → Application → Session Storage: `gmail_provider_token` and `gmail_provider_token_exp` present.
4. Supabase SQL editor: `select * from public.users where id = auth.uid()` → row exists.
5. Click **Sync Gmail**. After up to ~2 min, toast reads "Synced N transactions".
6. Dashboard shows monthly total + category breakdown + recent transactions.
7. Click **Sync Gmail** again immediately → toast "Inbox is up to date" (dedup).
8. `/transactions` page: type a merchant name → filters live; click a column header → sort flips.
9. Sign out, navigate to `/dashboard` → redirected to `/login` (auth guard).
10. In SQL editor, attempt to read another user's rows as that user → empty (RLS).

---

## Known MVP limits

- **20 emails per sync** — Edge Function 150s timeout × Gemini 2.5-flash-lite free-tier 15 RPM (5s throttle × 20 = 100s). Documented in `supabase/functions/sync-gmail/index.ts`.
- **Gmail token re-consent ~hourly** — Supabase does not persist refresh tokens; users click *Reconnect Gmail* when their session token expires.
- **Naive currency sum** — totals are added without FX conversion. Primary display currency is the user's most-common.
- **30-day search window** — `newer_than:30d` in the Gmail query. Adjust in `supabase/functions/sync-gmail/index.ts` if needed.
- **No manual transaction editing UI yet** — Gemini's category is final for the MVP.
- **PDFs:** only the **first** PDF per email is processed; PDFs **larger than 5 MB are skipped** (reported in the `errors` field); **password-protected PDFs are not supported** — Gemini receives encrypted bytes and returns no transactions. A best-effort error entry is added to the sync result.

---

## Project decisions worth knowing

- **Standalone components only**, no NgModules.
- **Signals over RxJS** for application state. `TransactionsService` exposes signals + computed views; no NgRx.
- **Strict TypeScript** with no `any`, no implicit returns, no fallthrough.
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
supabase start                          # local Supabase stack (optional)
supabase functions serve sync-gmail     # run the function locally
supabase functions deploy sync-gmail    # deploy
supabase db push                        # apply migrations
```

---

## License

MIT — see source for details.
