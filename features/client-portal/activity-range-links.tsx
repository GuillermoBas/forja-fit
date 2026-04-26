import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { PortalActivityRange } from "@/features/client-portal/data"

export function ActivityRangeLinks({
  basePath,
  currentRange,
  ranges
}: {
  basePath: string
  currentRange: PortalActivityRange
  ranges: PortalActivityRange[]
}) {
  return (
    <div className="-mx-1 flex w-full max-w-full gap-2 overflow-x-auto px-1 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {ranges.map((range) => (
        <Link key={range} href={`${basePath}?range=${range}`} className="shrink-0">
          <Button
            variant={currentRange === range ? "default" : "outline"}
            size="sm"
            className="h-10 shrink-0 whitespace-nowrap rounded-2xl px-5"
          >
            {range} días
          </Button>
        </Link>
      ))}
    </div>
  )
}
