"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { BarChart3, ChevronLeft, ChevronRight, LayoutGrid, LogOut, Package, Users } from "lucide-react"
import { logout } from "@/app/logout/actions"
import type { UserRecord, UserRole } from "@/lib/types/pocketbase"

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutGrid; roles: UserRole[] }[] = [
  { href: "/billing", label: "Billing", icon: LayoutGrid, roles: ["owner", "cashier", "manager"] },
  { href: "/products", label: "Products", icon: Package, roles: ["owner", "manager"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["owner", "manager"] },
  // Owner-only — a manager has "reports + stock, no user management" per
  // the original spec, so Staff is deliberately not in their roles list
  // (unlike Products/Reports, which they share with owner).
  { href: "/staff", label: "Staff", icon: Users, roles: ["owner"] },
]

/**
 * Collapsible sidebar — the primary nav for both route groups. Collapse
 * state is a pure UI preference (persisted to localStorage, best-effort,
 * never the source of truth for anything) so it isn't worth wiring through
 * the server; this is the one place in the app that's fine being
 * client-only state with no server round trip.
 */
export function Sidebar({ user }: { user: UserRecord | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1")
    } catch {
      // private browsing / storage blocked — default (expanded) is fine
    }
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
      } catch {
        // ignore — see above
      }
      return next
    })
  }

  const items = NAV_ITEMS.filter((item) => !user || item.roles.includes(user.role))

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="glass-panel sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r print:hidden"
    >
      <div className="flex h-16 items-center gap-2.5 overflow-hidden px-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-glow-primary" aria-hidden="true" />
        {!collapsed && <span className="whitespace-nowrap font-display text-base font-semibold text-fg">Shop Billing</span>}
        <button
          type="button"
          onClick={toggle}
          className="mb-2 flex w-full items-center justify-end rounded-lg pt-2 text-fg/40 transition-colors hover:bg-fg/5 hover:text-fg"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}>
              <motion.div
                whileHover={{ x: collapsed ? 0 : 3 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-fg/60 hover:bg-fg/5 hover:text-fg"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-[filter] duration-200 ${
                    active
                      ? "drop-shadow-[0_0_6px_var(--color-primary)]"
                      : "group-hover:drop-shadow-[0_0_6px_var(--color-primary)]"
                  }`}
                />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border/60 p-3">
        {user && (
          <div className={`flex items-center gap-2 overflow-hidden rounded-xl p-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-light to-primary font-display text-sm font-semibold text-[color:var(--color-primary-foreground)]">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{user.name}</p>
                  <p className="truncate text-xs capitalize text-fg/50">{user.role}</p>
                </div>
                <form action={logout}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.08 }}
                    type="submit"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-fg/40 transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label="Log out"
                  >
                    <LogOut className="h-4 w-4" />
                  </motion.button>
                </form>
              </>
            )}
          </div>
        )}

        {collapsed && user && (
          <form action={logout} className="mt-1">
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="submit"
              className="flex w-full items-center justify-center rounded-lg py-2 text-fg/40 transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </form>
        )}
      </div>
    </motion.aside>
  )
}
