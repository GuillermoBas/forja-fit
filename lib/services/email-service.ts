import { createClient } from "@insforge/sdk"

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
}

export interface EmailSendResult {
  ok: boolean
  provider: "insforge-email" | "logger"
  skipped?: boolean
  errorMessage?: string
}

export interface EmailService {
  send(payload: EmailPayload): Promise<EmailSendResult>
}

function getEmailClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY

  if (!baseUrl || !anonKey) {
    return null
  }

  return createClient({ baseUrl, anonKey }) as any
}

class LoggerEmailService implements EmailService {
  async send(payload: EmailPayload) {
    console.info("[email:fallback]", payload)
    return {
      ok: true,
      provider: "logger" as const,
      skipped: true
    }
  }
}

class InsforgeEmailService implements EmailService {
  constructor(private client: any) {}

  async send(payload: EmailPayload) {
    try {
      const result = await this.client.emails.send(payload)
      if (result.error) {
        console.info("[email:insforge:fallback]", result.error.message, payload)
        return {
          ok: true,
          provider: "logger" as const,
          skipped: true,
          errorMessage: result.error.message
        }
      }

      return {
        ok: true,
        provider: "insforge-email" as const
      }
    } catch (error) {
      console.info("[email:insforge:fallback]", error, payload)
      return {
        ok: true,
        provider: "logger" as const,
        skipped: true,
        errorMessage: error instanceof Error ? error.message : "Email service unavailable"
      }
    }
  }
}

export function createEmailService(): EmailService {
  const client = getEmailClient()
  if (client?.emails?.send) {
    return new InsforgeEmailService(client)
  }
  return new LoggerEmailService()
}
