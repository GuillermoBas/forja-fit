// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function buildSimplePdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ["0 -18 Td", `(${escapePdfText(line)}) Tj`]
    ),
    "ET"
  ].join("\n")

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ]

  let pdf = "%PDF-1.4\n"
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += "0000000000 65535 f \n"
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`
  })
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return new TextEncoder().encode(pdf)
}

async function getActor(client: any, gymId: string) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("gym_id", gymId)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  return { profile: profileResult.data }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    if (!body?.saleId) {
      return json({ code: "INVALID_INPUT", message: "La venta es obligatoria" }, 400)
    }
    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const saleResult = await client.database.from("sales").select("*").eq("gym_id", gymId).eq("id", body.saleId).maybeSingle()
    if (saleResult.error || !saleResult.data) {
      return json({ code: "NOT_FOUND", message: "Venta no encontrada" }, 404)
    }

    const itemsResult = await client.database
      .from("sale_items")
      .select("*")
      .eq("gym_id", gymId)
      .eq("sale_id", body.saleId)
      .order("created_at", { ascending: true })

    if (itemsResult.error || !itemsResult.data) {
      return json({ code: "DB_ERROR", message: "No se pudieron cargar las lineas de la venta" }, 400)
    }

    const sale = saleResult.data
    const lines = [
      `Ticket ${sale.invoice_code}`,
      `Fecha: ${String(sale.sold_at ?? "").replace("T", " ").slice(0, 16)}`,
      `Pago: ${sale.payment_method}`,
      `Total: ${Number(sale.total_gross ?? 0).toFixed(2)} EUR`,
      "Lineas:"
    ]

    for (const item of itemsResult.data as Array<Record<string, unknown>>) {
      lines.push(
        `- ${String(item.description_snapshot ?? "Linea")} x${Number(item.qty ?? 0)} = ${Number(item.line_total_gross ?? 0).toFixed(2)} EUR`
      )
    }

    const bytes = buildSimplePdf(lines)
    const gymSlug = String(body?.gymSlug ?? actor.profile.gym_slug ?? "eltemplo")
    const key = `${gymSlug}/${sale.id}/${Date.now()}-${sale.invoice_code}.pdf`
    const file = new File([bytes], `${sale.invoice_code}.pdf`, { type: "application/pdf" })

    const uploadResult = await client.storage.from("tickets").upload(key, file)
    if (uploadResult.error || !uploadResult.data) {
      return json({ code: "STORAGE_ERROR", message: uploadResult.error?.message ?? "No se pudo subir el PDF" }, 400)
    }

    const updateResult = await client.database
      .from("sales")
      .update({
        ticket_storage_key: uploadResult.data.key,
        ticket_public_url: uploadResult.data.url
      })
      .eq("id", sale.id)
      .eq("gym_id", gymId)

    if (updateResult.error) {
      return json({ code: "DB_ERROR", message: updateResult.error.message }, 400)
    }

    await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: actor.profile.id,
        entity_name: "sales",
        entity_id: sale.id,
        action: "update",
        diff: {
          ticket_storage_key: uploadResult.data.key,
          ticket_public_url: uploadResult.data.url
        }
      }
    ])

    return json({
      ok: true,
      saleId: sale.id,
      ticketStorageKey: uploadResult.data.key,
      ticketPublicUrl: uploadResult.data.url
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
