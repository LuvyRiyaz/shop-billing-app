import type { Metadata } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import { cookies } from "next/headers"
import { Toaster } from "sonner"
import type { ShopType } from "@/lib/types/pocketbase"
import "./globals.css"

export const metadata: Metadata = {
  title: "Shop Billing",
  description: "Multi-tenant retail billing for paint, wood, and agency shops",
}

// Body/UI face — modern, clean, highly legible at small sizes (forms,
// tables, a cashier's screen). The display face for headings/big stat
// numbers is Clash Display, loaded below via Fontshare's CDN since it
// isn't on Google Fonts and so can't go through next/font (see
// .font-display in globals.css for where it's actually applied).
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const VALID_SHOP_TYPES: ShopType[] = ["paint", "wood", "agency"]

function readShopType(): ShopType {
  // TODO(auth deliverable): derive this from the authenticated user's
  // shop_id -> shops.type lookup instead of a cookie. The cookie is a
  // placeholder so shop-type theming can be built and previewed before
  // session plumbing exists.
  const raw = cookies().get("shop_type")?.value
  return (VALID_SHOP_TYPES as string[]).includes(raw ?? "") ? (raw as ShopType) : "paint"
}

function readTheme(): "light" | "dark" | undefined {
  const raw = cookies().get("theme")?.value
  return raw === "light" || raw === "dark" ? raw : undefined
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const shopType = readShopType()
  const theme = readTheme()

  return (
    <html lang="en" data-shop-type={shopType} data-theme={theme} className={plusJakartaSans.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Toaster
          richColors
          theme="system"
          toastOptions={{
            style: {
              background: "var(--color-surface)",
              color: "var(--color-fg)",
              border: "1px solid var(--color-border)",
            },
          }}
        />
      </body>
    </html>
  )
}
