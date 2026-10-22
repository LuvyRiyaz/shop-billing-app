"use client"

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fixed bottom-4 right-4 h-11 rounded-md bg-primary px-4 font-medium text-[color:var(--color-primary-foreground)] print:hidden"
    >
      Print
    </button>
  )
}
