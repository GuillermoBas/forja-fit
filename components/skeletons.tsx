import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-2xl bg-surface-alt", className)} />
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="h-8 w-48" />
      <SkeletonBlock className="h-4 w-full max-w-lg" />
    </div>
  )
}

export function KpiGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-5 w-32" />
              </div>
              <SkeletonBlock className="h-12 w-12 rounded-2xl" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <SkeletonBlock className="h-10 w-24" />
            <SkeletonBlock className="h-4 w-36" />
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-4 w-72 max-w-full" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
          <SkeletonBlock className="h-11 w-full md:max-w-sm" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: rows }, (_, rowIndex) => (
            <div key={rowIndex} className="grid gap-3 rounded-2xl border border-border/70 p-3 md:grid-cols-4">
              {Array.from({ length: Math.min(columns, 4) }, (_, columnIndex) => (
                <SkeletonBlock key={columnIndex} className="h-5 w-full" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function FormPanelSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-4 pt-0 md:grid-cols-2">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-11 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function CardListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        {Array.from({ length: items }, (_, index) => (
          <div key={index} className="rounded-2xl border border-border/80 p-4">
            <div className="flex items-center justify-between gap-4">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <SkeletonBlock className="mt-3 h-4 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function CalendarSkeleton() {
  return (
    <Card className="overflow-hidden rounded-[1.1rem]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 bg-surface px-3 py-2">
        <SkeletonBlock className="h-9 w-24" />
        <SkeletonBlock className="h-9 w-24" />
        <SkeletonBlock className="h-9 w-24" />
        <SkeletonBlock className="ml-auto h-9 w-36" />
      </div>
      <div className="grid grid-cols-7 gap-px bg-border/70 p-px">
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="min-h-24 bg-surface p-2">
            <SkeletonBlock className="mb-3 h-6 w-6 rounded-full" />
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="mt-2 h-5 w-3/4" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function StaffRouteSkeleton({ table = true, kpis = false }: { table?: boolean; kpis?: boolean }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {kpis ? <KpiGridSkeleton /> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <FormPanelSkeleton fields={4} />
        <FormPanelSkeleton fields={3} />
      </div>
      {table ? <TableSkeleton rows={6} columns={5} /> : <CardListSkeleton />}
    </div>
  )
}

export function PortalRouteSkeleton({ calendar = false, nutrition = false }: { calendar?: boolean; nutrition?: boolean }) {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      {calendar ? (
        <CalendarSkeleton />
      ) : nutrition ? (
        <>
          <FormPanelSkeleton fields={2} />
          <CardListSkeleton items={3} />
        </>
      ) : (
        <>
          <KpiGridSkeleton count={6} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CardListSkeleton items={4} />
            <CardListSkeleton items={4} />
          </div>
        </>
      )}
    </div>
  )
}
