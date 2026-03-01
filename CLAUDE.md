# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

REAL 4D — a service that analyzes romantic conversation screenshots and delivers behavioral reports. Users pay via Hotmart, upload conversation prints, and receive a PDF analysis.

**Domain:** real4d.me | **Hosting:** GitHub Pages | **Backend:** Supabase (auth, DB, storage, edge functions) | **Payments:** Hotmart

## Development

```bash
# Local dev server (no-cache headers, required for auth testing)
python3 server.py          # serves on http://localhost:8080

# Deploy Supabase Edge Function
supabase functions deploy hotmart-webhook --no-verify-jwt

# Supabase local dev
supabase start
supabase functions serve
```

## Architecture

Static site with folder-based clean URLs (`/entrar/index.html` → `/entrar`). No build step — vanilla HTML/CSS/JS served directly via GitHub Pages.

### Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `index.html` | Landing page (marketing, CTAs link to Hotmart checkout) |
| `/entrar` | `entrar/index.html` | Login — password auth + magic link fallback |
| `/enviar` | `enviar/index.html` | Upload prints form (1-10 images + 3 questions) |
| `/minha-analise` | `minha-analise/index.html` | User dashboard — status tracker + report download |
| `/admin` | `admin/index.html` | Admin panel — order management (admin-only) |

### Shared Code

- `js/supabase-client.js` — Supabase client init, `getSession()`, `requireAuth()`, `requireAdmin()`, `formatDate()`, status label/class maps (`STATUS_LABEL`, `STATUS_CLASS`). All app pages load this via `<script src="/js/supabase-client.js"></script>`.
- `app.css` — Shared styles for authenticated pages (nav, cards, forms, tracker, upload area)
- `style.css` — Landing page only styles

---

## Supabase

**Project URL:** `https://xxuxzmegxkwdsboidtmx.supabase.co`
**Anon Key:** `sb_publishable_EMmslXi22W3FU3DX2JciMw_uTJDg55Y` (publishable, safe in frontend)
**Admin email:** `contato@real4d.me`

### Database Tables

| Table | Columns (key ones) | Purpose |
|-------|---------------------|---------|
| `pedidos` | `id`, `email`, `nome`, `status`, `hotmart_transaction`, `criado_em` | Orders — one per purchase |
| `prints` | `pedido_id`, `storage_path`, `criado_em` | Uploaded screenshot references |
| `respostas` | `pedido_id`, `fase_relacionamento`, `preocupacao_principal`, `contexto_adicional` | User questionnaire answers |
| `relatorios` | `pedido_id`, `storage_path` | Generated PDF report references |

### Order Status Flow

```
aguardando_prints → prints_enviados → analise_concluida
                                    ↘ reembolsado
```

- `aguardando_prints`: Created by webhook after payment. User hasn't uploaded prints yet.
- `prints_enviados`: User submitted prints + questionnaire via `/enviar`. Waiting for admin analysis.
- `analise_concluida`: Admin uploaded PDF report via `/admin`. User can download from `/minha-analise`.
- `reembolsado`: Hotmart refund/chargeback received.

### Storage Buckets

| Bucket | Content | Path pattern | Access |
|--------|---------|-------------|--------|
| `prints` | User conversation screenshots | `{user_id}/{timestamp}-{index}.{ext}` | Signed URLs (1h expiry) |
| `relatorios` | PDF analysis reports | `{pedido_id}/relatorio.pdf` | Signed URLs (1h expiry) |

### Edge Function: `hotmart-webhook`

**File:** `supabase/functions/hotmart-webhook/index.ts` (Deno)
**Endpoint:** `POST /functions/v1/hotmart-webhook`
**Deploy:** `supabase functions deploy hotmart-webhook --no-verify-jwt`
**Env vars:** Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase).

Handles 3 Hotmart events:

1. **`PURCHASE_APPROVED`:**
   - Extracts `buyer.email`, `buyer.name`, `purchase.transaction` from payload
   - Creates auth user via `supabase.auth.admin.createUser()` (if not exists)
   - Inserts row in `pedidos` with `status: 'aguardando_prints'`
   - Generates magic link email via `supabase.auth.admin.generateLink()` redirecting to `/enviar`

2. **`PURCHASE_REFUNDED` / `PURCHASE_CHARGEBACK`:**
   - Updates pedido status to `reembolsado` matching `hotmart_transaction`

### Supabase Queries Used Per Page

