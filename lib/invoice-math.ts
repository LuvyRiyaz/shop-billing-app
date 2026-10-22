// Pure arithmetic mirroring the custom atomic invoice route in
// POCKETBASE_SETUP.md §7B (pb_hooks/main.pb.js, `/api/custom/create-invoice`).
//
// IMPORTANT: this module is NOT imported by the actual PocketBase hook —
// that file runs inside PocketBase's embedded Goja JS VM, which can't
// import from this Next.js codebase. This exists so the core stock/credit
// math has a fast, Node-native regression test (invoice-math.test.ts)
// instead of relying solely on the curl-based integration tests in §9,
// which need a live PocketBase instance and are much slower to run.
// If you change the arithmetic in §7B, change it here too — these are
// hand-kept in sync, not shared code.

export interface StockDecrementResult {
  ok: boolean
  newStock: number
  error?: string
}

export function decrementStock(currentStock: number, qty: number, productName: string): StockDecrementResult {
  const newStock = currentStock - qty
  if (newStock < 0) {
    return { ok: false, newStock: currentStock, error: `Insufficient stock for ${productName}` }
  }
  return { ok: true, newStock }
}

export type PaymentStatus = "paid" | "partial" | "unpaid"

export function computePaymentStatus(total: number, amountPaid: number): PaymentStatus {
  if (amountPaid >= total) return "paid"
  if (amountPaid > 0) return "partial"
  return "unpaid"
}

export function computeDueIncrement(total: number, amountPaid: number): number {
  return total - amountPaid
}

export interface CreditCheckResult {
  ok: boolean
  newDue: number
  error?: string
}

/** Mirrors §7B exactly: `creditLimit > 0 && newDue > creditLimit` — a limit
 *  of 0 means "no limit set" (never rejects), and the comparison is a
 *  strict `>`, so a sale that brings the due to exactly the limit succeeds.
 */
export function checkCreditLimit(currentDue: number, dueIncrement: number, creditLimit: number): CreditCheckResult {
  const newDue = currentDue + dueIncrement
  if (creditLimit > 0 && newDue > creditLimit) {
    return {
      ok: false,
      newDue: currentDue,
      error: `Credit limit exceeded: due would be ${newDue}, limit is ${creditLimit}`,
    }
  }
  return { ok: true, newDue }
}

export interface LineInput {
  unitPrice: number
  qty: number
  gstRate: number
}

export function computeLineTotals(items: LineInput[]): { subtotal: number; gstTotal: number } {
  let subtotal = 0
  let gstTotal = 0
  for (const item of items) {
    const lineTotal = item.unitPrice * item.qty
    subtotal += lineTotal
    gstTotal += lineTotal * (item.gstRate / 100)
  }
  return { subtotal, gstTotal }
}
