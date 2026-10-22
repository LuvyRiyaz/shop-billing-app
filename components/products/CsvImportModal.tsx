"use client"

import { useRef, useState } from "react"
import Papa from "papaparse"
import { toast } from "sonner"
import { Modal } from "@/components/ui/Modal"
import { createBrowserPocketBase } from "@/lib/pocketbase-client"
import { productFormSchema, type ProductFormInput } from "@/lib/validators/products"
import type { ProductCategoryType, ProductRecord, ProductUnit } from "@/lib/types/pocketbase"

// --- Shared "parsed table" shape --------------------------------------
// Both this CSV importer and a future OCR-based "Scan Distributor Bill"
// flow (see the placeholder button in ProductTable.tsx) should produce
// exactly this shape and hand it to the SAME map/preview/confirm UI below
// — plugging in OCR later means writing a function that returns a
// ParsedTable from an image, not a second import pipeline.
export interface ParsedTable {
  columns: string[]
  rows: Record<string, string>[]
}

type TargetField =
  | "name"
  | "sku"
  | "category"
  | "categoryType"
  | "packSize"
  | "hsnCode"
  | "gstRate"
  | "unit"
  | "price"
  | "costPrice"
  | "stockQty"
  | "lowStockThreshold"
  | "reorderLevel"
  | "expiryDate"

const TARGET_FIELDS: { key: TargetField; label: string; required?: boolean }[] = [
  { key: "name", label: "Product Name", required: true },
  { key: "price", label: "Price / Rate", required: true },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "categoryType", label: "Category Type" },
  { key: "packSize", label: "Pack Size" },
  { key: "hsnCode", label: "HSN Code" },
  { key: "gstRate", label: "GST Rate (%)" },
  { key: "unit", label: "Unit" },
  { key: "costPrice", label: "Cost Price" },
  { key: "stockQty", label: "Stock Qty" },
  { key: "lowStockThreshold", label: "Low Stock Threshold" },
  { key: "reorderLevel", label: "Reorder Level" },
  { key: "expiryDate", label: "Expiry Date" },
]

// Case-insensitive alias guesser so the mapping step starts pre-filled for
// a typical distributor invoice export instead of all-blank dropdowns.
const FIELD_ALIASES: Record<TargetField, string[]> = {
  name: ["name", "product name", "product", "item", "item name", "description"],
  sku: ["sku", "code", "item code", "product code"],
  category: ["category", "group"],
  categoryType: ["category type", "type"],
  packSize: ["pack size", "pack", "size"],
  hsnCode: ["hsn", "hsn code"],
  gstRate: ["gst", "gst rate", "gst%", "tax", "tax rate"],
  unit: ["unit", "uom"],
  price: ["price", "rate", "mrp", "selling price", "sale price"],
  costPrice: ["cost price", "cost", "purchase price", "buying price"],
  stockQty: ["stock", "qty", "quantity", "stock qty"],
  lowStockThreshold: ["low stock threshold", "min stock", "threshold"],
  reorderLevel: ["reorder level", "reorder qty", "reorder point", "critical stock"],
  expiryDate: ["expiry", "expiry date", "exp date", "best before"],
}

function guessMapping(columns: string[]): Record<TargetField, string> {
  const mapping = {} as Record<TargetField, string>
  const lowerColumns = columns.map((c) => c.trim().toLowerCase())

  for (const field of TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[field.key]
    const matchIndex = lowerColumns.findIndex((col) => aliases.some((alias) => col === alias || col.includes(alias)))
    mapping[field.key] = matchIndex !== -1 ? (columns[matchIndex] ?? "") : ""
  }

  return mapping
}

function isCategoryType(v: string): v is ProductCategoryType {
  return v === "paint" || v === "hardware" || v === "service"
}

const UNITS: ProductUnit[] = ["nos", "L", "ml", "Kg", "gram", "cft", "sqft"]
function isUnit(v: string): v is ProductUnit {
  return (UNITS as string[]).includes(v)
}

