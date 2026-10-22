export default function BillingLoading() {
  return (
    <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[180px_1fr_340px]">
      <aside className="flex flex-col gap-1 lg:order-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-11" />
        ))}
      </aside>

      <main className="flex flex-col gap-3 lg:order-2">
        <div className="skeleton h-11 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      </main>

      <section className="lg:order-3">
        <div className="skeleton h-full min-h-[500px] w-full" />
      </section>
    </div>
  )
}
