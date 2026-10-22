"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import { X } from "lucide-react"
import type { CustomerRecord, ShopType } from "@/lib/types/pocketbase"
import {
  createInvoiceSchema,
  type CartLine,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
} from "@/lib/validators/billing"
import { SuccessOverlay } from "./SuccessOverlay"

interface CartProps {
  shopId: string
  shopType: ShopType
  lines: CartLine[]
  customers: CustomerRecord[]
  onQtyChange: (productId: string, qty: number) => void
  onRemove: (productId: string) => void
  onSubmit: (input: CreateInvoiceInput) => Promise<CreateInvoiceResult>
  onSuccess: () => void
}

type PaymentMode = "cash" | "upi" | "card" | "credit"

const inputClass =
  "h-11 rounded-lg border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-fg/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"

export function Cart({
  shopId,
  shopType,
  lines,
  customers,
  onQtyChange,
  onRemove,
  onSubmit,
  onSuccess,
}: CartProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash")
  const [customerId, setCustomerId] = useState<string>("")
  const [amountPaidInput, setAmountPaidInput] = useState<string>("")
  const [discountInput, setDiscountInput] = useState<string>("0")
  const [salesman, setSalesman] = useState("")
  const [notes, setNotes] = useState("")
  const [remarks, setRemarks] = useState("")
  const [placeOfSupply, setPlaceOfSupply] = useState("33-Tamil Nadu")
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<{ id: string; number: string } | null>(null)

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0), [lines])
  const gstTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.qty * (l.gstRate / 100), 0),
    [lines]
  )
  const discount = Number(discountInput) || 0
  const total = Math.max(0, subtotal + gstTotal - discount)
  const amountPaid = paymentMode === "credit" ? Number(amountPaidInput) || 0 : total

  async function handleCheckout() {
    const input = {
      shopId,
      customerId: customerId || undefined,
      paymentMode,
      amountPaid,
      discount,
      salesman: shopType === "agency" ? salesman || undefined : undefined,
      notes: notes || undefined,
      remarks: remarks || undefined,
      placeOfSupply: placeOfSupply || undefined,
      items: lines,
    }

    const parsed = createInvoiceSchema.safeParse(input)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the cart details")
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmit(parsed.data)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setLastInvoice({ id: result.invoiceId, number: result.invoiceNumber })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1800)
      toast.success(`Invoice ${result.invoiceNumber} finalized`)
      onSuccess()
      setCustomerId("")
      setAmountPaidInput("")
      setDiscountInput("0")
      setSalesman("")
      setNotes("")
      setRemarks("")
      setPaymentMode("cash")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <SuccessOverlay show={showSuccess} message="Bill finalized" />

      <div className="flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-surface-raised p-4 shadow-raised">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-fg">Cart</h2>
          {lines.length > 0 && (
            <motion.span
              key={lines.length}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
            >
              {lines.length} item{lines.length === 1 ? "" : "s"}
            </motion.span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <p className="py-6 text-center font-display text-sm italic text-fg/40">
              Cart is empty — add a product to start
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {lines.map((line, index) => (
                  <motion.li
                    key={line.productId}
                    layout
                    initial={{ opacity: 0, x: 24, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1, transition: { delay: index * 0.04 } }}
                    exit={{ opacity: 0, x: -24, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="flex items-center gap-2 rounded-xl bg-bg p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{line.productName}</p>
                      <p className="text-xs text-fg/50">
                        ₹{line.unitPrice.toFixed(2)} × {line.qty}
                        {line.unit ? ` ${line.unit}` : ""}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={line.availableStock}
                      value={line.qty}
                      onChange={(e) => onQtyChange(line.productId, Number(e.target.value) || 1)}
                      className={`${inputClass} w-16 text-center`}
                      aria-label={`Quantity for ${line.productName}`}
                    />
                    {line.unit ? <span className="w-8 shrink-0 text-xs text-fg/50">{line.unit}</span> : null}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.08 }}
                      onClick={() => onRemove(line.productId)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg/40 transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label={`Remove ${line.productName}`}
                    >
                      <X className="h-4 w-4" />
                    </motion.button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <Row label="Subtotal" value={subtotal} />
          <Row label="GST" value={gstTotal} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg/70">Discount</span>
            <input
              type="number"
              min={0}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className={`${inputClass} h-9 w-24 text-right`}
            />
          </div>
          <Row label="Total" value={total} bold />

          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className={inputClass}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="credit">Credit (Udhaar)</option>
          </select>

          {(paymentMode === "credit" || customers.length > 0) && (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {paymentMode === "credit" && (
            <input
              type="number"
              min={0}
              placeholder="Amount paid now (0 if fully on credit)"
              value={amountPaidInput}
              onChange={(e) => setAmountPaidInput(e.target.value)}
              className={inputClass}
            />
          )}

          {shopType === "agency" && (
            <input
              type="text"
              placeholder="Salesman"
              value={salesman}
              onChange={(e) => setSalesman(e.target.value)}
              className={inputClass}
            />
          )}

          <input
            type="text"
            placeholder="Remarks (e.g. Against Seller's Estimate #...)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={inputClass}
          />

          <label className="flex flex-col gap-1 text-xs text-fg/60">
            Place of supply
            <input
              type="text"
              value={placeOfSupply}
              onChange={(e) => setPlaceOfSupply(e.target.value)}
              className={`${inputClass} h-9`}
            />
          </label>

          <motion.button
            id="finalize-bill-btn"
            type="button"
            onClick={handleCheckout}
            disabled={lines.length === 0 || submitting}
            whileTap={lines.length === 0 || submitting ? undefined : { scale: 0.95 }}
            whileHover={
              lines.length === 0 || submitting ? undefined : { scale: 1.02, backgroundPosition: "100% 0%" }
            }
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="relative mt-1 h-14 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-primary-light to-primary bg-[length:200%_100%] font-display text-base font-semibold text-[color:var(--color-primary-foreground)] shadow-glow-primary transition-[filter] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Processing…
              </span>
            ) : (
              `Finalize bill · ₹${total.toFixed(2)} (F4)`
            )}
          </motion.button>

          {lastInvoice && (
            <a
              href={`/billing/${lastInvoice.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Print invoice {lastInvoice.number}
            </a>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-fg" : "text-fg/70"}`}>
      <span className={bold ? "font-medium" : ""}>{label}</span>
      <span className={bold ? "font-display text-xl font-semibold" : ""}>₹{value.toFixed(2)}</span>
    </div>
  )
}
