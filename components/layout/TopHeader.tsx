"use client"

import { usePathname } from "next/navigation"

const TITLES: Record<string, string> = {
  "/billing": "Billing",
  "/products": "Products",
  "/reports": "Reports",
}

/** Slim glass top bar — the sidebar owns primary nav/identity/logout, this
 *  just gives each page a consistent place for its title. */
export function TopHeader() {
  const pathname = usePathname()
  const title = Object.entries(TITLES).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? ""

  return (
    <header className="glass-panel sticky top-0 z-20 flex h-14 items-center border-b px-6 print:hidden">
      <h1 className="font-display text-sm font-semibold text-fg/70">{title}</h1>
    </header>
  )
}
