import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PROTECTED_PREFIXES = ["/billing", "/reports", "/products", "/staff"]
const AUTH_COOKIE_NAME = "pb_auth"

/**
 * Route-gating only — NOT the security boundary. This just avoids flashing
 * a protected page before bouncing to /login; it checks the auth cookie's
 * *shape* (a non-empty token string), not its validity, because verifying a
 * token means asking PocketBase, and middleware shouldn't make a network
 * round trip on every request. The real checks are requireRole() on the
 * server (lib/pocketbase-client.ts) and the PocketBase API Rules
 * themselves (POCKETBASE_SETUP.md §8) — both re-verify server-side and
 * neither trusts this middleware's pass having run.
 */
export function middleware(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))
  if (!isProtected) {
    return NextResponse.next()
  }

  const rawCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value
  let hasToken = false
  if (rawCookie) {
    try {
      const parsed = JSON.parse(rawCookie)
      hasToken = typeof parsed?.token === "string" && parsed.token.length > 0
    } catch {
      hasToken = false
    }
  }

  if (!hasToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/billing/:path*", "/reports/:path*", "/products/:path*", "/staff/:path*"],
}
