import { cookies } from "next/headers"
import { createServerPocketBase } from "@/lib/pocketbase-client"
import type { UserRecord } from "@/lib/types/pocketbase"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopHeader } from "@/components/layout/TopHeader"

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const pb = createServerPocketBase(cookies().toString())
  // Local cookie read only (loadFromCookie does no network call) — display
  // purposes only. The real auth check is requireRole() in each page/action;
  // this never gates access on its own.
  const user = pb.authStore.record as UserRecord | null

  return (
    <div data-testid="cashier-shell" className="flex min-h-screen">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
