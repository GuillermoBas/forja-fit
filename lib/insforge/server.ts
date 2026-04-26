import { createClient } from "@insforge/sdk"

type GenericClient = ReturnType<typeof createClient>

function getBaseConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY

  if (!baseUrl || !anonKey) {
    throw new Error("Faltan NEXT_PUBLIC_INSFORGE_URL o NEXT_PUBLIC_INSFORGE_ANON_KEY")
  }

  return { baseUrl, anonKey }
}

export function createServerInsforgeClient(options?: {
  accessToken?: string
}): GenericClient {
  const clientFactory = createClient as unknown as (
    options: Record<string, unknown>
  ) => GenericClient

  return clientFactory({
    ...getBaseConfig(),
    isServerMode: true,
    edgeFunctionToken: options?.accessToken
  })
}
