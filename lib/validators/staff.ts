import { z } from "zod"

// Role is deliberately restricted to cashier/manager — an owner is
// provisioned directly in the PocketBase Admin UI (see README.md
// "Provisioning"), never through this in-app form, so there's no path here
// that could create a second owner account.
export const createStaffSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  role: z.enum(["cashier", "manager"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const updateStaffSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  role: z.enum(["cashier", "manager"]),
  isActive: z.boolean(),
})

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Shop name -> the login-email domain, e.g. "Syed Traders" -> "syedtraders". */
export function slugify(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return cleaned.slice(0, 24) || "shop"
}
