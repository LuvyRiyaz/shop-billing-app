"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/Modal"
import { productFormSchema, type ActionResult, type ProductFormInput } from "@/lib/validators/products"
import { toDate } from "@/lib/reports"
import type { ProductCategoryType, ProductRecord, ProductUnit } from "@/lib/types/pocketbase"

/** PocketBase's date format -> the "YYYY-MM-DD" an <input type="date"> needs. */
function toDateInputValue(pocketBaseDate?: string): string {
  if (!pocketBaseDate) return ""
  const d = toDate(pocketBaseDate)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

const UNIT_OPTIONS: ProductUnit[] = ["nos", "L", "ml", "Kg", "gram", "cft", "sqft"]
const CATEGORY_TYPE_OPTIONS: ProductCategoryType[] = ["paint", "hardware", "service"]

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-fg/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
const labelClass = "flex flex-col gap-1 text-xs font-medium text-fg/60"

function emptyForm(shopId: string): ProductFormInput {
  return {
    shopId,
    name: "",
    sku: "",
    category: "",
    categoryType: "paint",
    packSize: "",
    hsnCode: "",
    gstRate: 18,
    unit: "nos",
    price: 0,
    costPrice: 0,
    stockQty: 0,
    lowStockThreshold: 5,
    reorderLevel: 0,
    expiryDate: "",
    isActive: true,
    shadeCode: "",
    colorBase: "",
  }
}

function formFromProduct(product: ProductRecord): ProductFormInput {
  return {
    shopId: product.shop_id,
    name: product.name,
    sku: product.sku ?? "",
    category: product.category ?? "",
    categoryType: product.category_type,
    packSize: product.pack_size ?? "",
    hsnCode: product.hsn_code ?? "",
    gstRate: product.gst_rate,
    unit: product.unit,
    price: product.price,
    costPrice: product.cost_price ?? 0,
    stockQty: product.stock_qty,
    lowStockThreshold: product.low_stock_threshold,
    reorderLevel: product.reorder_level,
    expiryDate: toDateInputValue(product.expiry_date),
    isActive: product.is_active,
    shadeCode: product.shade_code ?? "",
    colorBase: product.color_base ?? "",
  }
}

interface ProductFormModalProps {
  open: boolean
  onClose: () => void
  shopId: string
  /** null = create mode, otherwise editing this product. */
  product: ProductRecord | null
  createProduct: (input: ProductFormInput) => Promise<ActionResult<ProductRecord>>
  updateProduct: (id: string, input: ProductFormInput) => Promise<ActionResult<ProductRecord>>
  onSaved: (record: ProductRecord) => void
}

export function ProductFormModal({
  open,
  onClose,
  shopId,
  product,
  createProduct,
  updateProduct,
  onSaved,
}: ProductFormModalProps) {
  const [form, setForm] = useState<ProductFormInput>(() => (product ? formFromProduct(product) : emptyForm(shopId)))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Re-seed the form whenever the modal opens for a (possibly different)
  // product, rather than carrying over stale state from the last time it
  // was open.
  useEffect(() => {
    if (open) {
      setForm(product ? formFromProduct(product) : emptyForm(shopId))
      setError(null)
    }
  }, [open, product, shopId])

  function set<K extends keyof ProductFormInput>(key: K, value: ProductFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = productFormSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form")
      return
    }

    setSubmitting(true)
    try {
      const result = product ? await updateProduct(product.id, parsed.data) : await createProduct(parsed.data)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(product ? `${result.data.name} updated` : `${result.data.name} added`)
      onSaved(result.data)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? `Edit ${product.name}` : "Add new product"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className={labelClass}>
          Name
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            SKU
            <input
              type="text"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Category
            <input
              type="text"
              placeholder="e.g. Interior Paints"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Category type
            <select
              value={form.categoryType}
              onChange={(e) => set("categoryType", e.target.value as ProductCategoryType)}
              className={inputClass}
            >
              {CATEGORY_TYPE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Pack size
            <input
              type="text"
              placeholder='e.g. "20 L"'
              value={form.packSize}
              onChange={(e) => set("packSize", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {form.categoryType === "paint" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
            <label className={labelClass}>
              Shade code
              <input
                type="text"
                value={form.shadeCode}
                onChange={(e) => set("shadeCode", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Color (for the swatch)
              <input
                type="color"
                value={form.colorBase || "#2e7d32"}
                onChange={(e) => set("colorBase", e.target.value)}
                className={`${inputClass} px-1`}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            HSN code
            <input
              type="text"
              value={form.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Unit
            <select value={form.unit} onChange={(e) => set("unit", e.target.value as ProductUnit)} className={inputClass}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            GST rate (%)
            <input
              type="number"
              min={0}
              max={28}
              step="0.01"
              value={form.gstRate}
              onChange={(e) => set("gstRate", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Price (₹)
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Cost price (₹)
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.costPrice}
              onChange={(e) => set("costPrice", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Stock qty
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.stockQty}
              onChange={(e) => set("stockQty", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Low stock threshold <span className="font-normal normal-case text-warning">(warning)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={form.lowStockThreshold}
              onChange={(e) => set("lowStockThreshold", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Reorder level <span className="font-normal normal-case text-danger">(critical)</span>
            <input
              type="number"
              min={0}
              step="1"
              placeholder="0 = not set"
              value={form.reorderLevel}
              onChange={(e) => set("reorderLevel", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Expiry date <span className="font-normal normal-case text-fg/40">(paint/chemicals)</span>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => set("expiryDate", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-fg">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--color-primary)]"
            />
            Active
          </label>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={onClose}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-fg hover:bg-bg"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            whileTap={submitting ? undefined : { scale: 0.95 }}
            whileHover={submitting ? undefined : { scale: 1.05 }}
            disabled={submitting}
            className="h-10 rounded-lg bg-gradient-to-b from-primary-light to-primary px-5 text-sm font-semibold text-[color:var(--color-primary-foreground)] shadow-card disabled:opacity-50"
          >
            {submitting ? "Saving…" : product ? "Save changes" : "Add product"}
          </motion.button>
        </div>
      </form>
    </Modal>
  )
}
