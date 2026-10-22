import { z } from "zod"

export const productFormSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  category: z.string().optional(),
  categoryType: z.enum(["paint", "hardware", "service"]),
  packSize: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: z.number().min(0, "GST rate can't be negative").max(28, "GST rate can't exceed 28%"),
  unit: z.enum(["nos", "L", "ml", "Kg", "gram", "cft", "sqft"]),
  price: z.number().positive("Price must be greater than 0"),
  costPrice: z.number().nonnegative("Cost price can't be negative").optional(),
  stockQty: z.number().nonnegative("Stock can't be negative"),
  lowStockThreshold: z.number().nonnegative("Threshold can't be negative"),
  // 0 = "no critical tier configured" (same idiom as customers.credit_limit).
  reorderLevel: z.number().nonnegative("Reorder level can't be negative"),
  // "YYYY-MM-DD" from an <input type="date">, or "" for no expiry.
  expiryDate: z.string().optional(),
  isActive: z.boolean(),
  // Only meaningful when categoryType === "paint" — the form hides these
  // fields otherwise and the server action blanks them out on save so a
  // product switched from paint -> hardware doesn't keep a stale shade.
  shadeCode: z.string().optional(),
  colorBase: z.string().optional(),
})

export type ProductFormInput = z.infer<typeof productFormSchema>

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }
