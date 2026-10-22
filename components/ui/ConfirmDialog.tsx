"use client"

import { motion } from "motion/react"
import { Modal } from "./Modal"

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = true,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidthClassName="max-w-sm">
      <p className="text-sm text-fg/70">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={onCancel}
          disabled={pending}
          className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-fg transition-colors hover:bg-bg disabled:opacity-50"
        >
          Cancel
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={onConfirm}
          disabled={pending}
          className={`h-10 rounded-lg px-4 text-sm font-semibold text-white shadow-card transition-colors disabled:opacity-50 ${
            destructive ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary/90"
          }`}
        >
          {pending ? "Working…" : confirmLabel}
        </motion.button>
      </div>
    </Modal>
  )
}
