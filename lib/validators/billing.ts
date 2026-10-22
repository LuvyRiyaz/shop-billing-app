import { z } from "zod"

export const cartLineSchema = z
  .object({
    productId: z.string().min(1),
    productName: z.string().min(1),
    hsnCode: z.string().optional(),
    // Display-only (e.g. "L", "Kg", "nos") — never sent to the server. The
    // custom route (POCKETBASE_SETUP.md §7B) re-derives unit from the
    // product record itself, the same way it already does for price/name.
    unit: z.string().optional(),
    unitPrice: z.number().positive(),
    gstRate: z.number().min(0).max(28),
    qty: z.number().positive(),
    availableStock: z.number().nonnegative(),
  })
  .refine((line) => line.qty <= line.availableStock, {
    message: "Quantity exceeds available stock",
    path: ["qty"],
  })

export const createInvoiceSchema = z
  .object({
    shopId: z.string().min(1),
    customerId: z.string().min(1).optional(),
    paymentMode: z.enum(["cash", "upi", "card", "credit"]),
    amountPaid: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0),
    salesman: z.string().optional(),
    notes: z.string().optional(),
    remarks: z.string().optional(),
    placeOfSupply: z.string().optional(),
    items: z.array(cartLineSchema).min(1, "Add at least one item to the cart"),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMode === "credit" && !data.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A customer is required for a credit sale",
        path: ["customerId"],
      })
    }

    const subtotal = data.items.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
    if (data.amountPaid > subtotal + subtotal * 0.28) {
      // Loose upper bound (max possible GST slab) to catch obvious typos
      // like an extra zero; the server recomputes the real total anyway.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount paid looks too high for this cart",
        path: ["amountPaid"],
      })
    }
  })

export type CartLine = z.infer<typeof cartLineSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export type CreateInvoiceResult =
  | { ok: true; invoiceId: string; invoiceNumber: string }
  | { ok: false; error: string }
