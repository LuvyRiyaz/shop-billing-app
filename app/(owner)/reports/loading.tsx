export default function ReportsLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pb-12">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-9 w-32" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-24" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>

      {/* Chart-shaped skeletons, not generic blocks — a tall one for the
          line chart, two side-by-side for the bar/donut pair. */}
      <div className="skeleton h-80 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 w-full rounded-2xl" />
        <div className="skeleton h-72 w-full rounded-2xl" />
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-40 w-full rounded-2xl" />
      ))}
    </div>
  )
}
