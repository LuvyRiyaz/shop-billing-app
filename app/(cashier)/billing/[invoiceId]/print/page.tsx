import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { InvoicePrint, type PrintLayout } from "@/components/billing/InvoicePrint"
import { PrintButton } from "@/components/billing/PrintButton"

const VALID_LAYOUTS: PrintLayout[] = ["a4", "thermal-58", "thermal-80"]

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: { invoiceId: string }
  searchParams: { layout?: string }
}) {
  const pb = createServerPocketBase(cookies().toString())

  // Printing is a read, not a privileged write — any authenticated staff of
  // the shop can reprint a bill, same as the invoices viewRule (§5).
  const user = await requireRole(pb, ["cashier", "owner", "manager"]).catch(() => null)
  if (!user) {
    redirect("/login")
  }

  const layout = VALID_LAYOUTS.includes(searchParams.layout as PrintLayout)
    ? (searchParams.layout as PrintLayout)
    : "a4"

  const invoice = await pb.collection("invoices").getOne(params.invoiceId).catch(() => null)
  if (!invoice || invoice.shop_id !== user.shop_id) {
    notFound()
  }

  const [items, shop, customer] = await Promise.all([
    pb.collection("invoice_items").getFullList({
      filter: pb.filter("invoice_id = {:id}", { id: invoice.id }),
      sort: "created",
    }),
    pb.collection("shops").getOne(invoice.shop_id),
    invoice.customer_id ? pb.collection("customers").getOne(invoice.customer_id).catch(() => null) : null,
  ])

  return (
    <div className="min-h-screen bg-bg">
      <InvoicePrint layout={layout} shop={shop} invoice={invoice} items={items} customer={customer} />
      <PrintButton />
    </div>
  )
}
