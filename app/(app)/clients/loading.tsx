import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap items-center gap-3">
        <div className="skeleton-shimmer h-9 w-20 rounded-xl bg-surface-alt" />
        <div className="skeleton-shimmer h-9 w-28 rounded-xl bg-surface-alt" />
        <div className="skeleton-shimmer h-9 w-28 rounded-xl bg-surface-alt" />
        <div className="skeleton-shimmer ml-auto h-11 w-36 rounded-xl bg-surface-alt" />
      </div>
      <TableSkeleton rows={7} columns={3} />
    </div>
  )
}