**`/enviar` (buyer uploads prints):**
```javascript
// Fetch latest pedido for logged-in user
db.from('pedidos').select('*').eq('email', session.user.email)
  .order('criado_em', { ascending: false }).limit(1).single();

// Upload print images to storage
db.storage.from('prints').upload(path, file, { upsert: true });

// Save print references
db.from('prints').insert([{ pedido_id, storage_path }]);

// Save questionnaire answers
db.from('respostas').insert({ pedido_id, fase_relacionamento, preocupacao_principal, contexto_adicional });

// Update order status
db.from('pedidos').update({ status: 'prints_enviados' }).eq('id', pedidoId);
```

**`/minha-analise` (buyer checks status):**
```javascript
// Fetch pedido
db.from('pedidos').select('*').eq('email', session.user.email)
  .order('criado_em', { ascending: false }).limit(1).single();

// Fetch report (if analise_concluida)
db.from('relatorios').select('storage_path').eq('pedido_id', pedido.id).single();

// Generate signed download URL
db.storage.from('relatorios').createSignedUrl(relatorio.storage_path, 3600);
```

**`/admin` (admin manages orders):**
```javascript
// List all orders
db.from('pedidos').select('*').order('criado_em', { ascending: false });

// Fetch order details (parallel)
db.from('respostas').select('*').eq('pedido_id', pedido.id).single();
db.from('prints').select('*').eq('pedido_id', pedido.id).order('criado_em');
db.from('relatorios').select('*').eq('pedido_id', pedido.id).single();

// Signed URLs for print thumbnails
db.storage.from('prints').createSignedUrl(p.storage_path, 3600);

// Upload PDF report
db.storage.from('relatorios').upload(path, file, { upsert: true, contentType: 'application/pdf' });

// Save/update report reference
db.from('relatorios').upsert({ pedido_id, storage_path }, { onConflict: 'pedido_id' });

// Mark as concluded
db.from('pedidos').update({ status: 'analise_concluida' }).eq('id', pedidoId);
```

---

## Hotmart Integration

**Checkout URL:** `https://pay.hotmart.com/W104658249V` (R$67, single payment)
**Webhook:** Hotmart sends POST to the Supabase Edge Function on purchase/refund events.

**Webhook payload structure (relevant fields):**
```json
{
  "event": "PURCHASE_APPROVED",
  "data": {
    "buyer": { "email": "...", "name": "..." },
    "purchase": { "transaction": "..." }
  }
}
```

The landing page (`index.html`) has 4 CTA buttons all linking to the Hotmart checkout URL.

---

## Auth Pattern

All authenticated pages use `getSession()` inside an `init()` function — the same reliable pattern across all pages. Magic link tokens in the URL hash are handled by waiting for `onAuthStateChange` before calling `getSession()`. Pattern:

```javascript
async function init() {
  // If magic link token in URL, wait for Supabase to process it
  if (window.location.hash.includes('access_token')) {
    await new Promise(resolve => {
      db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) resolve(session);
        else if (event === 'INITIAL_SESSION') resolve(null);
      });
    });
  }

  const session = await getSession();
  if (!session) { window.location.href = '/entrar'; return; }
  await loadPage(session);
}
init();
```

**Do NOT use `onAuthStateChange` as the sole auth check** — it can fire `INITIAL_SESSION` with null before the session loads from localStorage, causing redirect loops.

**Login page (`/entrar`):** Password-based login (`signInWithPassword`) as primary method. Magic link (`signInWithOtp`) as fallback. Client-side rate limiting: 3 failed attempts = 30s lockout.

**Redirect logic:** After login, admin (`contato@real4d.me`) goes to `/admin`, everyone else goes to `/enviar`. The `/enviar` page further redirects based on pedido status: `analise_concluida` → `/minha-analise`, `prints_enviados` → shows waiting screen.

---

## CSS Variables

```
--primary: #d4186b    --bg: #07070e       --text: #eeeef4
--muted: #6e7a94      --bg-alt: #0d0d1c   --border: rgba(255,255,255,0.07)
```

## Key Gotchas

- **Browser caching:** The dev server (`server.py`) sends `Cache-Control: no-store` headers. Without it, cached HTML causes stale auth code to execute. Always use `server.py` for local testing, never `python3 -m http.server`.
- **Magic link redirect:** OTP magic links redirect to `https://real4d.me/...`, so they don't work locally. Use password login for local testing.
- **Signed URLs expire in 1 hour** (3600s) — used for both prints and reports.
- **Language:** All UI text is in Portuguese (PT-BR).
- **Supabase JS loaded via CDN:** `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (no npm/build step).
