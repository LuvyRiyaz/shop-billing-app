# Shop Billing

Multi-tenant retail billing for paint, wood, and agency shops. Next.js 14
(App Router) frontend, PocketBase backend (SQLite + Auth + REST + Realtime
in a single executable).

See `POCKETBASE_SETUP.md` for the full schema, API Rules, and the
`pb_hooks/main.pb.js` source (stock decrement, invoice numbering, credit/due
tracking, and the atomic invoice-creation route). See `SMOKE_TEST.md` for an
end-to-end manual test pass. See `DEPLOYMENT.md` for deploying to production
(PocketBase on a VPS with HTTPS + backups, Next.js on Vercel) — everything
below this point is for local development only.

## Prerequisites

- Node.js 18.18+ (or 20+)
- [PocketBase](https://pocketbase.io/docs/) **≥ 0.23.0** — the hooks in
  `pb_hooks/main.pb.js` use the `onRecordCreateRequest`/`runInTransaction`
  API introduced in that release; older versions won't load them correctly.
- `pocketbase` npm package `^0.26.0` (already in `package.json`) — matches
  the SDK's `authStore.record` API (`.model` is the deprecated alias).

## Running it locally

Two processes, two terminals. A fresh PocketBase database **does** need a
superuser before you can open the Admin UI or import anything — PocketBase
ships a dedicated CLI subcommand for this (`cmd/superuser.go` in its source),
so it can be scripted instead of going through the web installer screen.

**Terminal 1 — PocketBase** (from wherever the `pocketbase`/`pocketbase.exe`
binary lives):

```powershell
# Windows PowerShell
mkdir pb_hooks
# paste the full pb_hooks/main.pb.js content from POCKETBASE_SETUP.md §7A/§7B
# into .\pb_hooks\main.pb.js, then:
.\pocketbase.exe superuser upsert owner@example.com "ChangeMe123!"
.\pocketbase.exe serve
```

```bash
# macOS/Linux equivalent
mkdir -p pb_hooks
# paste the hook source into ./pb_hooks/main.pb.js, then:
./pocketbase superuser upsert owner@example.com "ChangeMe123!"
./pocketbase serve
```

`superuser upsert` creates the account if it doesn't exist yet (and is safe
to re-run — it just updates the password if it does), so it works on a
completely fresh `pb_data` with no prior setup step. Order matters a little
less than it looks: running `upsert` before `serve` is fine, PocketBase
initializes its data directory either way.

Once `serve` is running, log into `http://127.0.0.1:8090/_/` with that email/
password, then import the collections from `POCKETBASE_SETUP.md` §1–§7 —
either by hand (Settings → Import collections, or create each collection +
field + API Rule as documented) or by scripting it with the Admin UI's
"Export collections" JSON as a starting template. Set each collection's
exact `listRule`/`viewRule`/`createRule`/`updateRule`/`deleteRule` string
from the doc — these are the real tenant-isolation boundary, not optional
polish.

**Terminal 2 — Next.js** (from the project root):

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_POCKETBASE_URL (and POCKETBASE_INTERNAL_URL if
# PocketBase isn't reachable at the same address the browser uses)
npm install
npm run dev
```

Open `http://localhost:3000` — it redirects to `/login`.

**Unit tests** (pure stock/credit-limit math, no PocketBase needed —
see `POCKETBASE_SETUP.md` §7B for what this does and doesn't cover):

```bash
npm test
```

## Provisioning a shop + users

There's no self-serve shop signup (§1 of `POCKETBASE_SETUP.md` keeps
`shops.createRule` as `null` on purpose — onboarding a new tenant is an
admin action, not an API call). From the PocketBase Admin UI:

1. **Create a shop** — `shops` collection → New record. Set `type` to
   `paint`, `wood`, or `agency` (drives the UI theme and the adaptive
   product form fields).
2. **Create an owner** — `users` collection → New record. Set `role` to
   `owner`, `shop_id` to the shop you just created, set a password. This is
   the account you'll log into `/login` with.
3. **Create a cashier/manager** the same way, with `role` set accordingly.
4. **Add a few products** — `products` collection, with that shop's
   `shop_id`. For a paint shop: set `category_type` to `paint` for actual
   paints (with `shade_code`, `pack_size` like `"20 L"`) and to `hardware`
   for accessories (putty, rollers — no shade code). Set `stock_qty`,
   `price`, `gst_rate`, `low_stock_threshold`.
5. Log in at `/login` as the owner or cashier you created.

Repeat with a second shop if you want to test cross-tenant isolation (see
`SMOKE_TEST.md` step 8).

## Known limitations

- **Profit is approximate.** `lib/reports.ts`'s profit card uses each
  product's *current* `cost_price`, not a cost-at-sale-time snapshot
  (`invoice_items` doesn't store one). If cost prices change, past months'
  profit figures shift. Fine for a directional "are we profitable" card,
  not for audited accounting.
- **No inter-state GST logic.** §7B always splits GST evenly into
  `cgst`/`sgst` and leaves `igst` at 0, regardless of `place_of_supply`.
  There's no state-comparison logic between the shop's own state and the
  customer's to decide inter-state vs intra-state tax treatment yet.
- **No offline mode.** The billing screen requires a live connection to
  PocketBase for every write (and for the realtime stock subscription); a
  dropped connection mid-sale surfaces as a failed Finalize, not a queued
  one.
- **Middleware is routing-only, not a security boundary.** `middleware.ts`
  checks the auth cookie's *shape* (a non-empty token) to decide whether to
  redirect to `/login` — it does not verify the token against PocketBase.
  The real authorization checks are `requireRole()` server-side and the
  PocketBase API Rules themselves; this is documented inline in the file.
- **No shop-admin UI for onboarding.** New shops/users are created directly
  in the PocketBase Admin UI (see Provisioning above), not through the
  Next.js app.
- **Thermal printing is CSS-only.** `InvoicePrint.tsx`'s `thermal-58`/
  `thermal-80` layouts set the right `@page` size and a narrow layout for a
  receipt printer, but there's no actual hardware/driver integration (ESC/POS
  commands, ribbon USB access, etc.) — printing still goes through the
  browser's normal print dialog.
- **`category_type: "service"`** exists in the schema (for a future
  non-stock line item like a delivery charge) but nothing reads it yet.
