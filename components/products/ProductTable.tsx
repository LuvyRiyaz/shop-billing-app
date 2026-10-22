"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ProductFormModal } from "./ProductFormModal"
import { CsvImportModal } from "./CsvImportModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Modal } from "@/components/ui/Modal"
import { getExpiryAlerts, getStockAlerts } from "@/lib/alerts"
import { toDate } from "@/lib/reports"
import type { ActionResult, ProductFormInput } from "@/lib/validators/products"
import type { ProductRecord, UserRole } from "@/lib/types/pocketbase"

interface ProductTableProps {
  shopId: string
  currentRole: UserRole
  initialProducts: ProductRecord[]
  createProduct: (input: ProductFormInput) => Promise<ActionResult<ProductRecord>>
  updateProduct: (id: string, input: ProductFormInput) => Promise<ActionResult<ProductRecord>>
  deleteProduct: (id: string) => Promise<ActionResult<null>>
}

export function ProductTable({
  shopId,
  currentRole,
  initialProducts,
  createProduct,
  updateProduct,
  deleteProduct,
}: ProductTableProps) {
  const [products, setProducts] = useState<ProductRecord[]>(initialProducts)
  const [editing, setEditing] = useState<ProductRecord | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [scanInfoOpen, setScanInfoOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ProductRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // products.deleteRule (POCKETBASE_SETUP.md §3) is owner-only, not
  // manager — hide the control a manager can't actually use instead of
  // showing a button that will just come back with a 403.
  const canDelete = currentRole === "owner"

  // Shared with the billing screen / reports dashboard (lib/alerts.ts) —
  // one set of threshold rules, not threshold math re-duplicated per view.
  const stockAlerts = useMemo(() => getStockAlerts(products), [products])
  const expiryAlerts = useMemo(() => getExpiryAlerts(products), [products])
  const criticalIds = useMemo(() => new Set(stockAlerts.critical.map((p) => p.id)), [stockAlerts])
  const warningIds = useMemo(() => new Set(stockAlerts.warning.map((p) => p.id)), [stockAlerts])
  const expiredIds = useMemo(() => new Set(expiryAlerts.expired.map((p) => p.id)), [expiryAlerts])
  const expiringSoonIds = useMemo(() => new Set(expiryAlerts.expiringSoon.map((p) => p.id)), [expiryAlerts])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(product: ProductRecord) {
    setEditing(product)
    setFormOpen(true)
  }

  function mergeProducts(records: ProductRecord[]) {
    setProducts((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]))
      for (const record of records) byId.set(record.id, record)
      return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  function handleSaved(record: ProductRecord) {
    mergeProducts([record])
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteProduct(pendingDelete.id)
      if (!result.ok) {
        setDeleteError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`${pendingDelete.name} deleted`)
      setProducts((prev) => prev.filter((p) => p.id !== pendingDelete.id))
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Products</h1>
          <p className="text-sm text-fg/50">{products.length} product(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScanInfoOpen(true)}
            className="h-11 rounded-lg border border-dashed border-border px-4 text-sm font-medium text-fg/50 transition-colors hover:border-fg/20 hover:text-fg/70"
          >
            📷 Scan distributor bill (Coming soon)
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="h-11 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg transition-colors hover:bg-bg"
          >
            Import from CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="h-11 rounded-lg bg-gradient-to-b from-primary-light to-primary px-4 text-sm font-semibold text-[color:var(--color-primary-foreground)] shadow-card"
          >
            + Add new product
          </button>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-card">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg/50">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Pack size</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Low stock at</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center font-display text-sm italic text-fg/40">
                  No products yet — add your first one, or import a CSV.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const stockTone = criticalIds.has(product.id) ? "critical" : warningIds.has(product.id) ? "warning" : null
                const expiryTone = expiredIds.has(product.id) ? "expired" : expiringSoonIds.has(product.id) ? "soon" : null

                return (
                  <tr
                    key={product.id}
                    onClick={() => openEdit(product)}
                    className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-bg ${
                      product.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {product.category_type === "paint" && product.shade_code ? (
                          <span
                            className="h-3 w-3 shrink-0 rounded-full ring-2 ring-bg"
                            style={{ backgroundColor: product.color_base || "var(--color-primary)" }}
                            aria-hidden="true"
                          />
                        ) : product.category_type === "hardware" ? (
                          <span
                            className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border border-warning/40 bg-warning/10 text-[7px] font-bold text-warning"
                            aria-hidden="true"
                          >
                            H
                          </span>
                        ) : null}
                        <span className="font-medium text-fg">{product.name}</span>
                        {!product.is_active && (
                          <span className="rounded-full bg-fg/10 px-1.5 py-0.5 text-[10px] font-medium text-fg/60">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-fg/70">{product.sku || "—"}</td>
                    <td className="px-4 py-3 text-fg/70">{product.pack_size || "—"}</td>
                    <td className="px-4 py-3 text-fg/70">{product.category || "—"}</td>
                    <td className="px-4 py-3 text-right font-display font-medium text-fg">
                      ₹{product.price.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        stockTone === "critical" ? "text-danger" : stockTone === "warning" ? "text-warning" : "text-fg"
                      }`}
                    >
                      {product.stock_qty} {product.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-fg/70">{product.low_stock_threshold}</td>
                    <td
                      className={`px-4 py-3 ${
                        expiryTone === "expired" ? "text-danger" : expiryTone === "soon" ? "text-warning" : "text-fg/70"
                      }`}
                    >
                      {product.expiry_date ? toDate(product.expiry_date).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPendingDelete(product)
                            setDeleteError(null)
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-fg/40 transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        shopId={shopId}
        product={editing}
        createProduct={createProduct}
        updateProduct={updateProduct}
        onSaved={handleSaved}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        shopId={shopId}
        onImported={mergeProducts}
      />

      <Modal open={scanInfoOpen} onClose={() => setScanInfoOpen(false)} title="Scan distributor bill" maxWidthClassName="max-w-sm">
        <p className="text-sm text-fg/70">
          Coming soon: point your camera at a printed distributor invoice and have it read the line items
          automatically (via an OCR service like Google Cloud Vision or Tesseract.js). It'll feed into the same
          column-mapping and preview screen as the CSV import above — not a separate flow.
        </p>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete product?"
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be permanently deleted. This can't be undone.${
                deleteError ? ` ${deleteError}` : ""
              }`
            : ""
        }
        confirmLabel="Delete"
        destructive
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}
