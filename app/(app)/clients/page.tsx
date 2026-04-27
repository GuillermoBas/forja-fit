import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { TableSkeleton } from "@/components/skeletons"
import { getClients, getPasses } from "@/lib/data"

type ClientFilter = "all" | "expiring" | "no_sessions" | "expired"

async function ClientsTable({ filter }: { filter: ClientFilter }) {
  const [clients, passes] = await Promise.all([getClients(), getPasses()])
  const today = new Date().toISOString().slice(0, 10)
  const plus7 = new Date()
  plus7.setDate(plus7.getDate() + 7)
  const nextWeek = plus7.toISOString().slice(0, 10)

  const filteredClients = clients.filter((client) => {
    const ownPasses = passes.filter((pass) => pass.holderClientIds.includes(client.id))

    if (filter === "expiring") {
      return ownPasses.some((pass) => pass.status === "active" && pass.expiresOn <= nextWeek)
    }
    if (filter === "no_sessions") {
      return ownPasses.some((pass) => pass.passKind === "session" && pass.sessionsLeft === 0)
    }
    if (filter === "expired") {
      return ownPasses.some((pass) => pass.expiresOn < today || pass.status === "expired")
    }
    return true
  })

  return (
    <SearchTable
      rows={filteredClients.map((row) => ({
        id: row.id,
        searchText: `${row.fullName} ${row.phone ?? ""} ${row.email ?? ""}`,
        cells: {
          name: {
            text: row.fullName,
            href: `/clients/${row.id}`,
            subtext: row.email ?? "Sin email"
          },
          phone: {
            text: row.phone ?? "Sin telefono"
          },
          status: {
            text: row.isActive ? "Activo" : "Inactivo",
            badgeVariant: row.isActive ? "success" : "warning"
          }
        }
      }))}
      columns={[
        { key: "name", label: "Cliente" },
        { key: "phone", label: "Telefono" },
        { key: "status", label: "Estado" }
      ]}
      searchPlaceholder="Buscar por nombre, telefono o email"
    />
  )
}

export default async function ClientsPage({
  searchParams
}: {
  searchParams?: Promise<{ filter?: ClientFilter }> | { filter?: ClientFilter }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const filter = resolvedSearchParams?.filter ?? "all"
  const filterLinks: { key: ClientFilter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "expiring", label: "Expira <=7 dias" },
    { key: "no_sessions", label: "Sin sesiones" },
    { key: "expired", label: "Caducado" }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Busca por nombre, telefono o email y manten la ficha operativa al dia."
      />

      <div className="flex flex-wrap items-center gap-3">
        {filterLinks.map((item) => (
          <Link key={item.key} href={item.key === "all" ? "/clients" : `/clients?filter=${item.key}`}>
            <Button variant={filter === item.key ? "default" : "outline"} size="sm">
              {item.label}
            </Button>
          </Link>
        ))}
        <Link href="/clients/new" className="ml-auto">
          <Button className="whitespace-nowrap px-7">Nuevo cliente</Button>
        </Link>
      </div>

      <Suspense fallback={<TableSkeleton rows={7} columns={3} />}>
        <ClientsTable filter={filter} />
      </Suspense>
    </div>
  )
}
