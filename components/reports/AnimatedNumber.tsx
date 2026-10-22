"use client"

import { useEffect } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"

export type NumberFormat = "currency" | "integer" | "percent"

// A string key, not a function prop: ReportCard/KpiTile that render this
// are plain Server Components (no "use client"), and a closure can't cross
// the server->client boundary as a prop ("Functions cannot be passed
// directly to Client Components") — only serializable values like a string
// can. The actual formatter function lives here, resolved client-side.
const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
  currency: (n) => `₹${n.toFixed(2)}`,
  integer: (n) => n.toFixed(0),
  percent: (n) => `${n.toFixed(1)}%`,
}

interface AnimatedNumberProps {
  value: number
  format?: NumberFormat
}

/** Counts up from 0 to `value` on mount/change via a spring, instead of the
 *  number just appearing — used by ReportCard's BigStat and KpiTile. */
export function AnimatedNumber({ value, format = "currency" }: AnimatedNumberProps) {
  const formatter = FORMATTERS[format]
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 1 })
  const display = useTransform(spring, (v) => formatter(v))

  useEffect(() => {
    motionValue.set(value)
  }, [value, motionValue])

  return <motion.span>{display}</motion.span>
}
