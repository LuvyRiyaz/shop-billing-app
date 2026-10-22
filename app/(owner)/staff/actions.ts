"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { ClientResponseError } from "pocketbase"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import {
  createStaffSchema,
  slugify,
  updateStaffSchema,
  type ActionResult,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "@/lib/validators/staff"
import type { UserRecord } from "@/lib/types/pocketbase"

// Reset always goes back to this fixed value (as asked) — not a random
// password, so an owner can tell a staff member what it is over the phone.
// It's exactly as strong as that trade-off implies; the UI nudges the
// owner to have the staff member change it after logging in.
const DEFAULT_RESET_PASSWORD = "Password123!"

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ClientResponseError) {
    return err.response?.message || err.message
  }
  return err instanceof Error ? err.message : fallback
}

export interface CreatedStaffCredentials {
  record: UserRecord
  loginEmail: string
  loginId: string
  password: string
}

/**
 * Creates a staff account using the OWNER'S OWN authenticated session —
 * never a superuser client. users.createRule (POCKETBASE_SETUP.md §2:
 * `@request.auth.role = "owner" && shop_id = @request.auth.shop_id`)
 * already allows this; there was never a need to expose superuser
 * credentials to the app for it.
 *
 * Generates a login email of the shape `staffNNN@<shop-slug>.local` and
 * retries with the next number on a collision (PocketBase enforces email
 * uniqueness globally across the whole auth collection, not per-shop) —
 * this is a lightweight "try, catch duplicate, retry" loop, not the
 * dedicated-counters-collection machinery §7B's invoice numbering uses,
 * because staff creation is a rare, owner-only admin action, not a
 * high-frequency concurrent one; the proportionate amount of care differs.
 *
 * IMPORTANT: the "Login ID" (e.g. "staff001") is NOT by itself enough to
 * log in — PocketBase's default identity field is the full email. The
 * staff member must enter the FULL generated email on /login, not just the
 * bare id. (Configuring a secondary "username"-style identity field so a
 * bare id works too is a real PocketBase feature, just not wired up here —
 * flagged, not silently promised.)
 */
export async function createStaff(input: CreateStaffInput): Promise<ActionResult<CreatedStaffCredentials>> {
  const parsed = createStaffSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid staff data" }
  }

  const pb = createServerPocketBase(cookies().toString())
  // Owner-only — matches "manager: no user management" from the original
  // spec. This is the server-action re-check (§8) alongside the rule above.
  const user = await requireRole(pb, ["owner"])

  const shop = await pb.collection("shops").getOne(user.shop_id)
  const slug = slugify(shop.name)
  const name = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim()

  const existingStaff = await pb.collection("users").getFullList({
    filter: pb.filter("shop_id = {:shopId}", { shopId: user.shop_id }),
  })

  let attemptN = existingStaff.length + 1
  const maxAttempts = 10

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const loginId = `staff${String(attemptN).padStart(3, "0")}`
    const email = `${loginId}@${slug}.local`

    try {
      const record = await pb.collection("users").create({
        email,
        // Auth-collection records default emailVisibility to false, which
        // strips `email` from EVERY API response for that record — list,
        // view, all of it — regardless of the requester's role (confirmed
        // from core/record_model.go's PublicExport(): the check is purely
        // `record.GetBool("emailVisibility")`, not viewer-permission-based).
        // Without this, the owner's own staff table can't read back the
        // login email it just generated.
        emailVisibility: true,
        password: parsed.data.password,
        passwordConfirm: parsed.data.password,
        name,
        shop_id: user.shop_id,
        role: parsed.data.role,
        phone: parsed.data.phone || "",
        is_active: true,
      })

      revalidatePath("/staff")
      return { ok: true, data: { record, loginEmail: email, loginId, password: parsed.data.password } }
    } catch (err) {
      const isDuplicateEmail = err instanceof ClientResponseError && Boolean(err.response?.data?.email)
      if (isDuplicateEmail && attempt < maxAttempts - 1) {
        attemptN++
        continue
      }
      return { ok: false, error: errorMessage(err, "Failed to create staff account") }
    }
  }

  return { ok: false, error: "Could not generate a unique login ID — please try again" }
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<ActionResult<UserRecord>> {
  const parsed = updateStaffSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid staff data" }
  }

  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["owner"])

  try {
    const existing = await pb.collection("users").getOne(id)
    if (existing.shop_id !== user.shop_id) {
      return { ok: false, error: "Staff member does not belong to this shop" }
    }

    const record = await pb.collection("users").update(id, {
      name: `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim(),
      phone: parsed.data.phone || "",
      role: parsed.data.role,
      is_active: parsed.data.isActive,
      // Self-healing for any staff record created before emailVisibility
      // was set at creation time (see createStaff) — editing one now also
      // fixes it, instead of leaving a silently-broken email forever.
      emailVisibility: true,
    })

    revalidatePath("/staff")
    return { ok: true, data: record }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to update staff account") }
  }
}

/** Needs manageRule (POCKETBASE_SETUP.md §2) to pass — a plain updateRule
 *  pass isn't enough to set a new password without the old one. */
export async function resetStaffPassword(id: string): Promise<ActionResult<{ password: string }>> {
  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["owner"])

  try {
    const existing = await pb.collection("users").getOne(id)
    if (existing.shop_id !== user.shop_id) {
      return { ok: false, error: "Staff member does not belong to this shop" }
    }
    if (existing.id === user.id) {
      return { ok: false, error: "Use your own account settings to change your own password" }
    }

    await pb.collection("users").update(id, {
      password: DEFAULT_RESET_PASSWORD,
      passwordConfirm: DEFAULT_RESET_PASSWORD,
    })

    return { ok: true, data: { password: DEFAULT_RESET_PASSWORD } }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to reset password") }
  }
}

export async function deleteStaff(id: string): Promise<ActionResult<null>> {
  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["owner"])

  try {
    const existing = await pb.collection("users").getOne(id)
    if (existing.shop_id !== user.shop_id) {
      return { ok: false, error: "Staff member does not belong to this shop" }
    }

    await pb.collection("users").delete(id)
    revalidatePath("/staff")
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to delete staff account") }
  }
}
