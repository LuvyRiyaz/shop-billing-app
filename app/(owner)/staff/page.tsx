import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { StaffTable } from "@/components/staff/StaffTable"
import { createStaff, updateStaff, resetStaffPassword, deleteStaff } from "./actions"

export default async function StaffPage() {
  const pb = createServerPocketBase(cookies().toString())

  // Owner-only — a manager has no user-management permission at all (not
  // "reports+stock" like Products/Reports), matching the original spec and
  // the users collection's API rules (POCKETBASE_SETUP.md §2).
  const user = await requireRole(pb, ["owner"]).catch(() => null)
  if (!user) {
    redirect("/login")
  }

  // "Staff" means the people the owner manages, not the owner's own
  // account — exclude it so there's no confusing self-edit/self-delete row
  // in a table whose actions (delete, reset password) assume "someone else".
  const staff = await pb.collection("users").getFullList({
    filter: pb.filter("shop_id = {:shopId} && role != {:ownerRole}", { shopId: user.shop_id, ownerRole: "owner" }),
    sort: "name",
  })

  return (
    <StaffTable
      initialStaff={staff}
      createStaff={createStaff}
      updateStaff={updateStaff}
      resetStaffPassword={resetStaffPassword}
      deleteStaff={deleteStaff}
    />
  )
}
