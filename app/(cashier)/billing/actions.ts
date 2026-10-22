"use server"

import { cookies } from "next/headers"
import { ClientResponseError } from "pocketbase"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { createInvoiceSchema, type CreateInvoiceInput, type CreateInvoiceResult } from "@/lib/validators/billing"

/**
 * Creates an invoice and its line items by calling the custom PocketBase
 * route `POST /api/custom/create-invoice` (POCKETBASE_SETUP.md §7B).
 *
 * That route does the whole order — invoice numbering, per-line stock
 * decrement, totals, and the credit/due increment — inside a single
 * `runInTransaction`, so a failure partway through (e.g. another cashier
 * just sold the last unit of item 3) rolls back everything atomically.
 * This action deliberately does NOT create `invoices`/`invoice_items`
 * records one at a time via `pb.collection(...).create()`: an earlier
 * version did that and needed a manual compensating delete on failure,
 * which doesn't actually work — a cashier's token can create
 * `invoice_items` but the collection's `deleteRule` is owner-only (§6), so
 * the compensation itself would be rejected, and a delete wouldn't restore
 * stock either. The custom route avoids needing any compensation at all.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const parsed = createInvoiceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invoice data" }
  }

  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["cashier", "owner"])

  const { items, shopId, customerId, paymentMode, amountPaid, discount, salesman, notes, remarks, placeOfSupply } =
    parsed.data

  if (shopId !== user.shop_id) {
    return { ok: false, error: "Shop mismatch" }
  }

  try {
    const result = await pb.send<{ id: string; invoice_number: string }>(
      "/api/custom/create-invoice",
      {
        method: "POST",
        body: {
          shop_id: shopId,
          customer_id: customerId,
          payment_mode: paymentMode,
          amount_paid: amountPaid,
          discount,
          salesman,
          notes,
          remarks,
          place_of_supply: placeOfSupply,
          // Only product_id + qty are trusted from the client — the route
          // re-reads price/gst_rate/name from the product record itself.
          items: items.map((line) => ({ product_id: line.productId, qty: line.qty })),
        },
      }
    )

    return { ok: true, invoiceId: result.id, invoiceNumber: result.invoice_number }
  } catch (err) {
    const message =
      err instanceof ClientResponseError
        ? err.response?.message || err.message
        : err instanceof Error
          ? err.message
          : "Failed to create invoice"
    return { ok: false, error: message }
  }
}
