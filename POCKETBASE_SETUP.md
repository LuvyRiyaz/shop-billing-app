# PocketBase Setup — Multi-Tenant Shop Billing

This document is the single source of truth for the PocketBase backend: every
collection, every field, and the **exact** API Rule string configured for it.
Apply these either via the Admin UI (Settings → Import collections) using the
accompanying `pb_schema.json` (generated from this doc) or by hand — but this
file is authoritative if the two ever disagree.

## 0. Principles

- **Default deny.** Every rule below is explicit. If a rule is not listed, it
  is left as PocketBase's default `null` (nobody but a superuser can do it).
- **Tenant isolation lives here, not in the UI.** `shop_id = @request.auth.shop_id`
  appears in every tenant-scoped rule. The Next.js app is never trusted as a
  security boundary.
- **Stock mutation is server-side.** Clients never write `products.stock_qty`
  directly for a sale. A PocketBase hook (`pb_hooks/main.pb.js`, §7) decrements
  stock atomically when `invoice_items` are created and relies on PocketBase's
  built-in realtime broadcast to push the updated `products` record to every
  subscribed client in the same shop.

---

## 1. Collection: `shops`

Tenant root. Created by a superuser during onboarding (no self-serve signup
in v1 — a new shop is provisioned by you).

| Field       | Type                              | Notes                              |
|-------------|------------------------------------|-------------------------------------|
| name        | text (required)                    | Shop display name                   |
| type        | select (required): `paint`, `wood`, `agency` | Drives adaptive UI    |
| gst_number  | text                                | 15-char GSTIN, optional             |
| address     | text                                |                                      |
| phone       | text                                |                                      |
| logo        | file (image, single)                |                                      |
| is_active   | bool (default true)                 | Kill switch for a tenant            |

**API Rules**

```
listRule:   @request.auth.id != "" && id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && id = @request.auth.shop_id
createRule: null
updateRule: @request.auth.id != "" && id = @request.auth.shop_id && @request.auth.role = "owner"
deleteRule: null
```

`createRule`/`deleteRule` stay `null` — provisioning/removing a tenant is an
admin-only operation done from the PocketBase Admin UI or the CLI, never
through the app API.

---

## 2. Collection: `users` (built-in `auth` collection, extended)

Extend PocketBase's default `users` auth collection — do **not** create a
separate staff collection, since `@request.auth.*` in rules only resolves
fields that live on the authenticated auth record itself.

| Field    | Type                                            | Notes                        |
|----------|--------------------------------------------------|-------------------------------|
| name     | text (required)                                   |                                |
| shop_id  | relation → `shops` (required, single)             | Tenant pin for this user       |
| role     | select (required): `owner`, `cashier`, `manager`  |                                |
| phone    | text                                               |                                |
| is_active| bool (default true)                                | Disable a staff login          |

