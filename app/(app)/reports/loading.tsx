import { KpiGridSkeleton, PageHeaderSkeleton, CardListSkeleton, FormPanelSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FormPanelSkeleton fields={2} />
      <KpiGridSkeleton count={6} />
      <section className="grid gap-6 xl:grid-cols-2">
        <CardListSkeleton items={4} />
        <CardListSkeleton items={4} />
      </section>
    </div>
  )
}
