"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, Loader2, Send, ShieldAlert, Sparkles, SunMedium } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn, formatDate } from "@/lib/utils"
import { NutritionMessageMarkdown } from "@/features/client-portal/nutrition/message-markdown"
import type {
  NutritionChatMessage,
  NutritionQuotaStatus
} from "@/features/client-portal/nutrition/server"
import { nutritionAssistantConfig } from "@/features/client-portal/nutrition/config"

type NutritionChatProps = {
  initialMessages: NutritionChatMessage[]
  initialThreadId: string | null
  clientFirstName: string
  initialQuota: NutritionQuotaStatus
  mode: "modal" | "page"
}

type StreamPayload =
  | {
      type: "chunk"
      content: string
    }
  | {
      type: "complete"
      threadId: string
      quota?: NutritionQuotaStatus
      userMessage: NutritionChatMessage
      assistantMessage: NutritionChatMessage
    }
  | {
      type: "error"
      message: string
      quota?: NutritionQuotaStatus | null
    }

function buildStarterMessage(clientFirstName: string): NutritionChatMessage {
  return {
    id: "starter",
    threadId: "starter",
    clientId: "starter",
    role: "assistant",
    content: `${nutritionAssistantConfig.starterMessage} ${
      clientFirstName ? `Empezamos contigo, ${clientFirstName}.` : ""
    }`.trim(),
    modelId: nutritionAssistantConfig.id,
    createdAt: new Date().toISOString(),
    metadata: {
      starter: true
    }
  }
}

async function* parseEventStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""

    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "))

      if (!dataLine) {
        continue
      }

      const payload = dataLine.slice(6).trim()
      if (!payload) {
        continue
      }

      yield JSON.parse(payload) as StreamPayload
    }
  }
}

