"use client"

import { motion } from "motion/react"
import { Package, Wrench } from "lucide-react"
import type { ProductRecord, ShopType } from "@/lib/types/pocketbase"

const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

interface ProductGridProps {
  products: ProductRecord[]
  shopType: ShopType
  onAddToCart: (product: ProductRecord) => void
}

export function ProductGrid({ products, shopType, onAddToCart }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/70 bg-surface/50 font-display text-sm italic text-fg/50">
        No products match your search.
      </div>
    )
  }

  return (
    <motion.div
      variants={gridVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3"
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} shopType={shopType} onAdd={() => onAddToCart(product)} />
      ))}
    </motion.div>
  )
}

function ProductCard({
  product,
  shopType,
  onAdd,
}: {
  product: ProductRecord
  shopType: ShopType
  onAdd: () => void
}) {
  const outOfStock = product.stock_qty <= 0
  const lowStock = !outOfStock && product.stock_qty <= product.low_stock_threshold

  // A paint shop bills paints and hardware accessories (putty, rollers,
  // sanding paper) on the same invoice, so the card needs a quick visual
  // tell for which is which. Wood/agency shops don't branch on
  // category_type today (it just sits at its default "paint" value for
  // them) so their own badges (CFT / scheme) are unaffected below.
  const isPaintShop = shopType === "paint"
  const isPaintItem = isPaintShop && product.category_type === "paint"
  const isHardwareItem = isPaintShop && product.category_type === "hardware"

  const subtitleParts = [
    isPaintItem && product.shade_code ? `Shade ${product.shade_code}` : null,
    product.pack_size || null,
  ].filter(Boolean)

  const pillTone = outOfStock ? "danger" : lowStock ? "warning" : "success"

  return (
    <motion.div
      variants={cardVariants}
      whileHover={outOfStock ? undefined : { y: -4, scale: 1.015 }}
      whileTap={outOfStock ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className="group relative rounded-2xl"
    >
      {/* Gradient "ring" — a neutral border at rest, a vivid brand gradient
          on hover. Achieved with an absolutely-positioned background behind
          an inset button, not an actual CSS border, so the gradient can
          animate smoothly via a plain opacity/background transition. */}
      <div className="absolute inset-0 rounded-2xl bg-border/70 transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-primary group-hover:via-accent group-hover:to-primary-light" />

      <button
        type="button"
        disabled={outOfStock}
        onClick={onAdd}
        className="relative m-[1.5px] flex min-h-[44px] w-[calc(100%-3px)] flex-col gap-2.5 rounded-[15px] bg-surface p-3 text-left shadow-card transition-shadow duration-300 group-hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        <div className="flex items-start gap-2">
          {/* "App icon" tile — the shade color for paint, a wrench glyph for
              hardware/generic. Sized down from the original 40px so a
              2-line product name has real room next to it instead of being
              squeezed to a handful of characters on a ~170px card. */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
            style={{
              background:
                isPaintItem && product.color_base
                  ? product.color_base
                  : `linear-gradient(135deg, var(--color-primary-light), var(--color-primary))`,
            }}
          >
            {isHardwareItem ? <Wrench className="h-3.5 w-3.5" /> : !isPaintItem ? <Package className="h-3.5 w-3.5" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            {/* 2-line clamp, not a single-line truncate — a one-line cutoff
                was chopping ordinary-length names down to a handful of
                characters on these card widths. */}
            <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">{product.name}</p>
            {subtitleParts.length > 0 && <p className="truncate text-xs text-fg/50">{subtitleParts.join(" · ")}</p>}
            {shopType === "wood" && product.cft ? <p className="text-xs text-fg/50">{product.cft.toFixed(2)} CFT</p> : null}
            {shopType === "agency" && product.scheme ? (
              <span className="mt-0.5 inline-block w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {product.scheme}
              </span>
            ) : null}
          </div>
        </div>

        {/* flex-wrap, not a rigid single row: on a narrow card the pill now
            drops to its own line below the price instead of either side
            getting squeezed/clipped — confirmed from the earlier screenshot
            where even a short string ("18 left") was being cut off, which
            only happens when a flex row has no room for either child. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <span className="whitespace-nowrap font-display text-base font-semibold text-fg">
            ₹{product.price.toFixed(2)}
            <span className="font-sans text-[11px] font-normal text-fg/40">/{product.unit}</span>
          </span>
          <StockPill tone={pillTone} label={outOfStock ? "Out of stock" : `${product.stock_qty} left`} />
        </div>
      </button>
    </motion.div>
  )
}

function StockPill({ tone, label }: { tone: "success" | "warning" | "danger"; label: string }) {
  const toneClass =
    tone === "danger"
      ? "bg-danger/10 text-danger"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-success/10 text-success"

  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {label}
    </span>
  )
}
