"use client"

import { InstantLink } from "@/components/instant-navigation"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type BadgeVariant = "default" | "secondary" | "success" | "paused" | "warning" | "danger"

export interface SearchTableColumn {
  key: string
  label: string
}

export interface SearchTableCell {
  text: string
  subtext?: string
  href?: string
  badgeVariant?: BadgeVariant
}

export interface SearchTableRow {
  id: string
  searchText: string
  cells: Record<string, SearchTableCell>
}

interface SearchTableProps {
  rows: SearchTableRow[]
  columns: SearchTableColumn[]
  searchPlaceholder: string
}

function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//")
}

export function SearchTable({ rows, columns, searchPlaceholder }: SearchTableProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return rows
    }
    return rows.filter((row) => row.searchText.toLowerCase().includes(normalized))
  }, [rows, query])

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="section-kicker">Tabla operativa</p>
            <p className="section-copy max-w-xl">
              Filtra al instante y revisa la informacion clave sin salir de la vista.
            </p>
            <p className="text-xs font-medium text-text-muted">
              {filtered.length} {filtered.length === 1 ? "registro visible" : "registros visibles"}
            </p>
          </div>
          <div className="w-full space-y-2 md:max-w-sm">
            <label className="field-label">Buscar</label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <Table>
            <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
            </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((column) => {
                      const cell = row.cells[column.key]
                      return (
                        <TableCell key={column.key}>
                          {cell?.badgeVariant ? (
                            <Badge variant={cell.badgeVariant}>{cell.text}</Badge>
                          ) : cell?.href && isInternalHref(cell.href) ? (
                            <InstantLink
                              href={cell.href}
                              className="font-medium text-text-primary transition-colors hover:text-primary-hover"
                            >
                              {cell.text}
                            </InstantLink>
                          ) : cell?.href ? (
                            <a
                              href={cell.href}
                              className="font-medium text-text-primary transition-colors hover:text-primary-hover"
                              rel="noreferrer"
                              target={cell.href.startsWith("http") ? "_blank" : undefined}
                            >
                              {cell.text}
                            </a>
                          ) : (
                            <span>{cell?.text ?? ""}</span>
                          )}
                          {cell?.subtext ? (
                            <p className="mt-1 text-xs leading-5 text-text-muted">{cell.subtext}</p>
                          ) : null}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-14 text-center">
                    <div className="empty-state mx-auto max-w-xl">
                      <p className="empty-state-title">
                        No hay resultados con ese filtro
                      </p>
                      <p className="empty-state-copy">
                        Ajusta el texto de búsqueda para localizar clientes, ventas o notificaciones.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