**API Rules**

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
viewRule:   @request.auth.id != "" && (id = @request.auth.id || (shop_id = @request.auth.shop_id && @request.auth.role = "owner"))
createRule: @request.auth.id != "" && @request.auth.role = "owner" && shop_id = @request.auth.shop_id
updateRule: @request.auth.id != "" && (id = @request.auth.id || (@request.auth.role = "owner" && shop_id = @request.auth.shop_id))
deleteRule: @request.auth.id != "" && @request.auth.role = "owner" && shop_id = @request.auth.shop_id && id != @request.auth.id
manageRule: @request.auth.id != "" && @request.auth.role = "owner" && shop_id = @request.auth.shop_id && id != @request.auth.id
```

`manageRule` is a distinct rule auth collections have in the Admin UI
(Collection → Options → "Manage rule"), separate from the four above —
confirmed from PocketBase source (`core/collection_model_auth_options.go`):
*"ManageRule gives admin-like permissions to allow fully managing the auth
record(s), eg. changing the password without requiring to enter the old
one... This rule is executed in addition to the Create and Update API
rules."* Without it, an owner's `pb.collection("users").update(staffId,
{password, passwordConfirm})` call is rejected — PocketBase only allows a
password change without the old one when `manageRule` passes. It's scoped
identically to the others (same shop only, and `id != @request.auth.id` so
an owner can't use "manage" to reset their own password and lock out of an
intentional change) — this is **not** a blanket admin bypass, only a
narrower same-shop permission for exactly this one operation
(app/(owner)/staff/actions.ts's `resetStaffPassword`).

Notes:
- Only an `owner` can create/list/delete staff accounts for their own shop
  — a `manager` has none of these permissions, matching "manager: reports +
  stock, no user management" from the original spec. The Staff Management
  page (`app/(owner)/staff/page.tsx`) is gated with `requireRole(["owner"])`
  only, not `["owner", "manager"]` like Products/Reports.
- Any user can view/update their own record (e.g. change their own phone),
  but only an `owner` can edit someone else's `role`/`is_active`.
- `deleteRule` blocks an owner from deleting themselves (`id != @request.auth.id`),
  preventing an accidental lockout.
- `role`/`shop_id` must never be client-writable by a non-owner in practice —
  re-verify this server-side (see §8) since PocketBase update rules don't
  support field-level restriction; a cashier technically *could* submit a
  `role` field in their own self-update request body and the rule above would
  still pass it (`id = @request.auth.id` is true). **Mitigation:** never call
  `users` update from a non-owner UI surface for anything but `name`/`phone`;
  enforce this in a server action before forwarding to PocketBase (§8), and
  additionally lock it down with a `pb_hooks` `onRecordUpdateRequest` guard
  (§7.3) that rejects `role`/`shop_id` changes unless the actor is an owner.

---

## 3. Collection: `products`

Adaptive fields per `shop.type`. All type-specific fields exist on one
collection (simpler rules, one realtime channel) and the UI shows/hides by
`shop.type`.

| Field             | Type                                   | Used by           |
|-------------------|------------------------------------------|---------------------|
| shop_id           | relation → `shops` (required)             | all                 |
| name              | text (required)                            | all                 |
| sku               | text                                        | all                 |
| category          | text                                        | all                 |
| category_type     | select (required, default `paint`): `paint`, `hardware`, `service` | all — see note below |
| pack_size         | text (e.g. `"20 L"`, `"1 Kg"`)              | all                 |
| hsn_code          | text                                        | all                 |
| gst_rate          | number (default 0)                          | all                 |
| unit              | select: `nos`, `L`, `ml`, `Kg`, `gram`, `cft`, `sqft` | all       |
| price             | number (required)                           | all                 |
| cost_price        | number                                       | all                 |
| stock_qty         | number (default 0)                           | all                 |
| low_stock_threshold | number (default 5)                        | all                 |
| reorder_level     | number (default 0)                           | all — see note below |
| expiry_date       | date, optional                                | all — paint/chemicals mainly |
| is_active         | bool (default true)                          | all                 |
| shade_code        | text                                          | paint               |
| color_base        | text                                          | paint               |
| length_in         | number                                        | wood                |
| width_in          | number                                        | wood                |
| thickness_in      | number                                        | wood                |
| cft               | number                                        | wood (computed, stored) |
| wholesale_price   | number                                        | agency              |
| scheme            | text                                          | agency              |

`category_type` exists on every shop's products (it's one shared collection
across shop types, like everything else here), but it's only meaningfully
branched on in the UI for `paint` shops today: a real paint shop bills
paints (`category_type = "paint"`, with `shade_code`/`pack_size`) and
hardware accessories (putty blades, rollers, sanding paper —
`category_type = "hardware"`) together on the same GST invoice. Wood/agency
shops leave it at the default `"paint"` value, which is inert for them since
their product forms don't branch on it (see ProductGrid.tsx). `service` is
reserved for a non-stock line item (e.g. a delivery charge) — nothing reads
it yet, added now so the enum doesn't need a migration later.

**`reorder_level` vs `low_stock_threshold` — not a duplicate.** These are
two different alert tiers, not the same field twice: `low_stock_threshold`
(existing) is the softer "keep an eye on this" warning, `reorder_level`
(new) is "act now" critical — typically set lower than
`low_stock_threshold`. `lib/alerts.ts`'s `getStockAlerts()` treats a product
as **critical** (red) when `stock_qty <= reorder_level` *and* `reorder_level
> 0` (0 means "no critical tier configured for this product" — same 0-means-
unset idiom already used for `customers.credit_limit`), and **warning**
(amber) when `stock_qty <= low_stock_threshold` but not already critical. An
owner who only ever sets `low_stock_threshold` (the pre-existing field) gets
exactly the old single-tier amber-only behavior; `reorder_level` is purely
additive.

**API Rules**

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
createRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "owner" || @request.auth.role = "manager")
updateRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "owner" || @request.auth.role = "manager")
deleteRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
```

Cashiers can read products (to bill) but never create/edit/delete them —
stock changes for a sale go through `invoice_items` + the hook in §7, not a
direct `products` update from the billing screen.

---

## 4. Collection: `customers`

| Field         | Type                          |
|---------------|--------------------------------|
| shop_id       | relation → `shops` (required)  |
| name          | text (required)                 |
| phone         | text                             |
| address       | text                             |
| gst_number    | text                             |
| credit_limit  | number (default 0)               |
| current_due   | number (default 0)               |
| is_active     | bool (default true)              |

**API Rules**

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
createRule: @request.auth.id != "" && shop_id = @request.auth.shop_id
updateRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "owner" || @request.auth.role = "manager")
deleteRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
```

`createRule` is open to any authenticated staff of the shop (including
cashier) so a walk-in customer can be added mid-sale. `updateRule` excludes
cashier — credit limit changes need owner/manager.

---

## 5. Collection: `invoices`

| Field          | Type                                                        |
|----------------|---------------------------------------------------------------|
| shop_id        | relation → `shops` (required)                                  |
| invoice_number | text (required, unique per shop — enforce in hook, §7.2)       |
| customer_id    | relation → `customers` (optional — walk-in cash sale)           |
| created_by     | relation → `users` (required)                                   |
| subtotal       | number (required)                                                |
| cgst           | number (default 0)                                               |
| sgst           | number (default 0)                                               |
| igst           | number (default 0)                                               |
| discount       | number (default 0)                                               |
| total          | number (required)                                                 |
| amount_paid    | number (default 0) — collected at billing time; `total - amount_paid` is what's added to `customers.current_due` (§7.2) |
| payment_mode   | select: `cash`, `upi`, `card`, `credit`                           |
| payment_status | select: `paid`, `partial`, `unpaid` (default `paid`)              |
| salesman       | text                                                               | agency only |
| notes          | text                                                                |
| remarks        | text, optional — printed on the invoice (e.g. "Against Estimate #SE-4521"); distinct from `notes`, which is internal and never printed |
| place_of_supply | text, **optional at the schema level** (not marked required — see why below) |

**API Rules** (exactly per spec)

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
createRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "cashier" || @request.auth.role = "owner")
updateRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
deleteRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
```