/** Best-effort — distributor CSVs use all kinds of date formats. Falls back
 *  to no expiry rather than guessing wrong. */
function normalizeDateCell(raw: string): string {
  if (!raw.trim()) return ""
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

function cell(row: Record<string, string>, mapping: Record<TargetField, string>, key: TargetField): string {
  const col = mapping[key]
  return col ? (row[col] ?? "").trim() : ""
}

function buildProductInput(
  row: Record<string, string>,
  mapping: Record<TargetField, string>,
  shopId: string
): ProductFormInput {
  const categoryTypeRaw = cell(row, mapping, "categoryType").toLowerCase()
  const unitRaw = cell(row, mapping, "unit")

  return {
    shopId,
    name: cell(row, mapping, "name"),
    sku: cell(row, mapping, "sku"),
    category: cell(row, mapping, "category"),
    categoryType: isCategoryType(categoryTypeRaw) ? categoryTypeRaw : "paint",
    packSize: cell(row, mapping, "packSize"),
    hsnCode: cell(row, mapping, "hsnCode"),
    gstRate: Number(cell(row, mapping, "gstRate")) || 0,
    unit: isUnit(unitRaw) ? unitRaw : "nos",
    price: Number(cell(row, mapping, "price")) || 0,
    costPrice: Number(cell(row, mapping, "costPrice")) || 0,
    stockQty: Number(cell(row, mapping, "stockQty")) || 0,
    lowStockThreshold: Number(cell(row, mapping, "lowStockThreshold")) || 5,
    reorderLevel: Number(cell(row, mapping, "reorderLevel")) || 0,
    expiryDate: normalizeDateCell(cell(row, mapping, "expiryDate")),
    isActive: true,
    shadeCode: "",
    colorBase: "",
  }
}

type Step = "upload" | "map" | "importing" | "done"

interface ImportRowResult {
  name: string
  ok: boolean
  error?: string
}

interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  shopId: string
  onImported: (records: ProductRecord[]) => void
}