export function NutritionChat({
  initialMessages,
  initialThreadId,
  clientFirstName,
  initialQuota,
  mode
}: NutritionChatProps) {
  const [messages, setMessages] = useState<NutritionChatMessage[]>(initialMessages)
  const [threadId, setThreadId] = useState<string | null>(initialThreadId)
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [quota, setQuota] = useState<NutritionQuotaStatus>(initialQuota)
  const [isSafetyHintOpen, setIsSafetyHintOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const visibleMessages = useMemo(
    () => messages.length ? messages : [buildStarterMessage(clientFirstName)],
    [clientFirstName, messages]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    })
  }, [visibleMessages])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = input.trim()
    if (!trimmed || isStreaming || quota.blocked) {
      return
    }

    const now = new Date().toISOString()
    const tempUserId = `temp-user-${Date.now()}`
    const tempAssistantId = `temp-assistant-${Date.now()}`

    const tempUser: NutritionChatMessage = {
      id: tempUserId,
      threadId: threadId ?? "pending-thread",
      clientId: "self",
      role: "user",
      content: trimmed,
      modelId: null,
      createdAt: now,
      metadata: {
        temporary: true
      }
    }

    const tempAssistant: NutritionChatMessage = {
      id: tempAssistantId,
      threadId: threadId ?? "pending-thread",
      clientId: "self",
      role: "assistant",
      content: "",
      modelId: nutritionAssistantConfig.modelId,
      createdAt: now,
      metadata: {
        temporary: true
      }
    }

    setMessages((current) => [...current, tempUser, tempAssistant])
    setInput("")
    setError(null)
    setIsStreaming(true)

    try {
      const response = await fetch("/api/cliente/nutricion/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: trimmed })
      })

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as
          | { message?: string; quota?: NutritionQuotaStatus | null }
          | null

        if (payload?.quota) {
          setQuota(payload.quota)
        }

        throw new Error(payload?.message ?? "No se pudo iniciar la conversación nutricional.")
      }

      const reader = response.body.getReader()

      for await (const payload of parseEventStream(reader)) {
        if (payload.type === "chunk") {
          setMessages((current) =>
            current.map((message) =>
              message.id === tempAssistantId
                ? {
                    ...message,
                    content: `${message.content}${payload.content}`
                  }
                : message
            )
          )
          continue
        }

        if (payload.type === "complete") {
          setThreadId(payload.threadId)
          if (payload.quota) {
            setQuota(payload.quota)
          }
          setMessages((current) =>
            current.map((message) => {
              if (message.id === tempUserId) {
                return payload.userMessage
              }

              if (message.id === tempAssistantId) {
                return payload.assistantMessage
              }

              return message
            })
          )
          continue
        }

        if (payload.type === "error") {
          if (payload.quota) {
            setQuota(payload.quota)
          }
          throw new Error(payload.message)
        }
      }
    } catch (streamError) {
      setMessages((current) => current.filter((message) => message.id !== tempAssistantId))
      setError(
        streamError instanceof Error
          ? streamError.message
          : "No se pudo completar la respuesta nutricional."
      )
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <Card
      className={cn(
        "border border-border/80 bg-surface/95 shadow-[0_24px_60px_rgba(15,23,42,0.18)]",
        mode === "modal" ? "h-full rounded-[1.6rem] sm:rounded-[2rem]" : "rounded-[1.6rem] sm:rounded-[1.9rem]"
      )}
    >
      <div className="flex h-full flex-col">
        {mode === "page" ? (
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3.5 py-3.5 sm:items-center sm:px-4 sm:py-4">
            <div className="min-w-0">
              <p className="section-kicker">Asistente nutricional</p>
              <h3 className="mt-1 font-heading text-base font-bold text-text-primary sm:text-lg">
                Nutrición en chat
              </h3>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/18 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary-hover">
              <Sparkles className="h-3.5 w-3.5" />
              {threadId ? "Hilo activo" : "Preparando hilo"}
            </div>
          </div>
        ) : null}

        {mode === "page" ? (
          <div className="grid gap-2 border-b border-border/70 px-3.5 py-3 sm:grid-cols-2 sm:px-4">
            <div className="rounded-2xl border border-border/70 bg-surface-alt/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Hoy</p>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {quota.dailyUsed}/{quota.dailyLimit} usados
              </p>
              <p className="text-xs text-text-secondary">
                Quedan {quota.dailyRemaining} mensajes
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface-alt/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Mes</p>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {quota.monthlyUsed}/{quota.monthlyLimit} usados
              </p>
              <p className="text-xs text-text-secondary">
                Quedan {quota.monthlyRemaining} mensajes
              </p>
            </div>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            "flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5 sm:px-4 sm:py-4",
            mode === "modal" ? "min-h-0 pt-3 sm:pt-3.5" : "min-h-[56vh] sm:min-h-[60vh]"
          )}
        >
          {visibleMessages.map((message) => {
            const isAssistant = message.role === "assistant"
            const displayContent =
              message.content || (isStreaming && message.id.startsWith("temp-assistant") ? "..." : "")

            return (
              <div
                key={message.id}
                className={cn("flex", isAssistant ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[95%] rounded-[1.35rem] px-3.5 py-3 text-sm leading-6 shadow-sm sm:max-w-[92%] sm:rounded-[1.45rem] sm:px-4",
                    isAssistant
                      ? "bg-surface-alt text-text-primary"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {isAssistant ? (
                    <NutritionMessageMarkdown content={displayContent} />
                  ) : (
                    <p className="whitespace-pre-wrap">{displayContent}</p>
                  )}
                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      isAssistant ? "text-text-muted" : "text-primary-foreground/80"
                    )}
                  >
                    {message.metadata.starter ? "Onboarding por chat" : formatDate(message.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-border/70 px-3.5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] sm:px-4 sm:py-3.5 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {error ? (
            <p className="mb-3 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <form
            id={mode === "page" ? "nutrition-composer" : undefined}
            onSubmit={handleSubmit}
            className="space-y-3"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void handleSubmit(event as unknown as React.FormEvent<HTMLFormElement>)
                }
              }}
              rows={mode === "modal" ? 4 : 4}
              placeholder="Escribe tu objetivo, tus dudas o lo que has comido hoy..."
              className="min-h-[6.5rem] w-full resize-none rounded-[1.3rem] border border-border bg-background/80 px-3.5 py-3 text-sm leading-6 text-text-primary outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 sm:min-h-[7.25rem] sm:px-4 sm:py-3.5"
              disabled={quota.blocked}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {mode === "modal" ? (
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:flex-1 sm:pb-0">
                  <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-border/70 bg-surface-alt/70 px-3 py-2 text-sm font-medium text-text-primary">
                    <SunMedium className="h-4 w-4 text-primary" />
                    <span>{quota.dailyRemaining}/{quota.dailyLimit}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-border/70 bg-surface-alt/70 px-3 py-2 text-sm font-medium text-text-primary">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span>{quota.monthlyRemaining}/{quota.monthlyLimit}</span>
                  </div>
                  <div className="group relative shrink-0">
                    <button
                      type="button"
                      aria-label="Información de seguridad del asistente"
                      aria-expanded={isSafetyHintOpen}
                      onClick={() => setIsSafetyHintOpen((current) => !current)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-surface-alt/70 text-text-secondary transition hover:border-primary/35 hover:text-primary"
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </button>
                    <div
                      className={cn(
                        "absolute bottom-full right-0 z-20 mb-2 w-64 rounded-2xl border border-border/80 bg-surface px-3 py-2 text-xs leading-5 text-text-secondary shadow-[0_18px_45px_rgba(15,23,42,0.16)] group-hover:block",
                        isSafetyHintOpen ? "block" : "hidden"
                      )}
                    >
                      Solo respondemos dudas de nutrición y hábitos saludables. Rechazamos temas fuera de alcance, diagnósticos, TCA y patología compleja.
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-5 text-text-muted">
                  Onboarding inicial por chat, sin formularios.
                </p>
              )}
              <Button
                type="submit"
                aria-label="Enviar mensaje"
                className={cn(
                  "h-11 rounded-2xl",
                  mode === "modal"
                    ? "w-10 shrink-0 px-0 sm:h-10 sm:w-10"
                    : "w-full gap-2.5 px-4 sm:min-w-[7.75rem] sm:w-auto sm:self-auto sm:px-5"
                )}
                disabled={isStreaming || !input.trim() || quota.blocked}
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {mode === "modal" ? <span className="sr-only">Enviar</span> : "Enviar"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Card>
  )
}