Note a `manager` can view/run reports on invoices but cannot create, edit, or
delete them, matching "manager: reports + stock, no user management" and the
spec's explicit cashier/owner-only create rule.

`place_of_supply` is deliberately **not** marked required at the schema
level, even though every invoice created through the actual billing flow
will always have one: the default (`"33-Tamil Nadu"`) is applied in §7B's
route code (`body.place_of_supply || "33-Tamil Nadu"`), not as a PocketBase
field-level default, because §7B builds the record via `new Record(...)`
directly rather than through the collection's default-value pipeline. If the
field were marked required at the schema level, a record created through
the *generic* `/api/collections/invoices/records` endpoint without that
field (e.g. §9's test-prerequisite invoices, or a future Admin UI
correction) would be rejected by validation even though §7B's own callers
never hit that gap.

---

## 6. Collection: `invoice_items`

Line items. Carries its own `shop_id` (denormalized) so rules stay a flat
field comparison instead of a relation lookup.

| Field           | Type                              |
|-----------------|-------------------------------------|
| shop_id         | relation → `shops` (required)        |
| invoice_id      | relation → `invoices` (required)      |
| product_id      | relation → `products` (required)      |
| product_name    | text (required, snapshot at sale time) |
| hsn_code        | text (snapshot)                        |
| unit            | text (snapshot — e.g. `"L"`, `"Kg"`, `"nos"`; needed so a historical invoice's print layout always shows the unit actually sold, even if the product's `unit` is edited later) |
| pack_size       | text (snapshot, optional — e.g. `"20 L"`, for the printed Description column) |
| qty             | number (required)                       |
| unit_price      | number (required)                        |
| gst_rate        | number (default 0)                        |
| line_total      | number (required)                          |

**API Rules**

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
createRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "cashier" || @request.auth.role = "owner")
updateRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
deleteRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
```

---

## 7. Collection: `payments`

Records against a customer's `current_due` (udhaar collection), optionally
tied to a specific invoice.

| Field        | Type                                       |
|--------------|-----------------------------------------------|
| shop_id      | relation → `shops` (required)                  |
| customer_id  | relation → `customers` (required)               |
| invoice_id   | relation → `invoices` (optional)                 |
| amount       | number (required)                                 |
| payment_mode | select: `cash`, `upi`, `card`, `bank_transfer`     |
| recorded_by  | relation → `users` (required)                       |
| note         | text                                                 |

**API Rules**

```
listRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
viewRule:   @request.auth.id != "" && shop_id = @request.auth.shop_id
createRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && (@request.auth.role = "owner" || @request.auth.role = "manager" || @request.auth.role = "cashier")
updateRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
deleteRule: @request.auth.id != "" && shop_id = @request.auth.shop_id && @request.auth.role = "owner"
```

---

## 7A. `pb_hooks/main.pb.js` — server-side stock decrement & guards

**Target: PocketBase ≥ 0.23.0.** That release replaced the old split
`onRecordBeforeCreateRequest` / `onRecordAfterCreateRequest` pair with a
single **sync** hook — `onRecordCreateRequest(e, collection)` — that wraps
the *entire* create action: code before `e.next()` runs pre-save, `e.next()`
itself performs validation + persist, and code after it runs post-save, all
still inside the same hook invocation. Critically, `e.next()` persists using
`e.app`, so reassigning `e.app` to a transactional app instance **before**
calling `e.next()` pulls the default save into that same transaction. This
is what makes read‑modify‑write hooks here atomic. (On PocketBase < 0.23 the
old hook names don't expose this and the JS VM has no `runInTransaction`
binding — if you're pinned to an older version, do this in Go instead, not
JS.)

PocketBase loads any `*.pb.js` file in `pb_hooks/` next to the binary at
boot. Three of the four hooks below (7.1, 7.2, 7.4) follow the same shape:
open a transaction, swap `e.app` to the transactional instance, run the
extra read-modify-write inside it, then call `e.next()` so the record's own
save is part of the same transaction. Because SQLite (PocketBase's backend)
serializes writers, `runInTransaction` also means concurrent requests
against the same `shop_id` queue instead of racing. (7.3 doesn't need a
transaction — it only inspects/rejects, it never does a second write.)

### `counters` collection (internal — not client-facing)

Backs the invoice numbering scheme in §7.2. **No client ever reads or
writes this collection** — all access is via `$app`/`txApp` inside hooks,
which bypasses API rules entirely (direct DAO access), so every rule below
is `null`.

| Field        | Type                           |
|--------------|-----------------------------------|
| shop_id      | relation → `shops` (required, unique per record) |
| last_number  | number (default 0)                  |

```
listRule:   null
viewRule:   null
createRule: null
updateRule: null
deleteRule: null
```

Add a **unique index on `shop_id`** (Admin UI → `counters` → Indexes), and
separately a **unique compound index on `invoices` (`shop_id`,
`invoice_number`)** — the hook's transaction prevents the race in practice,
but the DB-level unique constraint is the backstop if that logic is ever
changed or bypassed.

```javascript
/// <reference path="../pb_data/types.d.ts" />

