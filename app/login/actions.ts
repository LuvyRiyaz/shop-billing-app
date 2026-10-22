"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ClientResponseError } from "pocketbase"
import { z } from "zod"
import { createServerPocketBase } from "@/lib/pocketbase-client"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * Sets the PocketBase auth cookie in the exact shape authStore.loadFromCookie
 * expects to read back — `{token, record}` under the SDK's default cookie
 * key "pb_auth" (see node_modules/pocketbase BaseAuthStore.exportToCookie /
 * loadFromCookie). We build it manually with next/headers' cookies() rather
 * than parsing exportToCookie()'s raw Set-Cookie string, since Server
 * Actions set cookies through that API, not raw headers.
 */
export async function login(formData: FormData): Promise<{ error: string } | undefined> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: "Enter a valid email and password" }
  }

  const pb = createServerPocketBase()

  let authResult
  try {
    authResult = await pb.collection("users").authWithPassword(parsed.data.email, parsed.data.password)
  } catch (err) {
    const message = err instanceof ClientResponseError ? "Invalid email or password" : "Login failed"
    return { error: message }
  }

  if (!authResult.record.is_active) {
    return { error: "This account has been disabled" }
  }

  cookies().set({
    name: "pb_auth",
    value: JSON.stringify({ token: pb.authStore.token, record: authResult.record }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  })

  redirect("/billing")
}
