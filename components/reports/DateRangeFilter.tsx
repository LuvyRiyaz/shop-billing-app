"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { motion } from "motion/react"
import type { DateRangePreset } from "@/lib/reports"

const PRESETS: { value: Exclude<DateRangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "year", label: "This Year" },
]

/**
 * Pure URL-state filter: picking a preset (or applying a custom range)
 * navigates to `?preset=...[&from=...&to=...]`, which re-renders the server
 * component (app/(owner)/reports/page.tsx) with the new range — the
 * dashboard "reacting to the filter" is just a normal Next.js navigation,
 * not a second client-side data-fetching path to keep in sync with the
 * server one. loading.tsx's chart skeleton (already built) covers the
 * transition for free.
 */
export function DateRangeFilter({ preset, from, to }: { preset: DateRangePreset; from?: string; to?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [customFrom, setCustomFrom] = useState(from ?? "")
  const [customTo, setCustomTo] = useState(to ?? "")
  const [showCustom, setShowCustom] = useState(preset === "custom")

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  function selectPreset(value: Exclude<DateRangePreset, "custom">) {
    setShowCustom(false)
    navigate({ preset: value, from: "", to: "" })
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    navigate({ preset: "custom", from: customFrom, to: customTo })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <motion.button
          key={p.value}
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => selectPreset(p.value)}
          className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
            preset === p.value
              ? "bg-primary text-[color:var(--color-primary-foreground)] shadow-card"
              : "bg-surface text-fg/60 hover:text-fg"
          }`}
        >
          {p.label}
        </motion.button>
      ))}

      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => setShowCustom((s) => !s)}
        className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
          preset === "custom"
            ? "bg-primary text-[color:var(--color-primary-foreground)] shadow-card"
            : "bg-surface text-fg/60 hover:text-fg"
        }`}
      >
        Custom Range
      </motion.button>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 rounded border border-border bg-bg px-2 text-xs text-fg"
            aria-label="From date"
          />
          <span className="text-xs text-fg/40">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 rounded border border-border bg-bg px-2 text-xs text-fg"
            aria-label="To date"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={applyCustom}
            disabled={!customFrom || !customTo}
            className="h-8 rounded bg-primary px-3 text-xs font-semibold text-[color:var(--color-primary-foreground)] disabled:opacity-50"
          >
            Apply
          </motion.button>
        </div>
      )}
    </div>
  )
}