export function CsvImportModal({ open, onClose, shopId, onImported }: CsvImportModalProps) {
  const [step, setStep] = useState<Step>("upload")
  const [parseError, setParseError] = useState<string | null>(null)
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [mapping, setMapping] = useState<Record<TargetField, string>>({} as Record<TargetField, string>)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ImportRowResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep("upload")
    setParseError(null)
    setTable(null)
    setMapping({} as Record<TargetField, string>)
    setProgress({ done: 0, total: 0 })
    setResults([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(file: File) {
    setParseError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields ?? []
        if (columns.length === 0 || results.data.length === 0) {
          setParseError("Couldn't find any columns/rows in that file — is it a valid CSV with a header row?")
          return
        }
        setTable({ columns, rows: results.data })
        setMapping(guessMapping(columns))
        setStep("map")
      },
      error: (err) => {
        setParseError(err.message || "Failed to read the file")
      },
    })
  }

  const previewInputs = table ? table.rows.map((row) => buildProductInput(row, mapping, shopId)) : []
  const validatedPreview = previewInputs.map((input) => {
    const parsed = productFormSchema.safeParse(input)
    return { input, issue: parsed.success ? null : parsed.error.issues[0]?.message ?? "Invalid row" }
  })
  const validCount = validatedPreview.filter((r) => !r.issue).length

  async function handleConfirmImport() {
    const toImport = validatedPreview.filter((r) => !r.issue).map((r) => r.input)
    setStep("importing")
    setProgress({ done: 0, total: toImport.length })

    // Per the brief: insert directly via pb.collection('products').create()
    // from the browser, rather than a server action per row — this is a
    // bulk, owner/manager-only, client-driven operation, enforced by
    // PocketBase's own createRule (owner||manager + shop_id match,
    // POCKETBASE_SETUP.md §3), the same rule that protects every other
    // direct products write. Sequential, not Promise.all, so the progress
    // counter is meaningful and we don't hammer the server with 200
    // simultaneous requests on a big distributor invoice.
    const pb = createBrowserPocketBase()
    const created: ProductRecord[] = []
    const rowResults: ImportRowResult[] = []

    for (const input of toImport) {
      try {
        const record = await pb.collection("products").create({
          shop_id: input.shopId,
          name: input.name,
          sku: input.sku || "",
          category: input.category || "",
          category_type: input.categoryType,
          pack_size: input.packSize || "",
          hsn_code: input.hsnCode || "",
          gst_rate: input.gstRate,
          unit: input.unit,
          price: input.price,
          cost_price: input.costPrice ?? 0,
          stock_qty: input.stockQty,
          low_stock_threshold: input.lowStockThreshold,
          reorder_level: input.reorderLevel,
          expiry_date: input.expiryDate || null,
          is_active: true,
        })
        created.push(record)
        rowResults.push({ name: input.name, ok: true })
      } catch (err) {
        rowResults.push({ name: input.name, ok: false, error: err instanceof Error ? err.message : "Failed" })
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    setResults(rowResults)
    onImported(created)
    setStep("done")

    const succeeded = rowResults.filter((r) => r.ok).length
    const failed = rowResults.length - succeeded
    if (failed === 0) {
      toast.success(`${succeeded} product(s) imported`)
    } else {
      toast.warning(`${succeeded} imported, ${failed} failed`)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import products from CSV" maxWidthClassName="max-w-3xl">
      {step === "upload" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg/70">
            Upload a CSV export of your distributor invoice or stock list. Have an Excel file? Save it as CSV
            first (File → Save As → CSV) — this only reads plain CSV/text, not the native .xlsx format.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
            className="rounded-lg border border-dashed border-border bg-bg p-6 text-sm text-fg/60 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-sm file:font-medium file:text-[color:var(--color-primary-foreground)]"
          />
          {parseError && <p className="text-sm text-danger">{parseError}</p>}
        </div>
      )}

      {step === "map" && table && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg">Map your columns</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TARGET_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-xs text-fg/60">
                  {field.label}
                  {field.required && <span className="text-danger"> *</span>}
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
                  >
                    <option value="">— Don't import —</option>
                    {table.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg">
              Preview — {table.rows.length} row(s), {validCount} ready to import
            </h3>
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Category type</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    <th className="px-2 py-2 text-right">Stock</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedPreview.slice(0, 50).map((r, i) => (
                    <tr key={i} className={`border-b border-border/50 ${r.issue ? "bg-danger/5" : ""}`}>
                      <td className="px-2 py-1.5">{r.input.name || "—"}</td>
                      <td className="px-2 py-1.5">{r.input.categoryType}</td>
                      <td className="px-2 py-1.5">{r.input.unit}</td>
                      <td className="px-2 py-1.5 text-right">₹{r.input.price.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{r.input.stockQty}</td>
                      <td className="px-2 py-1.5">
                        {r.issue ? <span className="text-danger">{r.issue}</span> : <span className="text-primary">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.rows.length > 50 && (
              <p className="mt-1 text-xs text-fg/40">Showing first 50 of {table.rows.length} rows.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-fg hover:bg-bg">
              Start over
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={validCount === 0}
              className="h-10 rounded-lg bg-gradient-to-b from-primary-light to-primary px-5 text-sm font-semibold text-[color:var(--color-primary-foreground)] shadow-card disabled:opacity-50"
            >
              Import {validCount} product{validCount === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="font-display text-lg text-fg">
            Importing {progress.done} / {progress.total}…
          </p>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3">
          <p className="font-display text-lg font-semibold text-fg">
            {results.filter((r) => r.ok).length} imported, {results.filter((r) => !r.ok).length} failed
          </p>
          {results.some((r) => !r.ok) && (
            <ul className="max-h-40 overflow-auto rounded-lg border border-border p-2 text-xs text-danger">
              {results
                .filter((r) => !r.ok)
                .map((r, i) => (
                  <li key={i}>
                    {r.name || "(unnamed row)"}: {r.error}
                  </li>
                ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-[color:var(--color-primary-foreground)]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
