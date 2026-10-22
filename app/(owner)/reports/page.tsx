import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AlertTriangle, Percent, Receipt, Tag, TrendingUp, Wallet, Wallet2 } from "lucide-react"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { getExpiryAlerts, getStockAlerts } from "@/lib/alerts"
import {
  resolveDateRange,
  summarizeBySalesman,
  summarizeCollections,
  summarizeGst,
  summarizeInvoiceKpis,
  summarizeOutstandingCredit,
  summarizePaymentModes,
  summarizeProfit,
  summarizeRevenueOverTime,
  summarizeTopProducts,
  sumRevenue,
  toDate,
  type DateRangePreset,
} from "@/lib/reports"
import { BigStat, ReportCard, Stat, StatGrid, StatusDot } from "@/components/reports/ReportCard"
import { KpiTile } from "@/components/reports/KpiTile"
import { RevenueLineChart } from "@/components/reports/RevenueLineChart"
import { TopProductsBarChart } from "@/components/reports/TopProductsBarChart"
import { PaymentModesDonutChart } from "@/components/reports/PaymentModesDonutChart"
import { DateRangeFilter } from "@/components/reports/DateRangeFilter"
import { ExportCsvButton } from "@/components/reports/ExportCsvButton"
import { DashboardGrid } from "@/components/reports/DashboardGrid"
import type { ProductRecord } from "@/lib/types/pocketbase"

const currency = (n: number) => `₹${n.toFixed(2)}`

