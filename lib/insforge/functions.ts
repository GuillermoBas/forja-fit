"use client"

import { createBrowserInsforgeClient } from "@/lib/insforge/browser"
import { isInsforgeConfigured } from "@/lib/config"

export async function invokeBusinessFunction<TInput extends Record<string, unknown>>(
  slug: string,
  body?: TInput
) {
  if (!isInsforgeConfigured()) {
    return {
      data: null,
      error: new Error(
        "InsForge no está configurado en este entorno. Completa .env.local para invocar funciones reales."
      )
    }
  }

  const client = createBrowserInsforgeClient() as any
  return client.functions.invoke(slug, {
    body
  })
}
