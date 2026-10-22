import PocketBase from "pocketbase"
import type { TypedPocketBase, UserRecord, UserRole } from "./types/pocketbase"

// Resolved lazily (not at module scope) so that an env var only one side
// needs missing doesn't break imports used by the other side — e.g. a
// shared "use server" file that imports this module for types shouldn't
// crash at import time over a browser-only var.

/** The only URL the browser is ever allowed to talk to. */
function resolveBrowserUrl(): string {
  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_POCKETBASE_URL is not set — this is the only PocketBase " +
        "URL that may be public. See .env.local.example."
    )
  }
  return url
}

/**
 * The URL the Next.js SERVER uses to reach PocketBase. Prefers
 * `POCKETBASE_INTERNAL_URL` — e.g. `http://127.0.0.1:8090` or a
 * docker-compose service name like `http://pocketbase:8090` — so
 * server-to-PocketBase traffic on a VPS stays on the private network
 * instead of round-tripping out through the public domain/reverse proxy.
 * Falls back to the public URL for simple deployments where Next.js and
 * PocketBase aren't co-located. This is independent of what the browser
 * uses; both reach the same PocketBase instance, so an auth cookie minted
 * via one URL is valid when sent to the other.
 */
function resolveServerUrl(): string {
  const url = process.env.POCKETBASE_INTERNAL_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL
  if (!url) {
    throw new Error(
      "Neither POCKETBASE_INTERNAL_URL nor NEXT_PUBLIC_POCKETBASE_URL is set. " +
        "The server needs at least one. See .env.local.example."
    )
  }
  return url
}

function newClient(url: string): TypedPocketBase {
  const pb = new PocketBase(url) as TypedPocketBase
  // PocketBase cancels an in-flight request when an identical one is fired
  // before it resolves. That's wrong for us: a billing screen can have a
  // realtime subscribe and a list fetch in flight at once, and a global
  // singleton would make one cancel the other across unrelated components.
  // Disabling it, combined with never sharing a client instance, is what
  // makes concurrent realtime + fetches safe in Next.js.
  pb.autoCancellation(false)
  return pb
}

/**
 * Creates a fresh PocketBase client for a single client component.
 *
 * Always call this inside the component (e.g. in a `useState(() => ...)`
 * initializer or `useMemo`), never at module scope — a module-level
 * singleton would share one authStore/cancellation queue across every
 * component on the page, which is exactly the race condition this avoids.
 */
export function createBrowserPocketBase(): TypedPocketBase {
  if (typeof window === "undefined") {
    throw new Error("createBrowserPocketBase() must only be called in a client component")
  }
  const pb = newClient(resolveBrowserUrl())
  pb.authStore.loadFromCookie(document.cookie)
  return pb
}

/**
 * Creates a fresh PocketBase client for one server-side request (Server
 * Component, Server Action, or Route Handler), authenticated from that
 * request's own cookie. Pass `cookies().toString()` or the raw `Cookie`
 * request header — never reuse a client across requests.
 */
export function createServerPocketBase(cookieHeader?: string): TypedPocketBase {
  const pb = newClient(resolveServerUrl())
  if (cookieHeader) {
    pb.authStore.loadFromCookie(cookieHeader)
  }
  return pb
}

/**
 * Serializes the client's current auth state back into a Set-Cookie value,
 * for use after login/refresh in a Route Handler or Server Action response.
 */
export function exportAuthCookie(pb: TypedPocketBase): string {
  return pb.authStore.exportToCookie({ httpOnly: true, secure: true, sameSite: "strict" })
}

/**
 * Returns the authenticated user for this client, typed, or null.
 * `pb.authStore.isValid` only checks token shape/expiry — it does NOT
 * re-verify the account is still active against the server, so this also
 * refreshes once to catch a staff account that was disabled mid-session.
 */
export async function getCurrentUser(pb: TypedPocketBase): Promise<UserRecord | null> {
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return null
  }

  try {
    const fresh = await pb.collection("users").authRefresh()
    return fresh.record
  } catch {
    // Token rejected server-side (revoked, user disabled, etc.) — treat as
    // logged out rather than trusting the stale local authStore.record.
    pb.authStore.clear()
    return null
  }
}

/**
 * Authorization boundary for Server Actions / Route Handlers.
 *
 * This is the server-side re-check required alongside the PocketBase API
 * Rules (see POCKETBASE_SETUP.md §8): a client-side role check can be
 * bypassed by calling the server action directly, so every mutating action
 * must call this before doing anything, using a client built from the
 * request's own verified cookie — never a role passed in from the client.
 */
export async function requireRole(
  pb: TypedPocketBase,
  allowedRoles: UserRole[]
): Promise<UserRecord> {
  const user = await getCurrentUser(pb)
  if (!user) {
    throw new Error("Not authenticated")
  }
  if (!user.is_active) {
    throw new Error("Account is disabled")
  }
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Role '${user.role}' is not permitted to perform this action`)
  }
  return user
}