const VALID_PRESETS: DateRangePreset[] = ["today", "week", "month", "last_month", "year", "custom"]

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { preset?: string; from?: string; to?: string }
}) {
  // Authenticated, per-request PocketBase client built from THIS request's
  // own cookie (never a shared/global client) — every query below filters
  // on shop_id = this user's own shop_id, and the shop_id itself comes from
  // the server-verified `user` record below, never from client input. Even
  // if that filter were somehow dropped, PocketBase's own viewRule
  // (shop_id = @request.auth.shop_id, see POCKETBASE_SETUP.md §3-§6) is the
  // actual tenant-isolation boundary — this is defense in depth on top of
  // it, not instead of it.
  const pb = createServerPocketBase(cookies().toString())

  const user = await requireRole(pb, ["owner", "manager"]).catch(() => null)
  if (!user) {
    redirect("/login")
  }

  const shop = await pb.collection("shops").getOne(user.shop_id)

  const preset = (VALID_PRESETS as string[]).includes(searchParams.preset ?? "")
    ? (searchParams.preset as DateRangePreset)
    : "month"
  const range = resolveDateRange(preset, searchParams.from, searchParams.to)
  const today = resolveDateRange("today")

  const [todayInvoices, rangeInvoices, rangeItems, customers, products] = await Promise.all([
    pb.collection("invoices").getFullList({
      filter: pb.filter("shop_id = {:shopId} && created >= {:start} && created < {:end}", {
        shopId: shop.id,
        start: today.start.toISOString(),
        end: today.end.toISOString(),
      }),
    }),
    pb.collection("invoices").getFullList({
      filter: pb.filter("shop_id = {:shopId} && created >= {:start} && created < {:end}", {
        shopId: shop.id,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      }),
      expand: "customer_id",
      sort: "-created",
    }),
    pb.collection("invoice_items").getFullList({
      filter: pb.filter(
        "shop_id = {:shopId} && invoice_id.created >= {:start} && invoice_id.created < {:end}",
        { shopId: shop.id, start: range.start.toISOString(), end: range.end.toISOString() }
      ),
      expand: "product_id",
    }),
    pb.collection("customers").getFullList({
      filter: pb.filter("shop_id = {:shopId} && is_active = true", { shopId: shop.id }),
    }),
    pb.collection("products").getFullList({
      filter: pb.filter("shop_id = {:shopId} && is_active = true", { shopId: shop.id }),
    }),
  ])

  const todayCollection = summarizeCollections(todayInvoices)
  const rangeRevenue = sumRevenue(rangeInvoices)
  const revenueOverTime = summarizeRevenueOverTime(rangeInvoices, range.start, range.end)
  const topProducts = summarizeTopProducts(rangeItems, 5)
  const paymentModes = summarizePaymentModes(rangeInvoices)
  const invoiceKpis = summarizeInvoiceKpis(rangeInvoices)
  const rangeGst = summarizeGst(rangeInvoices)
  const rangeProfit = summarizeProfit(rangeItems)
  const credit = summarizeOutstandingCredit(customers)
  const stockAlerts = getStockAlerts(products)
  const expiryAlerts = getExpiryAlerts(products)
  const salesmanTotals = shop.type === "agency" ? summarizeBySalesman(rangeInvoices) : []
  const alertCount = stockAlerts.critical.length + stockAlerts.warning.length + expiryAlerts.expired.length + expiryAlerts.expiringSoon.length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{shop.name}</h1>
          <p className="text-sm text-fg/50">
            Showing <span className="font-medium text-fg/70">{range.label}</span>
          </p>
        </div>
        <ExportCsvButton invoices={rangeInvoices} rangeLabel={range.label} />
      </header>

      <DateRangeFilter preset={preset} from={searchParams.from} to={searchParams.to} />

      {/* --- KPI strip: Today's Collection and Outstanding/Alerts are
          deliberately CURRENT-STATE, not affected by the date filter above
          (they don't have a meaningful "as of a past range" reading) —
          everything else here reacts to the selected range. --- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile
          label="Today's Collection"
          subtitle="Live — not range-filtered"
          value={todayCollection.totalCollected}
          icon={Wallet}
          tone="success"
        />
        <KpiTile label="Revenue" subtitle={range.label} value={rangeRevenue} icon={TrendingUp} tone="success" />
        <KpiTile
          label="Total Invoices"
          subtitle={range.label}
          value={invoiceKpis.count}
          format="integer"
          icon={Receipt}
          tone="info"
        />
        <KpiTile
          label="Average Bill Value"
          subtitle={range.label}
          value={invoiceKpis.avgBillValue}
          icon={TrendingUp}
          tone="info"
        />
        <KpiTile
          label="Total Tax Collected"
          subtitle={range.label}
          value={invoiceKpis.totalTax}
          icon={Percent}
          tone="info"
        />
        <KpiTile
          label="Total Discount Given"
          subtitle={range.label}
          value={invoiceKpis.totalDiscount}
          icon={Tag}
          tone="warning"
        />
        <KpiTile
          label="Outstanding Due"
          subtitle="Live — not range-filtered"
          value={credit.totalDue}
          icon={Wallet2}
          tone={credit.totalDue > 0 ? "warning" : "success"}
        />
        <KpiTile
          label="Smart Alerts"
          subtitle="Live — not range-filtered"
          value={alertCount}
          format="integer"
          icon={AlertTriangle}
          tone={stockAlerts.critical.length + expiryAlerts.expired.length > 0 ? "danger" : alertCount > 0 ? "warning" : "success"}
        />
      </div>

      {/* --- Charts --- */}

      <ReportCard title="Revenue over time" subtitle={range.label} icon={TrendingUp} iconTone="success">
        <RevenueLineChart data={revenueOverTime} />
      </ReportCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportCard title="Top 5 selling products" subtitle={range.label} icon={Receipt} iconTone="info">
          <TopProductsBarChart data={topProducts} />
        </ReportCard>

        <ReportCard title="Payment modes" subtitle={`${range.label} — amount actually collected`} icon={Wallet} iconTone="success">
          <PaymentModesDonutChart data={paymentModes} />
        </ReportCard>
      </div>

      {/* --- Detail cards --- */}

      <DashboardGrid>
        <ReportCard title="Outstanding due (udhaar)" subtitle={`${credit.customersWithDue} customer(s) owe you — live`}>
          <BigStat label="Total outstanding" value={credit.totalDue} tone={credit.totalDue > 0 ? "warn" : undefined} />
          {credit.top.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
              {credit.top.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-fg/80">
                  <span className="truncate">{c.name}</span>
                  <span className="font-medium text-warning">{currency(c.current_due)}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <ReportCard
          title="Smart alerts"
          subtitle="Live — current stock/expiry state"
          icon={AlertTriangle}
          iconTone={stockAlerts.critical.length + expiryAlerts.expired.length > 0 ? "danger" : "warn"}
        >
          {stockAlerts.critical.length === 0 &&
          stockAlerts.warning.length === 0 &&
          expiryAlerts.expired.length === 0 &&
          expiryAlerts.expiringSoon.length === 0 ? (
            <p className="text-sm text-fg/50">Nothing needs attention.</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <AlertList label="Reorder now" tone="danger" products={stockAlerts.critical} suffix={(p) => `${p.stock_qty} ${p.unit} left`} />
              <AlertList
                label="Expired"
                tone="danger"
                products={expiryAlerts.expired}
                suffix={(p) => `expired ${toDate(p.expiry_date!).toLocaleDateString("en-IN")}`}
              />
              <AlertList label="Low stock" tone="warn" products={stockAlerts.warning} suffix={(p) => `${p.stock_qty} ${p.unit} left`} />
              <AlertList
                label="Expiring soon"
                tone="warn"
                products={expiryAlerts.expiringSoon}
                suffix={(p) => `by ${toDate(p.expiry_date!).toLocaleDateString("en-IN")}`}
              />
            </div>
          )}
        </ReportCard>

        <ReportCard title="GST summary" subtitle={range.label}>
          <StatGrid>
            <Stat label="Taxable value" value={currency(rangeGst.taxable)} />
            <Stat label="CGST" value={currency(rangeGst.cgst)} />
            <Stat label="SGST" value={currency(rangeGst.sgst)} />
            <Stat label="IGST" value={currency(rangeGst.igst)} />
          </StatGrid>
        </ReportCard>

        <ReportCard title="Profit (approx.)" subtitle={`${range.label} — uses current cost prices, not a sale-time snapshot`}>
          <StatGrid>
            <Stat label="Revenue" value={currency(rangeProfit.revenue)} />
            <Stat label="Cost" value={currency(rangeProfit.cost)} />
            <Stat label="Profit" value={currency(rangeProfit.profit)} tone={rangeProfit.profit < 0 ? "danger" : undefined} />
            <Stat label="Margin" value={`${rangeProfit.marginPct.toFixed(1)}%`} />
          </StatGrid>
        </ReportCard>
      </DashboardGrid>

      {shop.type === "agency" && (
        <ReportCard title="Salesman-wise sales" subtitle={range.label}>
          {salesmanTotals.length === 0 ? (
            <p className="text-sm text-fg/50">No salesman recorded on any bill yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {salesmanTotals.map((s) => (
                <li key={s.salesman} className="flex items-center justify-between text-fg/80">
                  <span className="truncate">
                    {s.salesman} <span className="text-xs text-fg/50">({s.invoiceCount})</span>
                  </span>
                  <span className="font-medium text-fg">{currency(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>
      )}
    </div>
  )
}

function AlertList({
  label,
  tone,
  products,
  suffix,
}: {
  label: string
  tone: "danger" | "warn"
  products: ProductRecord[]
  suffix: (p: ProductRecord) => string
}) {
  if (products.length === 0) return null

  return (
    <div>
      <p className={`mb-1 text-xs font-medium ${tone === "danger" ? "text-danger" : "text-warning"}`}>{label}</p>
      <ul className="flex flex-col gap-1">
        {products.slice(0, 4).map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-fg/80">
            <StatusDot tone={tone} />
            <span className="flex-1 truncate">{p.name}</span>
            <span className={`font-medium ${tone === "danger" ? "text-danger" : "text-warning"}`}>{suffix(p)}</span>
          </li>
        ))}
        {products.length > 4 && <li className="pl-4 text-xs text-fg/50">+{products.length - 4} more</li>}
      </ul>
    </div>
  )
}
