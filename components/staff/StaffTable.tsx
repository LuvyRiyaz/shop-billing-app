"use client"

import { useState } from "react"
import { toast } from "sonner"
import { motion } from "motion/react"
import { KeyRound } from "lucide-react"
import { CopyRow, StaffFormModal } from "./StaffFormModal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Modal } from "@/components/ui/Modal"
import type { ActionResult, CreateStaffInput, UpdateStaffInput } from "@/lib/validators/staff"
import type { CreatedStaffCredentials } from "@/app/(owner)/staff/actions"
import type { UserRecord } from "@/lib/types/pocketbase"

interface StaffTableProps {
  initialStaff: UserRecord[]
  createStaff: (input: CreateStaffInput) => Promise<ActionResult<CreatedStaffCredentials>>
  updateStaff: (id: string, input: UpdateStaffInput) => Promise<ActionResult<UserRecord>>
  resetStaffPassword: (id: string) => Promise<ActionResult<{ password: string }>>
  deleteStaff: (id: string) => Promise<ActionResult<null>>
}

export function StaffTable({ initialStaff, createStaff, updateStaff, resetStaffPassword, deleteStaff }: StaffTableProps) {
  const [staff, setStaff] = useState<UserRecord[]>(initialStaff)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<UserRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pendingReset, setPendingReset] = useState<UserRecord | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetPassword, setResetPassword] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(member: UserRecord) {
    setEditing(member)
    setFormOpen(true)
  }

  function handleSaved(record: UserRecord) {
    setStaff((prev) => {
      const exists = prev.some((p) => p.id === record.id)
      const next = exists ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, record]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const result = await deleteStaff(pendingDelete.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${pendingDelete.name} removed`)
      setStaff((prev) => prev.filter((p) => p.id !== pendingDelete.id))
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  async function confirmReset() {
    if (!pendingReset) return
    setResetting(true)
    try {
      const result = await resetStaffPassword(pendingReset.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setResetPassword(result.data.password)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-12">
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Staff</h1>
          <p className="text-sm text-fg/50">{staff.length} staff member(s)</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={openCreate}
          className="h-11 rounded-lg bg-gradient-to-b from-primary-light to-primary px-4 text-sm font-semibold text-[color:var(--color-primary-foreground)] shadow-card"
        >
          + Add staff
        </motion.button>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface shadow-card">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg/50">
              <th className="px-4 py-3 font-medium">Staff ID</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center font-display text-sm italic text-fg/40">
                  No staff yet — add your first cashier or manager.
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => openEdit(member)}
                  className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-bg ${
                    member.is_active ? "" : "opacity-50"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg/60">
                    {member.email ? member.email.split("@")[0] : "— (edit to fix)"}
                  </td>
                  <td className="px-4 py-3 font-medium text-fg">{member.name}</td>
                  <td className="px-4 py-3 text-fg/70">{member.phone || "—"}</td>
                  <td className="px-4 py-3 capitalize text-fg/70">{member.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        member.is_active ? "bg-success/10 text-success" : "bg-fg/10 text-fg/50"
                      }`}
                    >
                      {member.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingReset(member)
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg/50 transition-colors hover:bg-info/10 hover:text-info"
                        title="Reset password"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDelete(member)
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-fg/40 transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StaffFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        staff={editing}
        createStaff={createStaff}
        updateStaff={updateStaff}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove staff member?"
        message={pendingDelete ? `"${pendingDelete.name}" will be permanently removed and will no longer be able to log in.` : ""}
        confirmLabel="Remove"
        destructive
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingReset !== null && resetPassword === null}
        title="Reset password?"
        message={
          pendingReset
            ? `"${pendingReset.name}"'s password will be reset to a known default. They'll need the new password to log in again.`
            : ""
        }
        confirmLabel="Reset"
        destructive={false}
        pending={resetting}
        onConfirm={confirmReset}
        onCancel={() => setPendingReset(null)}
      />

      <Modal
        open={resetPassword !== null}
        onClose={() => {
          setResetPassword(null)
          setPendingReset(null)
        }}
        title="Password reset"
        maxWidthClassName="max-w-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            Shown only once — copy it now and share it with <span className="font-semibold">{pendingReset?.name}</span>{" "}
            directly. Ask them to change it after logging in.
          </div>
          {resetPassword && <CopyRow label="New password" value={resetPassword} />}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => {
              setResetPassword(null)
              setPendingReset(null)
            }}
            className="h-11 rounded-lg bg-gradient-to-b from-primary-light to-primary font-semibold text-[color:var(--color-primary-foreground)] shadow-card"
          >
            Done
          </motion.button>
        </div>
      </Modal>
    </div>
  )
}
