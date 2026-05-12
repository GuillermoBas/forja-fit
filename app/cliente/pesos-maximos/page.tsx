import { Suspense } from "react"
import { CardListSkeleton } from "@/components/skeletons"
import { getPortalMaxWeightData, getPortalShellData } from "@/features/client-portal/data"
import { PortalMaxWeightsDetail } from "@/features/client-portal/max-weights"
import { PortalContentError } from "@/features/client-portal/portal-content-error"
import { PortalShellMeta } from "@/features/client-portal/persistent-shell"
import { isNextControlError } from "@/lib/next-control-errors"

function parseParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

async function PortalIdentity() {
  let shellData

  try {
    shellData = await getPortalShellData()
  } catch (error) {
    if (isNextControlError(error)) {
      throw error
    }

    console.error("Portal identity load failed", error)
    return null
  }

  return <PortalShellMeta clientName={shellData.client.fullName} />
}

async function MaxWeightsData({ metricId }: { metricId?: string }) {
  let data

  try {
    data = await getPortalMaxWeightData()
  } catch (error) {
    if (isNextControlError(error)) {
      throw error
    }

    console.error("Portal max weights load failed", error)
    return <PortalContentError title="No se pudo cargar la evolución de pesos máximos" />
  }

  return (
    <PortalMaxWeightsDetail
      metrics={data.metrics}
      entries={data.entries}
      selectedMetricId={metricId}
    />
  )
}

export default async function ClientPortalMaxWeightsPage({
  searchParams
}: {
  searchParams?: Promise<{ metric?: string | string[] }> | { metric?: string | string[] }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)

  return (
    <>
      <Suspense fallback={null}>
        <PortalIdentity />
      </Suspense>
      <Suspense fallback={<CardListSkeleton items={4} />}>
        <MaxWeightsData metricId={parseParam(resolvedSearchParams?.metric)} />
      </Suspense>
    </>
  )
}
