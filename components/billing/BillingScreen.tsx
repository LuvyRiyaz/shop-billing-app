"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { createBrowserPocketBase } from "@/lib/pocketbase-client"
import type { CustomerRecord, ProductRecord, ShopRecord } from "@/lib/types/pocketbase"
import type { CartLine, CreateInvoiceInput, CreateInvoiceResult } from "@/lib/validators/billing"
import { ProductGrid } from "./ProductGrid"
import { Cart } from "./Cart"
import { SmartAlertsBanner } from "./SmartAlertsBanner"

interface BillingScreenProps {
  shop: ShopRecord
  initialProducts: ProductRecord[]
  customers: CustomerRecord[]
  createInvoiceAction: (input: CreateInvoiceInput) => Promise<CreateInvoiceResult>
}

const FINALIZE_BUTTON_ID = "finalize-bill-btn"
const SEARCH_INPUT_ID = "billing-search"

export function BillingScreen({
  shop,
  initialProducts,
  customers,
  createInvoiceAction,
}: BillingScreenProps) {
  const [products, setProducts] = useState<ProductRecord[]>(initialProducts)
  const [lines, setLines] = useState<CartLine[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string | null>(null)

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products]
  )

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (category && p.category !== category) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.shade_code?.toLowerCase().includes(q)
      )
    })
  }, [products, search, category])

  // Realtime: keep local stock in sync with every other open billing
  // counter for this shop. Scoped by shop_id both in the subscribe filter
  // (server-enforced against the products viewRule, see POCKETBASE_SETUP.md
  // §10) and again on the client as a belt-and-braces check.
  useEffect(() => {
    const pb = createBrowserPocketBase()
    let unsubscribe: (() => void) | undefined
    // React Strict Mode (on by default in this app — no next.config.js
    // overrides it) double-invokes effects in dev: mount, cleanup, mount
    // again. If cleanup fires before subscribe()'s promise resolves,
    // `unsubscribe` would get assigned to a connection for an effect
    // instance that's already gone — this flag catches that so we tear the
    // late-arriving connection straight back down instead of leaking it.
    let cancelled = false

    pb.collection("products")
      .subscribe(
        "*",
        (e) => {
          if (e.record.shop_id !== shop.id) return
          setProducts((prev) => {
            if (e.action === "delete") {
              return prev.filter((p) => p.id !== e.record.id)
            }
            const exists = prev.some((p) => p.id === e.record.id)
            if (!exists) return [...prev, e.record]
            return prev.map((p) => (p.id === e.record.id ? e.record : p))
          })
        },
        { filter: `shop_id = "${shop.id}"` }
      )
      .then((unsub) => {
        if (cancelled) {
          unsub()
          return
        }
        unsubscribe = unsub
      })
      .catch((err) => {
        // A dropped/failed realtime connection must not crash the billing
        // screen — worst case, stock just stops live-updating here until
        // the next successful reconnect. Common causes: PocketBase isn't
        // running/reachable at NEXT_PUBLIC_POCKETBASE_URL, a transient
        // network blip, or (in dev) the Strict Mode double-invoke above
        // aborting the very first connection attempt.
        console.warn("Realtime products subscription failed:", err)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [shop.id])

  // Keep cart lines' stock ceiling in sync with realtime product updates —
  // otherwise a line added before a concurrent sale on another counter
  // would still show its old (now wrong) max quantity.
  useEffect(() => {
    setLines((prev) =>
      prev.map((line) => {
        const live = products.find((p) => p.id === line.productId)
        if (!live) return line
        return {
          ...line,
          availableStock: live.stock_qty,
          qty: Math.min(line.qty, Math.max(live.stock_qty, 0)),
        }
      })
    )
  }, [products])

  function addToCart(product: ProductRecord) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        const nextQty = Math.min(existing.qty + 1, product.stock_qty)
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: nextQty } : l))
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          hsnCode: product.hsn_code,
          unit: product.unit,
          unitPrice: product.price,
          gstRate: product.gst_rate,
          qty: 1,
          availableStock: product.stock_qty,
        },
      ]
    })
  }

  function changeQty(productId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(1, Math.min(qty, l.availableStock)) } : l))
    )
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  function clearCart() {
    setLines([])
  }

  // Keyboard shortcuts: F2 new bill, F4 finalize, ESC cancel current bill.
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault()
        clearCart()
        searchRef.current?.focus()
      } else if (e.key === "F4") {
        e.preventDefault()
        document.getElementById(FINALIZE_BUTTON_ID)?.click()
      } else if (e.key === "Escape") {
        clearCart()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[180px_1fr_340px]">
      <aside className="flex flex-col gap-1 lg:order-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => setCategory(null)}
          className={`h-11 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
            category === null
              ? "bg-primary text-[color:var(--color-primary-foreground)] shadow-card"
              : "bg-surface text-fg/70 hover:bg-surface/70 hover:text-fg"
          }`}
        >
          All products
        </motion.button>
        {categories.map((c) => (
          <motion.button
            key={c}
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => setCategory(c)}
            className={`h-11 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
              category === c
                ? "bg-primary text-[color:var(--color-primary-foreground)] shadow-card"
                : "bg-surface text-fg/70 hover:bg-surface/70 hover:text-fg"
            }`}
          >
            {c}
          </motion.button>
        ))}
      </aside>

      <main className="flex flex-col gap-3 lg:order-2">
        <SmartAlertsBanner products={products} />
        <input
          id={SEARCH_INPUT_ID}
          ref={searchRef}
          type="search"
          placeholder="Search by name, SKU, or shade code (F2)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <ProductGrid products={filteredProducts} shopType={shop.type} onAddToCart={addToCart} />
      </main>

      <section className="lg:order-3">
        <Cart
          shopId={shop.id}
          shopType={shop.type}
          lines={lines}
          customers={customers}
          onQtyChange={changeQty}
          onRemove={removeLine}
          onSubmit={createInvoiceAction}
          onSuccess={clearCart}
        />
      </section>
    </div>
  )
}
