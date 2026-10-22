import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { AnimatedNumber, type NumberFormat } from "./AnimatedNumber"

type Tone = "warn" | "danger" | "success" | "info"

const TONE_TEXT: Record<Tone, string> = {
  danger: "text-danger",
  warn: "text-warning",
  success: "text-success",
  info: "text-info",
}

const TONE_BG: Record<Tone, string> = {
  danger: "bg-danger/10 text-danger",
  warn: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
}

interface ReportCardProps {
  title: string
  subtitle?: string
  /** A lucide icon, shown in a soft glowing circle next to the title — the
   *  4 top-level KPI cards use this, the detailed-report cards below don't
   *  need to since they're not meant to be glanceable from across a room. */
  icon?: LucideIcon
  iconTone?: Tone
  children: ReactNode
}

/**
 * Mobile-first report card shell: one stacked card per metric group, kept
 * to a handful of data points each so a phone screen never shows more than
 * one "thought" at a time (see the reports page for how each card is kept
 * under ~5 numbers).
 */
export function ReportCard({ title, subtitle, icon: Icon, iconTone = "info", children }: ReportCardProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_BG[iconTone]}`}
            style={{ boxShadow: `0 0 24px -8px var(--color-${iconTone === "warn" ? "warning" : iconTone})` }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h2 className="font-display text-sm font-semibold text-fg">{title}</h2>
          {subtitle ? <p className="text-xs text-fg/50">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-fg/50">{label}</span>
      <span className={`font-display text-lg font-semibold ${tone ? TONE_TEXT[tone] : "text-fg"}`}>{value}</span>
    </div>
  )
}

/**
 * The "glance" number at the top of a dashboard card — bigger than Stat,
 * and animates from 0 on mount via Framer Motion's useSpring (AnimatedNumber)
 * rather than just appearing.
 */
export function BigStat({
  label,
  value,
  format,
  tone,
}: {
  label: string
  value: number
  format?: NumberFormat
  tone?: "warn" | "danger"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-fg/50">{label}</span>
      <span className={`font-display text-4xl font-bold tracking-tight ${tone ? TONE_TEXT[tone] : "text-fg"}`}>
        <AnimatedNumber value={value} format={format} />
      </span>
    </div>
  )
}

/** Small colored dot for a list row — red for critical, amber for a warning. */
export function StatusDot({ tone }: { tone: "danger" | "warn" }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        tone === "danger" ? "bg-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_18%,transparent)]" : "bg-warning shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-warning)_18%,transparent)]"
      }`}
      aria-hidden="true"
    />
  )
}