// 7.1 — Decrement stock atomically when an invoice line item is created.
// Runs INSIDE the create request's own transaction (not after-the-fact),
// so concurrent billing counters serialize on the same product row instead
// of racing. Also rejects a forged product_id that belongs to another shop
// (cross-tenant product injection).
onRecordCreateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp

    const item = e.record
    const product = txApp.findRecordById("products", item.get("product_id"))

    if (product.get("shop_id") !== item.get("shop_id")) {
      throw new BadRequestError("Product does not belong to this shop")
    }

    const newQty = product.getFloat("stock_qty") - item.getFloat("qty")
    if (newQty < 0) {
      // Already blocked client-side via Zod + a pre-submit stock check,
      // but never trust that alone — reject the mutation server-side too.
      throw new BadRequestError("Insufficient stock for " + product.getString("name"))
    }

    product.set("stock_qty", newQty)
    txApp.save(product)

    e.next() // persists `item` itself inside this same transaction
  })
}, "invoice_items")

// 7.2 — Combined invoices hook: (a) server-assigned, gap-free, never-reused
// invoice_number via a per-shop `counters` row, and (b) the credit/udhaar
// mirror image of §7.4 — crediting an invoice's unpaid portion onto
// customers.current_due. Both run in ONE transaction (not two nested ones)
// for clarity and to avoid an extra round trip.
onRecordCreateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp

    // (a) invoice numbering
    const shopId = e.record.get("shop_id")
    let counter
    try {
      counter = txApp.findFirstRecordByFilter("counters", "shop_id = {:shopId}", { shopId })
    } catch (err) {
      const collection = txApp.findCollectionByNameOrId("counters")
      counter = new Record(collection, { shop_id: shopId, last_number: 0 })
    }

    const next = counter.getInt("last_number") + 1
    counter.set("last_number", next)
    txApp.save(counter)

    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "")
    e.record.set("invoice_number", `INV-${today}-${String(next).padStart(6, "0")}`)

    // (b) credit/udhaar increment — mirrors the decrement in §7.4
    const total = e.record.getFloat("total")
    const amountPaid = e.record.getFloat("amount_paid")
    if (amountPaid > total) {
      throw new BadRequestError("amount_paid cannot exceed total")
    }

    const dueIncrement = total - amountPaid
    if (dueIncrement > 0) {
      const customerId = e.record.get("customer_id")
      if (!customerId) {
        throw new BadRequestError("A credit sale (unpaid balance) requires a customer")
      }

      const customer = txApp.findRecordById("customers", customerId)
      if (customer.get("shop_id") !== e.record.get("shop_id")) {
        throw new BadRequestError("Customer does not belong to this shop")
      }

      const currentDue = customer.getFloat("current_due")
      const creditLimit = customer.getFloat("credit_limit")
      const newDue = currentDue + dueIncrement

      if (creditLimit > 0 && newDue > creditLimit) {
        throw new BadRequestError(
          "Credit limit exceeded: due would be " + newDue + ", limit is " + creditLimit
        )
      }

      customer.set("current_due", newDue)
      txApp.save(customer)
    }

    e.next()
  })
}, "invoices")

// 7.3 — Non-owners may only touch name/phone on their own user record, even
// though the updateRule in §2 technically lets them submit the request.
onRecordUpdateRequest((e) => {
  const actor = e.auth
  const isSelf = actor && actor.id === e.record.id
  const isOwner = actor && actor.get("role") === "owner"

  if (isSelf && !isOwner) {
    const before = $app.findRecordById("users", e.record.id)
    if (e.record.get("role") !== before.get("role") ||
        e.record.get("shop_id") !== before.get("shop_id")) {
      throw new ForbiddenError("Only an owner can change role or shop assignment")
    }
  }
  e.next()
}, "users")

