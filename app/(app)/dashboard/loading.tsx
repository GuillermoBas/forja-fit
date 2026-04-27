import { KpiGridSkeleton, PageHeaderSkeleton, CardListSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <KpiGridSkeleton count={6} />
      <section className="grid gap-6 xl:grid-cols-2">
        <CardListSkeleton items={3} />
        <CardListSkeleton items={3} />
      </section>
    </div>
  )
}
