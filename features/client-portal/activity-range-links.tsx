"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { PortalActivityRange } from "@/features/client-portal/data"

function parseRange(value: string | null, fallback: PortalActivityRange) {
  const parsed = Number(value)
  return parsed === 30 || parsed === 90 || parsed === 180 || parsed === 365
    ? parsed
    : fallback
}

export function ActivityRangeLinks({
  basePath,
  currentRange,
  ranges
}: {
  basePath: string
  currentRange: PortalActivityRange
  ranges: PortalActivityRange[]
}) {
  const searchParams = useSearchParams()
  const selectedRange = parseRange(searchParams.get("range"), currentRange)

  return (
    <div className="-mx-1 flex w-full max-w-full gap-2 overflow-x-auto px-1 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {ranges.map((range) => {
        const nextSearchParams = new URLSearchParams(searchParams.toString())
        nextSearchParams.set("range", String(range))

        return (
          <Button
            key={range}
            asChild
            variant={selectedRange === range ? "default" : "outline"}
            size="sm"
            className="h-10 shrink-0 whitespace-nowrap rounded-2xl px-5"
          >
            <Link
              href={`${basePath}?${nextSearchParams.toString()}`}
              aria-current={selectedRange === range ? "page" : undefined}
            >
              {range} d&iacute;as
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