// 7.4 — Recording a payment must reduce the customer's current_due in the
// same transaction. createRule (§7) lets cashier/manager/owner create a
// payment, but customers.updateRule (§4) excludes cashier — so without this
// hook a cashier-recorded udhaar payment would never actually reduce the
// due. Also rejects a forged customer_id from another shop and blocks
// overpayment past the current due.
onRecordCreateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp

    const payment = e.record
    const customer = txApp.findRecordById("customers", payment.get("customer_id"))

    if (customer.get("shop_id") !== payment.get("shop_id")) {
      throw new BadRequestError("Customer does not belong to this shop")
    }

    const amount = payment.getFloat("amount")
    const currentDue = customer.getFloat("current_due")
    if (amount > currentDue) {
      throw new BadRequestError("Payment of " + amount + " exceeds outstanding due of " + currentDue)
    }

    customer.set("current_due", currentDue - amount)
    txApp.save(customer)

    e.next()
  })
}, "payments")
```

---

## 7B. Custom atomic route — `POST /api/custom/create-invoice`

**Why this exists.** While building the billing page (Deliverable 3) it became
clear that §7A's per-collection hooks only make *each individual record's*
write atomic — they don't make "create one invoice + N invoice_items" atomic
as a whole, because that requires N+1 separate HTTP calls to the generic
`/api/collections/{c}/records` endpoint. If item 3 of 5 fails (e.g. another
cashier just sold the last unit), items 1-2 and the invoice header would
already be committed unless something unwinds them — and unwinding via a
second `DELETE` call doesn't work cleanly anyway: a cashier's token can create
`invoice_items` but the `deleteRule` only allows `owner` (§6), so a cashier
can't even clean up their own failed order, and a delete alone wouldn't
restore the stock that was already decremented.

The correct fix is a single custom PocketBase route that does the entire
order — numbering, per-line stock checks/decrements, totals, the credit/due
increment — inside **one** `runInTransaction`, so a failure anywhere rolls
back everything via normal SQLite transaction rollback, with nothing to
compensate for afterwards. This route is what the billing page's server
action (`app/(cashier)/billing/actions.ts`) calls, instead of creating the
`invoices`/`invoice_items` records one at a time through the generic
endpoints.

The §6/§5 `createRule`s and the §7A per-collection hooks are left exactly as
documented — they still protect the generic `/api/collections/invoices` and
`/api/collections/invoice_items` endpoints for any other caller (e.g. an
owner doing a manual correction from the Admin UI, or a future admin tool),
they just aren't the path the billing screen itself uses anymore. Note this
route also re-derives `unit_price`/`gst_rate`/`product_name` from the
`products` record server-side rather than trusting the request body — only
`product_id` and `qty` are taken from the client — so a tampered cart
payload can't under/over-charge or forge a product name.

Append this to `pb_hooks/main.pb.js`:

```javascript
routerAdd("POST", "/api/custom/create-invoice", (e) => {
  if (!e.auth) {
    throw new UnauthorizedError("Authentication required")
  }

  const role = e.auth.get("role")
  if (role !== "cashier" && role !== "owner") {
    throw new ForbiddenError("Only a cashier or owner can create invoices")
  }

  const body = e.requestInfo().body
  const shopId = body.shop_id
  const items = body.items

  if (e.auth.get("shop_id") !== shopId) {
    throw new BadRequestError("Shop mismatch")
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestError("At least one item is required")
  }

  /** @type {{ id: string, invoice_number: string } | undefined} */
  let result

  // runInTransaction is synchronous — it blocks until the callback returns
  // (commit) or throws (rollback). `result` is only assigned on the
  // success path inside the callback, so by the time execution reaches
  // e.json() below, either the transaction has already committed and
  // `result` is set, or an error was thrown and this line is never
  // reached at all (PocketBase's router converts the thrown ApiError into
  // the HTTP error response itself). There's no window where a half-built
  // or pre-commit `result` could be sent to the client.
  e.app.runInTransaction((txApp) => {
    // (a) invoice numbering — identical logic to §7.2
    let counter
    try {
      counter = txApp.findFirstRecordByFilter("counters", "shop_id = {:shopId}", { shopId })
    } catch (err) {
      const countersCollection = txApp.findCollectionByNameOrId("counters")
      counter = new Record(countersCollection, { shop_id: shopId, last_number: 0 })
    }
    const next = counter.getInt("last_number") + 1
    counter.set("last_number", next)
    txApp.save(counter)
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "")
    const invoiceNumber = `INV-${today}-${String(next).padStart(6, "0")}`

    // (b) price every line server-side and decrement stock per line
    let subtotal = 0
    let gstTotal = 0
    const lineSnapshots = []

    for (const line of items) {
      const product = txApp.findRecordById("products", line.product_id)
      if (product.get("shop_id") !== shopId) {
        throw new BadRequestError("Product does not belong to this shop")
      }

      const qty = Number(line.qty)
      if (!(qty > 0)) {
        throw new BadRequestError("Invalid quantity for " + product.getString("name"))
      }

      const newStock = product.getFloat("stock_qty") - qty
      if (newStock < 0) {
        throw new BadRequestError("Insufficient stock for " + product.getString("name"))
      }
      product.set("stock_qty", newStock)
      txApp.save(product)

      const unitPrice = product.getFloat("price")
      const gstRate = product.getFloat("gst_rate")
      const lineTotal = unitPrice * qty
      subtotal += lineTotal
      gstTotal += lineTotal * (gstRate / 100)

      lineSnapshots.push({
        product_id: product.id,
        product_name: product.getString("name"),
        hsn_code: product.getString("hsn_code"),
        // Snapshotted, same reasoning as product_name/hsn_code above: the
        // printed invoice must show what was actually sold even if the
        // product's own unit/pack_size is edited afterwards. unit_price,
        // gst_rate, and name are already re-derived from the product
        // record rather than trusted from the client — unit/pack_size
        // follow the same rule (the client only ever sends product_id+qty).
        unit: product.getString("unit"),
        pack_size: product.getString("pack_size"),
        qty: qty,
        unit_price: unitPrice,
        gst_rate: gstRate,
        line_total: lineTotal,
      })
    }

    const discount = Number(body.discount) || 0
    const amountPaid = Number(body.amount_paid) || 0
    const total = Math.max(0, subtotal + gstTotal - discount)

    let paymentStatus = "unpaid"
    if (amountPaid >= total) paymentStatus = "paid"
    else if (amountPaid > 0) paymentStatus = "partial"

    // (c) credit/udhaar increment — identical logic to §7.2(b)
    const dueIncrement = total - amountPaid
    const customerId = body.customer_id || ""
    if (dueIncrement > 0) {
      if (!customerId) {
        throw new BadRequestError("A credit sale (unpaid balance) requires a customer")
      }
      const customer = txApp.findRecordById("customers", customerId)
      if (customer.get("shop_id") !== shopId) {
        throw new BadRequestError("Customer does not belong to this shop")
      }
      const currentDue = customer.getFloat("current_due")
      const creditLimit = customer.getFloat("credit_limit")
      const newDue = currentDue + dueIncrement
      if (creditLimit > 0 && newDue > creditLimit) {
        throw new BadRequestError(
          "Credit limit exceeded: due would be " + newDue + ", limit is " + creditLimit
        )
      }
      customer.set("current_due", newDue)
      txApp.save(customer)
    }

    // (d) persist invoice + line items
    const invoicesCollection = txApp.findCollectionByNameOrId("invoices")
    const invoice = new Record(invoicesCollection, {
      shop_id: shopId,
      invoice_number: invoiceNumber,
      customer_id: customerId || null,
      created_by: e.auth.id,
      subtotal: subtotal,
      cgst: gstTotal / 2,
      sgst: gstTotal / 2,
      igst: 0,
      discount: discount,
      total: total,
      amount_paid: amountPaid,
      payment_mode: body.payment_mode,
      payment_status: paymentStatus,
      salesman: body.salesman || "",
      notes: body.notes || "",
      remarks: body.remarks || "",
      // Default applied here in code, not as a PocketBase field-level
      // default — this route builds the Record directly via `new Record()`
      // rather than going through the collection's default-value pipeline,
      // so that pipeline never runs for this path.
      place_of_supply: body.place_of_supply || "33-Tamil Nadu",
    })
    txApp.save(invoice)

    const itemsCollection = txApp.findCollectionByNameOrId("invoice_items")
    for (const line of lineSnapshots) {
      const item = new Record(itemsCollection, Object.assign({
        shop_id: shopId,
        invoice_id: invoice.id,
      }, line))
      txApp.save(item)
    }

    result = { id: invoice.id, invoice_number: invoiceNumber }
  })

  return e.json(200, result)
}, $apis.requireAuth())
```

`$apis.requireAuth()` rejects unauthenticated requests before the handler
body runs (a second, redundant check alongside the explicit `e.auth` guard
inside — cheap insurance, not a real gap). `txApp.save(record)` runs the
collection's full field validation (required fields, select enum values,
relation existence) exactly like the REST API would, even though this
bypasses the REST `createRule` — the role/shop checks above are this route's
own replacement for that rule.

**On `unit` (`nos`/`L`/`Kg`/etc.):** totals (`subtotal`, `gstTotal`, `total`)
are computed purely from `unitPrice * qty` and `gst_rate` — `unit` is never
read anywhere in the math, only snapshotted for display. Changing the enum
from `pcs`/`litre` to `nos`/`L`/`Kg`/`gram` has zero effect on correctness
here; it only changes what string ends up in the printed Units/Per column.

**Unit tests for the stock/credit-limit math.** `lib/invoice-math.ts` is a
pure, hand-kept-in-sync mirror of this route's arithmetic (stock decrement,
payment status, due increment, credit-limit check, line totals), with real
Node-native tests in `lib/invoice-math.test.ts` (`npm test`) — covers the
exact-boundary cases (`qty === stock`, `newDue === creditLimit`) that are
easy to get an off-by-one wrong on. It is **not** imported by this hook file
(Goja's JS VM can't import from the Next.js codebase) — if you change the
arithmetic here, update that file too. The curl-based tests in §9 remain the
only thing that actually exercises *this* file, since they're the only
tests that run against a live PocketBase instance.

**Does `txApp.save()` here re-trigger the §7A `onRecordCreateRequest` hooks
and double-decrement stock / double-increment `current_due` / double-advance
the invoice counter? No** — confirmed from `pocketbase/pocketbase` source
(`github.com/pocketbase/pocketbase`, package `core`), not assumed:

- `core/db.go`, `(app *BaseApp) create()` (the function `Save()` →
  `SaveWithContext()` → `save()` → `create()` actually calls for a new
  record) only triggers `OnModelCreate()`, `OnModelCreateExecute()`,
  `OnModelAfterCreateSuccess()`/`OnModelAfterCreateError()`. It has no
  reference anywhere to `OnRecordCreateRequest`.
- `core/record_model.go`, `(app *BaseApp) registerRecordHooks()` is what
  bridges those generic model hooks to Record-specific ones *when the saved
  model is a `*Record`* — e.g. `OnModelCreate` → `OnRecordCreate` (no
  "Request" suffix), `OnModelAfterCreateSuccess` → `OnRecordAfterCreateSuccess`.
  This bridging function never mentions `OnRecordCreateRequest` either.
- `apis/record_crud.go`, `recordCreate()` — this is the *only* place in the
  entire codebase that triggers `OnRecordCreateRequest` ("CreateRequest",
  plural, carries `*RecordRequestEvent` — an HTTP request/response pair).
  It's wired into the router for `POST /api/collections/{collection}/records`
  specifically, not into `core.App`'s save pipeline at all.

So `OnRecordCreateRequest` and `OnRecordCreate`/`OnModelCreate` are two
disjoint hook families: one fires only for that specific REST endpoint, the
other fires for every `app.Save()` call regardless of caller. Our §7A hooks
are all registered via `onRecordCreateRequest(...)` (the JS binding for the
REST-only family), so a direct `txApp.save(invoice)` / `txApp.save(item)`
from this custom route never reaches them. The §7A hooks still protect the
generic `/api/collections/invoices` and `/api/collections/invoice_items`
endpoints for any other caller (Admin UI corrections, etc.) exactly as
before — the two code paths don't interact. §9 Test 5 below proves this
empirically (stock drops by exactly the ordered quantity once, due
increases once) as a second line of defense against this ever regressing,
e.g. if a future PocketBase version changes this wiring.

---

## 8. Defense in depth (do not skip)

- **Zod on the client** validates shape/ranges before a request is sent —
  this is UX, not security.
- **Re-verify role server-side** on every mutating Next.js server action
  before it forwards to PocketBase: read the role out of the *verified*
  PocketBase auth cookie/token server-side, never out of a client-supplied
  prop or React context. The PocketBase API Rule is the real boundary; the
  server action check is a second independent check so a bug in one rule
  string doesn't become the only thing standing between a cashier and a
  delete.
- **Secrets**: only `NEXT_PUBLIC_POCKETBASE_URL` is public. PocketBase admin
  email/password, SMTP credentials, and any superuser API key live only in
  server-side env vars (`POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`,
  used only inside server actions / route handlers, never in a `"use client"`
  file or bundled into client JS).
- **Cross-tenant injection via forged relation IDs**: `invoice_items.shop_id
  = @request.auth.shop_id` in the API rule only proves the *item* belongs to
  the caller's shop — it says nothing about the `product_id` it points to.
  A cashier could otherwise submit a `product_id` from a different shop
  (IDs are guessable/enumerable) to read or corrupt another tenant's stock.
  The §7.1 hook explicitly checks `product.shop_id === item.shop_id` and
  rejects the request if they differ. The same pattern applies to
  `payments.customer_id` vs `payments.shop_id` (checked in §7.4) and should
  be applied to any future collection that references another tenant-scoped
  collection by ID — an API rule filtering the record being written is not
  enough when that record also carries a foreign relation into the same
  tenant-scoped space.

---

## 9. Test plan — hooks (§7A)

These tests hit the **generic** `/api/collections/{c}/records` endpoints
directly, to prove the §7A per-collection hooks still defend that surface on
their own (e.g. an owner correcting data from the Admin UI goes through this
path). The billing page itself calls `POST /api/custom/create-invoice` (§7B)
instead, which exercises the same invariants in a single transaction — that
route doesn't need a separate concurrency test here since it has no
multi-request window to race in.

Run against a fresh PocketBase ≥0.23 instance with the schema in §1–§7
imported, `pb_hooks/main.pb.js` in place, and one `shops` row + one `owner`
user + one `cashier` user already created via the Admin UI. Replace
`$PB`, `$TOKEN_OWNER`, `$TOKEN_CASHIER`, `$SHOP`, `$PRODUCT`, `$CUSTOMER`
with real values (get tokens from `POST /api/collections/users/auth-with-password`).

**0. Shared prerequisite — create a parent invoice.** `invoice_items` always
belongs to an `invoices` record (`invoice_id` is required), so every test
below that creates line items needs one first. Run this once and capture
`$INVOICE` before Test 1:

```bash
INVOICE=$(curl -s -X POST "$PB/api/collections/invoices/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"created_by\":\"$CASHIER_ID\",\"subtotal\":1200,\"total\":1200,\"amount_paid\":1200,\"payment_mode\":\"cash\",\"payment_status\":\"paid\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "INVOICE=$INVOICE"
```

**1. Concurrent stock decrement** — seed one product at `stock_qty = 100`,
fire two concurrent `qty = 60` invoice_items creates **against `$INVOICE`
from step 0**, exactly one must succeed and final stock must be `40`, never
`-20` or `100`:

```bash
# seed
curl -s -X PATCH "$PB/api/collections/products/records/$PRODUCT" \
  -H "Authorization: $TOKEN_OWNER" -d '{"stock_qty":100}' > /dev/null

# fire both in the background, nearly simultaneously
for i in 1 2; do
  curl -s -o "/tmp/resp_$i.json" -w "%{http_code}\n" -X POST \
    "$PB/api/collections/invoice_items/records" \
    -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
    -d "{\"shop_id\":\"$SHOP\",\"invoice_id\":\"$INVOICE\",\"product_id\":\"$PRODUCT\",\"product_name\":\"Test\",\"qty\":60,\"unit_price\":10,\"line_total\":600}" &
done
wait

# expect: one 200, one 400 ("Insufficient stock...")
cat /tmp/resp_1.json /tmp/resp_2.json

# verify final stock is exactly 40
curl -s "$PB/api/collections/products/records/$PRODUCT" -H "Authorization: $TOKEN_OWNER" | grep stock_qty
```
Also repeat with both at `qty = 40` (both should succeed, 100 → 20) to prove
the transaction isn't over-serializing unrelated-but-valid writes.

**2. Invoice number monotonicity after delete** — create 5 invoices
(`#1..#5`), delete `#3`, create one more, confirm the new one is `#6`, not a
reused `#3`:

```bash
for i in 1 2 3 4 5; do
  curl -s -X POST "$PB/api/collections/invoices/records" \
    -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
    -d "{\"shop_id\":\"$SHOP\",\"created_by\":\"$CASHIER_ID\",\"subtotal\":100,\"total\":100,\"amount_paid\":100,\"payment_mode\":\"cash\",\"payment_status\":\"paid\"}" \
    | tee -a /tmp/invoices.jsonl
done
# grab invoice_number + id of the 3rd created record, then:
curl -s -X DELETE "$PB/api/collections/invoices/records/$INVOICE_3_ID" -H "Authorization: $TOKEN_OWNER"

curl -s -X POST "$PB/api/collections/invoices/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"created_by\":\"$CASHIER_ID\",\"subtotal\":100,\"total\":100,\"amount_paid\":100,\"payment_mode\":\"cash\",\"payment_status\":\"paid\"}" \
  | grep invoice_number
# expect INV-YYYYMMDD-000006, never 000003 again
```

**3. Credit invoice increments due; payment decrements due; overpayment
rejected** — customer starts at `current_due = 0`, `credit_limit = 1000`:

```bash
# a) credit sale of 500, amount_paid 0 -> due becomes 500
curl -s -X POST "$PB/api/collections/invoices/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"customer_id\":\"$CUSTOMER\",\"created_by\":\"$CASHIER_ID\",\"subtotal\":500,\"total\":500,\"amount_paid\":0,\"payment_mode\":\"credit\",\"payment_status\":\"unpaid\"}"
curl -s "$PB/api/collections/customers/records/$CUSTOMER" -H "Authorization: $TOKEN_OWNER" | grep current_due
# expect current_due: 500

# b) record a 200 payment -> due becomes 300
curl -s -X POST "$PB/api/collections/payments/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"customer_id\":\"$CUSTOMER\",\"amount\":200,\"payment_mode\":\"cash\",\"recorded_by\":\"$CASHIER_ID\"}"
curl -s "$PB/api/collections/customers/records/$CUSTOMER" -H "Authorization: $TOKEN_OWNER" | grep current_due
# expect current_due: 300

# c) overpayment of 9999 -> rejected with 400, due unchanged at 300
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PB/api/collections/payments/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"customer_id\":\"$CUSTOMER\",\"amount\":9999,\"payment_mode\":\"cash\",\"recorded_by\":\"$CASHIER_ID\"}"
# expect 400

# d) a further credit sale that would push due past credit_limit (1000) -> rejected
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PB/api/collections/invoices/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"customer_id\":\"$CUSTOMER\",\"created_by\":\"$CASHIER_ID\",\"subtotal\":800,\"total\":800,\"amount_paid\":0,\"payment_mode\":\"credit\",\"payment_status\":\"unpaid\"}"
# 300 + 800 = 1100 > 1000 -> expect 400
```

**4. Cross-tenant forged product_id rejected** — create a second shop
(`$SHOP_B`) with its own product (`$PRODUCT_B`), then try to bill it on an
invoice belonging to `$SHOP`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$PB/api/collections/invoice_items/records" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"invoice_id\":\"$INVOICE\",\"product_id\":\"$PRODUCT_B\",\"product_name\":\"Forged\",\"qty\":1,\"unit_price\":1,\"line_total\":1}"
# expect 400 "Product does not belong to this shop"
```
Repeat the same shape for `payments.customer_id` pointing at a customer from
`$SHOP_B` — expect the same rejection from §7.4.

**5. Custom route does not double-execute §7A's hooks.** Seed a fresh
product at `stock_qty = 100` and a customer at `current_due = 0`,
`credit_limit = 1000`. Create one invoice via `/api/custom/create-invoice`
(§7B) for `qty = 1` on that product, fully on credit (`amount_paid = 0`).
If `onRecordCreateRequest` were (wrongly) firing a second time on top of
§7B's own logic, stock would drop by 2 and the due would increase twice:

```bash
# seed
curl -s -X PATCH "$PB/api/collections/products/records/$PRODUCT" \
  -H "Authorization: $TOKEN_OWNER" -d '{"stock_qty":100,"price":50,"gst_rate":0}' > /dev/null
curl -s -X PATCH "$PB/api/collections/customers/records/$CUSTOMER" \
  -H "Authorization: $TOKEN_OWNER" -d '{"current_due":0,"credit_limit":1000}' > /dev/null

curl -s -X POST "$PB/api/custom/create-invoice" \
  -H "Authorization: $TOKEN_CASHIER" -H "Content-Type: application/json" \
  -d "{\"shop_id\":\"$SHOP\",\"customer_id\":\"$CUSTOMER\",\"payment_mode\":\"credit\",\"amount_paid\":0,\"discount\":0,\"items\":[{\"product_id\":\"$PRODUCT\",\"qty\":1}]}"

# expect stock_qty == 99 (NOT 98)
curl -s "$PB/api/collections/products/records/$PRODUCT" -H "Authorization: $TOKEN_OWNER" | grep stock_qty

# expect current_due == 50 (NOT 100) — i.e. incremented exactly once by the
# single line's total (1 × ₹50, 0% GST in this seed)
curl -s "$PB/api/collections/customers/records/$CUSTOMER" -H "Authorization: $TOKEN_OWNER" | grep current_due

# expect last_number advanced by exactly 1 for this shop's counter row
curl -s "$PB/api/collections/counters/records?filter=shop_id='$SHOP'" -H "Authorization: $TOKEN_OWNER" | grep last_number
```

If any of these come back doubled, that means `OnRecordCreateRequest` is
firing from `txApp.save()` after all (contradicting the source trace above)
and §7B must stop calling `txApp.save()` directly — it would need to build
the records via the request-form path instead, or §7A's hooks would need to
be made idempotent/mutually exclusive with this route.

---

## 10. Realtime subscription shape (reference for Deliverable 3)

Each billing screen subscribes per-shop, not globally:

```ts
pb.collection("products").subscribe("*", (e) => {
  if (e.record.shop_id === currentShopId) {
    // merge e.record into local product list / cart stock display
  }
}, { filter: `shop_id = "${currentShopId}"` })
```

PocketBase evaluates the subscription `filter` server-side against the
collection's `viewRule`, so a client can't widen it to see another shop's
stock even by editing the filter string.
