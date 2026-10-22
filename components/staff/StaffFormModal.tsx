"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/Modal"
import {
  createStaffSchema,
  updateStaffSchema,
  type ActionResult,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "@/lib/validators/staff"
import type { CreatedStaffCredentials } from "@/app/(owner)/staff/actions"
import type { UserRecord, UserRole } from "@/lib/types/pocketbase"

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-fg/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
const labelClass = "flex flex-col gap-1 text-xs font-medium text-fg/60"

interface StaffFormState {
  firstName: string
  lastName: string
  phone: string
  role: UserRole
  isActive: boolean
  password: string
}

function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName: firstName ?? "", lastName: rest.join(" ") }
}

function emptyForm(): StaffFormState {
  return { firstName: "", lastName: "", phone: "", role: "cashier", isActive: true, password: "" }
}

function formFromStaff(staff: UserRecord): StaffFormState {
  return { ...splitName(staff.name), phone: staff.phone ?? "", role: staff.role, isActive: staff.is_active, password: "" }
}

interface StaffFormModalProps {
  open: boolean
  onClose: () => void
  /** null = create mode, otherwise editing this staff member. */
  staff: UserRecord | null
  createStaff: (input: CreateStaffInput) => Promise<ActionResult<CreatedStaffCredentials>>
  updateStaff: (id: string, input: UpdateStaffInput) => Promise<ActionResult<UserRecord>>
  onSaved: (record: UserRecord) => void
}

export function StaffFormModal({ open, onClose, staff, createStaff, updateStaff, onSaved }: StaffFormModalProps) {
  const [form, setForm] = useState<StaffFormState>(() => (staff ? formFromStaff(staff) : emptyForm()))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [credentials, setCredentials] = useState<CreatedStaffCredentials | null>(null)

  useEffect(() => {
    if (open) {
      setForm(staff ? formFromStaff(staff) : emptyForm())
      setError(null)
      setCredentials(null)
    }
  }, [open, staff])

  function set<K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleClose() {
    // Creating a staff account without ever showing/copying the generated
    // credentials would be a dead end — the owner has no other way to see
    // that password again. Closing from the credentials screen is fine
    // (the record's already saved); closing mid-form is the normal cancel.
    if (credentials) {
      onSaved(credentials.record)
    }
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (staff) {
      const parsed = updateStaffSchema.safeParse(form)
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Please check the form")
        return
      }
      setSubmitting(true)
      try {
        const result = await updateStaff(staff.id, parsed.data)
        if (!result.ok) {
          setError(result.error)
          toast.error(result.error)
          return
        }
        toast.success(`${result.data.name} updated`)
        onSaved(result.data)
        onClose()
      } finally {
        setSubmitting(false)
      }
      return
    }

    const parsed = createStaffSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form")
      return
    }
    setSubmitting(true)
    try {
      const result = await createStaff(parsed.data)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`${result.data.record.name}'s account created`)
      setCredentials(result.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={staff ? `Edit ${staff.name}` : "Add staff"}>
      {credentials ? (
        <CredentialsReveal credentials={credentials} onDone={handleClose} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              First name
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Last name
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Phone
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Role
              <select value={form.role} onChange={(e) => set("role", e.target.value as UserRole)} className={inputClass}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
              </select>
            </label>
          </div>

          {!staff && (
            <label className={labelClass}>
              Password
              <input
                type="text"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                className={inputClass}
              />
            </label>
          )}

          {staff && (
            <label className="flex items-center gap-2 text-sm font-medium text-fg">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--color-primary)]"
              />
              Active
            </label>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              onClick={onClose}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-fg hover:bg-bg"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              whileTap={submitting ? undefined : { scale: 0.95 }}
              whileHover={submitting ? undefined : { scale: 1.05 }}
              disabled={submitting}
              className="h-10 rounded-lg bg-gradient-to-b from-primary-light to-primary px-5 text-sm font-semibold text-[color:var(--color-primary-foreground)] shadow-card disabled:opacity-50"
            >
              {submitting ? "Saving…" : staff ? "Save changes" : "Create account"}
            </motion.button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy — select and copy manually")
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg/60">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
        <code className="flex-1 truncate text-sm text-fg">{value}</code>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={handleCopy}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg/50 hover:bg-surface hover:text-fg"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </motion.button>
      </div>
    </div>
  )
}

function CredentialsReveal({ credentials, onDone }: { credentials: CreatedStaffCredentials; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        This password is shown only once — copy it now and share it with{" "}
        <span className="font-semibold">{credentials.record.name}</span> directly.
      </div>

      <CopyRow label="Login ID" value={credentials.loginId} />
      <CopyRow label="Login Email (what they actually type in on the sign-in page)" value={credentials.loginEmail} />
      <CopyRow label="Password" value={credentials.password} />

      <p className="text-xs text-fg/50">
        Note: they sign in with the full <strong>Login Email</strong> above, not the bare Login ID — PocketBase's
        sign-in identity is the email field.
      </p>

      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        onClick={onDone}
        className="h-11 rounded-lg bg-gradient-to-b from-primary-light to-primary font-semibold text-[color:var(--color-primary-foreground)] shadow-card"
      >
        Done
      </motion.button>
    </div>
  )
}
