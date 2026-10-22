export default function ProductsLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 pb-12">
      <div className="flex items-center justify-between">
        <div className="skeleton h-9 w-40" />
        <div className="flex gap-2">
          <div className="skeleton h-11 w-44" />
          <div className="skeleton h-11 w-32" />
          <div className="skeleton h-11 w-36" />
        </div>
      </div>
      <div className="skeleton h-96 w-full rounded-2xl" />
    </div>
  )
}
