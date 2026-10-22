import type { CustomerRecord, InvoiceItemRecord, InvoiceRecord, ShopRecord } from "@/lib/types/pocketbase"
import { toDate } from "@/lib/reports"

export type PrintLayout = "a4" | "thermal-58" | "thermal-80"

interface InvoicePrintProps {
  layout: PrintLayout
  shop: ShopRecord
  invoice: InvoiceRecord
  items: InvoiceItemRecord[]
  customer: CustomerRecord | null
}

const currency = (n: number) => n.toFixed(2)

const PAGE_CSS: Record<PrintLayout, string> = {
  a4: "@page { size: A4; margin: 10mm; }",
  "thermal-58": "@page { size: 58mm auto; margin: 2mm; }",
  "thermal-80": "@page { size: 80mm auto; margin: 2mm; }",
}

/**
 * Renders one of three fixed layouts for the same invoice data. The
 * `.print-area` class is what app/globals.css's @media print block isolates
 * — everything else on the page is hidden when the browser print dialog
 * opens (see components/billing/PrintButton.tsx for the actual trigger).
 */
export function InvoicePrint({ layout, shop, invoice, items, customer }: InvoicePrintProps) {
  return (
    <div className={`print-area mx-auto bg-bg text-fg ${layout === "a4" ? "max-w-[210mm]" : "max-w-[80mm]"}`}>
      {/* eslint-disable-next-line react/no-danger -- static, fixed strings only, no user input interpolated */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS[layout] }} />
      {layout === "a4" ? (
        <A4Invoice shop={shop} invoice={invoice} items={items} customer={customer} />
      ) : (
        <ThermalReceipt shop={shop} invoice={invoice} items={items} />
      )}
    </div>
  )
}

function A4Invoice({ shop, invoice, items, customer }: Omit<InvoicePrintProps, "layout">) {
  return (
    <div className="flex flex-col gap-4 p-6 text-sm">
      <header className="flex items-start justify-between border-b border-border pb-3">
        <div>
          <h1 className="text-lg font-semibold">{shop.name}</h1>
          {shop.address && <p className="text-xs text-fg/70">{shop.address}</p>}
          {shop.gst_number && <p className="text-xs text-fg/70">GSTIN: {shop.gst_number}</p>}
          {shop.phone && <p className="text-xs text-fg/70">Phone: {shop.phone}</p>}
        </div>
        <div className="text-right text-xs text-fg/70">
          <p className="text-sm font-semibold text-fg">Tax Invoice</p>
          <p>Invoice #: {invoice.invoice_number}</p>
          <p>Date: {toDate(invoice.created).toLocaleDateString("en-IN")}</p>
        </div>
      </header>

      <div className="flex items-start justify-between text-xs">
        <div>
          <p className="font-medium text-fg">Bill To</p>
          <p>{customer?.name ?? "Walk-in customer"}</p>
          {customer?.address && <p className="text-fg/70">{customer.address}</p>}
          {customer?.gst_number && <p className="text-fg/70">GSTIN: {customer.gst_number}</p>}
        </div>
        <p>
          <span className="font-medium text-fg">Place of Supply: </span>
          {invoice.place_of_supply || "—"}
        </p>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-t border-border text-left">
            <th className="py-1.5 pr-2">Description</th>
            <th className="py-1.5 pr-2 text-right">QTY</th>
            <th className="py-1.5 pr-2">Units</th>
            <th className="py-1.5 pr-2 text-right">Rate</th>
            <th className="py-1.5 pr-2">Per</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-1.5 pr-2">
                <p>{item.product_name}</p>
                <p className="text-fg/50">
                  {[item.pack_size, item.hsn_code ? `HSN ${item.hsn_code}` : null].filter(Boolean).join(" · ")}
                </p>
              </td>
              <td className="py-1.5 pr-2 text-right">{item.qty}</td>
              <td className="py-1.5 pr-2">{item.unit}</td>
              <td className="py-1.5 pr-2 text-right">{currency(item.unit_price)}</td>
              <td className="py-1.5 pr-2">{item.unit}</td>
              <td className="py-1.5 text-right">{currency(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex w-56 flex-col gap-1 text-xs">
        <TotalRow label="Subtotal" value={invoice.subtotal} />
        <TotalRow label="Discount" value={-invoice.discount} />
        <TotalRow label="CGST" value={invoice.cgst} />
        <TotalRow label="SGST" value={invoice.sgst} />
        {invoice.igst > 0 && <TotalRow label="IGST" value={invoice.igst} />}
        <TotalRow label="Total" value={invoice.total} bold />
        <TotalRow label="Amount Paid" value={invoice.amount_paid} />
        <TotalRow label="Balance Due" value={invoice.total - invoice.amount_paid} bold />
      </div>

      {invoice.remarks && (
        <div className="border-t border-border pt-2 text-xs">
          <p className="font-medium text-fg">Remarks</p>
          <p className="text-fg/70">{invoice.remarks}</p>
        </div>
      )}
    </div>
  )
}

function ThermalReceipt({ shop, invoice, items }: Omit<InvoicePrintProps, "layout" | "customer">) {
  return (
    <div className="flex flex-col gap-2 p-2 text-[10px] leading-tight">
      <header className="text-center">
        <p className="font-semibold">{shop.name}</p>
        {shop.address && <p>{shop.address}</p>}
        {shop.gst_number && <p>GSTIN: {shop.gst_number}</p>}
      </header>

      <div className="border-t border-dashed border-border pt-1">
        <p>Inv #: {invoice.invoice_number}</p>
        <p>Date: {toDate(invoice.created).toLocaleString("en-IN")}</p>
        <p>Place of Supply: {invoice.place_of_supply || "—"}</p>
      </div>

      <div className="border-t border-dashed border-border pt-1">
        {items.map((item) => (
          <div key={item.id} className="mb-1">
            <p>
              {item.product_name}
              {item.pack_size ? ` (${item.pack_size})` : ""}
            </p>
            <div className="flex justify-between">
              <span>
                {item.qty} {item.unit} × {currency(item.unit_price)}
              </span>
              <span>{currency(item.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-border pt-1">
        <TotalRow label="Subtotal" value={invoice.subtotal} />
        <TotalRow label="CGST" value={invoice.cgst} />
        <TotalRow label="SGST" value={invoice.sgst} />
        {invoice.igst > 0 && <TotalRow label="IGST" value={invoice.igst} />}
        <TotalRow label="Total" value={invoice.total} bold />
        <TotalRow label="Paid" value={invoice.amount_paid} />
        <TotalRow label="Due" value={invoice.total - invoice.amount_paid} bold />
      </div>

      {invoice.remarks && <p className="border-t border-dashed border-border pt-1">{invoice.remarks}</p>}
    </div>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{currency(value)}</span>
    </div>
  )
}
