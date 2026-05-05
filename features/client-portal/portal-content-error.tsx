export function PortalContentError({
  title = "No se pudo cargar el contenido",
  detail = "Recarga la pagina en unos segundos. Si el problema continua, avisa al gimnasio."
}: {
  title?: string
  detail?: string
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-5 text-red-800">{detail}</p>
    </div>
  )
}
