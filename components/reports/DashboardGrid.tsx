"use client"

import { motion } from "motion/react"
import type { ReactNode } from "react"

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

/**
 * Wraps the top "at a glance" report cards in a single staggered reveal on
 * load — one orchestrated entrance rather than scattered per-card motion.
 * Client-only (Framer Motion); the page itself stays a server component and
 * only passes already-fetched data down through children.
 */
export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="flex flex-col gap-4">
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div key={i} variants={item}>
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  )
}
