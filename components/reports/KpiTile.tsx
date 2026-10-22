import type { LucideIcon } from "lucide-react"
import { AnimatedNumber, type NumberFormat } from "./AnimatedNumber"

type Tone = "success" | "warning" | "danger" | "info"

const TONE_BG: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
}

const TONE_VAR: Record<Tone, string> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
}

interface KpiTileProps {
  label: string
  value: number
  format?: NumberFormat
  icon: LucideIcon
  tone?: Tone
  subtitle?: string
}

/** Compact KPI tile for the top "at a glance" strip — smaller and denser
 *  than ReportCard, which is reserved for the chart/detail cards below. */
export function KpiTile({ label, value, format, icon: Icon, tone = "info", subtitle }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface p-4 shadow-card">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_BG[tone]}`}
        style={{ boxShadow: `0 0 20px -8px var(--color-${TONE_VAR[tone]})` }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-fg/50">{label}</p>
        <p className="font-display text-xl font-bold text-fg">
          <AnimatedNumber value={value} format={format} />
        </p>
        {subtitle && <p className="text-[11px] text-fg/40">{subtitle}</p>}
      </div>
    </div>
  )
}
