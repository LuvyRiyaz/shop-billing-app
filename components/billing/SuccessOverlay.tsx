"use client"

import { AnimatePresence, motion } from "motion/react"

interface SuccessOverlayProps {
  show: boolean
  message: string
}

/**
 * Full-screen "bill finalized" moment — a checkmark that draws itself via
 * SVG `pathLength` animation, not a static icon that just fades in. Purely
 * presentational: Cart.tsx owns the timer that flips `show` back off, this
 * component has no state of its own.
 */
export function SuccessOverlay({ show, message }: SuccessOverlayProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-bg/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10 shadow-[0_0_60px_-10px_var(--color-success)]"
          >
            <svg viewBox="0 0 52 52" className="h-14 w-14">
              <motion.circle
                cx="26"
                cy="26"
                r="23"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
              <motion.path
                d="M14.5 27.5l7 7 16-16"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.45, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.3 }}
            className="font-display text-xl font-semibold text-fg"
          >
            {message}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
