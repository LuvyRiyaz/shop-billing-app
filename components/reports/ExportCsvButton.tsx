"use client"

import Papa from "papaparse"
import { Download } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { toDate } from "@/lib/reports"
import type { CustomerRecord, InvoiceRecord } from "@/lib/types/pocketbase"

type InvoiceWithCustomer = InvoiceRecord & { expand?: { customer_id?: CustomerRecord } }

interface ExportCsvButtonProps {
  invoices: InvoiceWithCustomer[]
  /** Used only to build a readable filename, e.g. "invoices-this-month.csv". */
  rangeLabel: string
}

export function ExportCsvButton({ invoices, rangeLabel }: ExportCsvButtonProps) {
  function handleExport() {
    if (invoices.length === 0) {
      toast.warning("No invoices in this range to export")
      return
    }

    const rows = invoices.map((inv) => ({
      Date: toDate(inv.created).toLocaleDateString("en-IN"),
      "Invoice #": inv.invoice_number,
      "Customer Name": inv.expand?.customer_id?.name ?? "Walk-in",
      "Total Amount": inv.total.toFixed(2),
      "Payment Mode": inv.payment_mode,
      Status: inv.payment_status,
    }))

    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const filename = `invoices-${rangeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`

    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success(`Exported ${invoices.length} invoice(s)`)
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      onClick={handleExport}
      className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-bg"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </motion.button>
  )
}
