import { PageHeaderSkeleton, FormPanelSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-6 xl:grid-cols-2">
        <FormPanelSkeleton fields={2} />
        <FormPanelSkeleton fields={3} />
        <FormPanelSkeleton fields={2} />
        <FormPanelSkeleton fields={2} />
      </div>
    </div>
  )
}
