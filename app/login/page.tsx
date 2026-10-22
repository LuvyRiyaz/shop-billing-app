"use client"

import { useState } from "react"
import { login } from "./actions"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await login(new FormData(e.currentTarget))
      if (result?.error) {
        setError(result.error)
      }
      // On success the action redirects server-side and this line is
      // unreached (redirect() throws a control-flow signal Next.js catches).
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-semibold text-fg">Sign in</h1>

        <label className="flex flex-col gap-1 text-sm text-fg/70">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="h-11 rounded border border-border bg-bg px-3"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-fg/70">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-11 rounded border border-border bg-bg px-3"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-md bg-primary font-medium text-[color:var(--color-primary-foreground)] disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
