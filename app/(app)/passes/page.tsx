import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { getCurrentProfile } from "@/lib/auth/session"
import { PassTypeForm } from "@/features/passes/pass-admin-forms"
import { getPassTypes, getPasses } from "@/lib/data"
import { isAdmin } from "@/lib/permissions/roles"
import { formatDate, formatPassStatus } from "@/lib/utils"

export default async function PassesPage({
  searchParams
}: {
  searchParams?: Promise<{ typeId?: string }> | { typeId?: string }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const [passes, passTypes, profile] = await Promise.all([
    getPasses(),
    getPassTypes({ includeInactive: true }),
    getCurrentProfile()
  ])
  const canManage = isAdmin(profile?.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bonos"
        description="Control manual de sesiones, caducidades, renovaciones y pausas."
      />
      <div className="flex justify-end">
        <Link href="/clients">
          <Button className="whitespace-nowrap px-7">Crear bono desde cliente</Button>
        </Link>
      </div>
      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <PassTypeForm passTypes={passTypes} selectedPassTypeId={resolvedSearchParams?.typeId} />
          <div className="rounded-3xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Tipos de bono existentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Edita precios, sesiones flexibles o crea bonos mensuales sin tocar SQL.
            </p>
            <div className="mt-4 space-y-3">
              {passTypes.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.kind === "monthly"
                        ? "Mensual por mes natural"
                        : `${item.sessionCount ?? 0} sesiones`}
                    </p>
                  </div>
                  <Link href={`/passes?typeId=${item.id}`}>
                    <Button variant="outline" size="sm">Editar</Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <SearchTable
        rows={passes.map((row) => ({
          id: row.id,
          searchText: `${row.holderNames.join(" ")} ${row.passTypeName}`,
          cells: {
            type: { text: row.passTypeName },
            holders: {
              text: row.holderNames.join(" / ")
            },
            sessions: {
              text: row.passKind === "monthly" ? "Mensual" : String(row.sessionsLeft ?? 0)
            },
            expires: { text: formatDate(row.expiresOn) },
            status: {
              text: formatPassStatus(row.status),
              badgeVariant:
                row.status === "expired" ? "danger" :
                row.passKind === "session" && row.sessionsLeft === 0 ? "warning" : "success"
            },
            actions: canManage
              ? { text: "Editar", href: `/passes/${row.id}/edit` }
              : { text: "Solo admin" }
          }
        }))}
        columns={[
          { key: "type", label: "Bono" },
          { key: "holders", label: "Titulares" },
          { key: "sessions", label: "Sesiones" },
          { key: "expires", label: "Caduca" },
          { key: "status", label: "Estado" },
          { key: "actions", label: "Acción" }
        ]}
        searchPlaceholder="Buscar por cliente o tipo de bono"
      />
    </div>
  )
}
