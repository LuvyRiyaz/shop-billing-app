"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidthClassName?: string
}

export function Modal({ open, onClose, title, children, maxWidthClassName = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className={`glass-panel flex max-h-[90vh] w-full ${maxWidthClassName} flex-col rounded-2xl border shadow-raised`}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 id="modal-title" className="font-display text-lg font-semibold text-fg">
                {title}
              </h2>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.08 }}
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-fg/50 transition-colors hover:bg-bg hover:text-fg"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>
            <div className="overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
