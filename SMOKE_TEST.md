# Smoke Test Checklist

Run this end-to-end after any schema or hook change. Needs: PocketBase
running with `pb_hooks/main.pb.js` applied and the schema from
`POCKETBASE_SETUP.md` imported, Next.js running against it, and at least
two shops each with one owner + one cashier (see `README.md` → Provisioning
for exact steps). Keep the PocketBase Admin UI open in a tab throughout —
you'll cross-check record values there after each step.

Shorthand used below: `SHOP_A` / `SHOP_B` (two different shops), their
`CASHIER_A` / `OWNER_A` / `CASHIER_B` logins, and a `PRODUCT` in `SHOP_A`
you've set to `stock_qty = 100`.

---

## 1. Start the stack

- [ ] `./pocketbase serve` (from wherever the PocketBase binary + `pb_hooks/`
      live) — confirm the log shows no errors loading `main.pb.js`.
- [ ] `cp .env.local.example .env.local`, fill in `NEXT_PUBLIC_POCKETBASE_URL`
      (and `POCKETBASE_INTERNAL_URL` if PocketBase isn't on localhost).
- [ ] `npm install && npm run dev` — open `http://localhost:3000`.
- [ ] Hitting `/` with no session redirects to `/billing` then to `/login`
      (middleware.ts kicking in — confirms the route gate is wired).

## 2. Cashier login → billing screen

- [ ] Log in as `CASHIER_A`. Lands on `/billing`.
- [ ] Confirm the page theme matches `SHOP_A`'s `type` (paint → green
      primary, per `app/globals.css`'s `data-shop-type` tokens).
- [ ] Product grid loads with `SHOP_A`'s active products only.

## 3. Paint item vs. hardware item on the same cart

- [ ] Add a product with `category_type = "paint"` and a `shade_code` set.
      **Check:** the card shows the round shade-color dot and "Shade
      {code} · {pack_size}" subtitle.
- [ ] Add a product with `category_type = "hardware"` (e.g. a putty blade).
      **Check:** the card shows the square "H" badge, **no** shade dot, and
      `pack_size` if set (e.g. "Pack of 10").
- [ ] In the cart panel, confirm each line shows its `unit` next to the qty
      box (e.g. "L", "Kg", "nos") — this is `CartLine.unit`, display-only,
      not sent to the server (see `lib/validators/billing.ts`).

## 4. Finalize on credit/partial — verify no double-execution

Do this with the PocketBase Admin UI open on `customers/{CUSTOMER_A}` and
`products/{PRODUCT}` so you can refresh and compare before/after.

- [ ] Note `PRODUCT.stock_qty` and `CUSTOMER_A.current_due` **before**.
- [ ] In the cart: set payment mode to **Credit**, pick `CUSTOMER_A`, leave
      "Amount paid now" at 0 (fully on credit), add a remarks note (e.g.
      "Against Seller's Estimate #SE-1"), click **Finalize bill (F4)**.
- [ ] **Check stock:** `PRODUCT.stock_qty` dropped by *exactly* the ordered
      qty — not double. (This is §9 Test 5's scenario, now exercised
      through the real UI instead of curl.)
- [ ] **Check due:** `CUSTOMER_A.current_due` increased by *exactly* the
      invoice total minus amount paid — not double.
- [ ] **Check invoice_items snapshots:** open the new `invoice_items`
      record(s) in the Admin UI — `unit` and `pack_size` should be
      populated and match the product sold, even though the client never
      sent them (§7B re-derives both server-side from the product record —
      confirmed in the route code, `unit: product.getString("unit")` /
      `pack_size: product.getString("pack_size")`, right where
      `unit_price`/`gst_rate` are already re-derived the same way).
- [ ] A "Print invoice {number}" link appears under Finalize — don't click
      yet, used in step 5.

## 5. Print preview (A4)

- [ ] Click "Print invoice {number}" from step 4 (opens in a new tab).
- [ ] **Check:** `Place of Supply` line above the items table shows what
      you set in the cart (default "33-Tamil Nadu" unless changed).
- [ ] **Check:** the items table columns read Description (with pack size
      + HSN as a sub-line) / QTY / Units / Rate / Per / Amount, in that
      order.
- [ ] **Check:** CGST/SGST rows show (IGST only appears if > 0 — it's
      always 0 today since there's no inter-state detection yet, see
      README limitations).
- [ ] **Check:** your remarks text appears at the bottom.
- [ ] Use the browser's print preview (not just the on-page view) to
      confirm the page is sized for A4, not letter/default.
- [ ] Revisit the same URL with `?layout=thermal-58` and `?layout=thermal-80`
      — confirm the layout switches to the narrow receipt format and the
      print preview's page size changes accordingly.

## 6. Owner reports — today's collection + low stock

- [ ] Log out, log in as `OWNER_A`, open `/reports`.
- [ ] **Check:** "Today's collection" shows the invoice from step 4 counted
      in `invoiceCount` and reflected in `byMode["credit"]` (this is the
      exact case the date-serialization bug would have hidden — if this
      card is empty despite the invoice existing, that bug is back).
- [ ] Set a product's `stock_qty` at/below its `low_stock_threshold` in the
      Admin UI, refresh `/reports`. **Check:** it appears under "Low stock
      alerts".
- [ ] **Check:** "Outstanding credit" total includes `CUSTOMER_A`'s updated
      `current_due` from step 4.

## 7. Realtime stock sync across two counters

- [ ] Open a second browser (or an incognito window), log in as `CASHIER_A`
      again (same shop, simulating a second billing counter).
- [ ] In browser A, add the same product used in step 4 to a new cart but
      **don't** finalize yet.
- [ ] In browser B, finalize a sale for that same product.
- [ ] **Check:** browser A's product grid updates the stock number live
      within a second or two, with no manual refresh (PocketBase realtime
      subscription in `BillingScreen.tsx`).
- [ ] **Check:** if browser A's cart already had more of that product than
      the new live stock allows, its qty clamps down automatically (the
      `useEffect` in `BillingScreen.tsx` that re-syncs cart lines against
      live `products` state).

## 8. Cross-tenant isolation

- [ ] Log in as `CASHIER_B` (a *different* shop). Confirm the billing
      screen shows **zero** of `SHOP_A`'s products/customers.
- [ ] With `CASHIER_B`'s auth token, try a direct API call for a `SHOP_A`
      record, e.g.:
      ```bash
      curl -s "$PB/api/collections/products/records/$PRODUCT" \
        -H "Authorization: $TOKEN_CASHIER_B"
      ```
      **Check:** 404/403, not the record — the `viewRule`'s
      `shop_id = @request.auth.shop_id` check should block it.
- [ ] Try billing a `SHOP_A` product through `SHOP_B`'s session by forging
      the custom route payload (§7B's `product.get("shop_id") !== shopId`
      check — §9 Test 4 shape, now against the real endpoint):
      ```bash
      curl -s -X POST "$PB/api/custom/create-invoice" \
        -H "Authorization: $TOKEN_CASHIER_B" -H "Content-Type: application/json" \
        -d "{\"shop_id\":\"$SHOP_B\",\"payment_mode\":\"cash\",\"amount_paid\":0,\"items\":[{\"product_id\":\"$PRODUCT\",\"qty\":1}]}"
      ```
      **Check:** 400 "Product does not belong to this shop".

---

If every box above checks out, the core build is verified end-to-end —
tenant isolation, realtime, the custom-route atomicity, and the new
paint+hardware/print fields are all exercised together, not just in
isolated unit-style curl tests.
