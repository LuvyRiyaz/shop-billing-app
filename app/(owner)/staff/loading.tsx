export default function StaffLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-12">
      <div className="flex items-center justify-between">
        <div className="skeleton h-9 w-32" />
        <div className="skeleton h-11 w-32" />
      </div>
      <div className="skeleton h-80 w-full rounded-2xl" />
    </div>
  )
}
