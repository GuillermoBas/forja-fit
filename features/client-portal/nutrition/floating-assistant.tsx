"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { NutritionChatMessage, NutritionQuotaStatus } from "@/features/client-portal/nutrition/server"
import { NutritionChat } from "@/features/client-portal/nutrition/chat"

export function NutritionFloatingAssistant({
  initialMessages,
  initialThreadId,
  clientFirstName,
  initialQuota
}: {
  initialMessages: NutritionChatMessage[]
  initialThreadId: string | null
  clientFirstName: string
  initialQuota: NutritionQuotaStatus
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          size="lg"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.1rem)] right-[calc(env(safe-area-inset-right)+0.85rem)] z-[70] h-12 max-w-[calc(100vw-1.5rem)] rounded-full px-4 text-[13px] shadow-[0_14px_30px_rgba(255,106,0,0.18)] sm:bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] sm:right-[calc(env(safe-area-inset-right)+1rem)] sm:h-13 sm:max-w-[calc(100vw-2rem)] sm:px-5 sm:text-sm lg:bottom-[calc(env(safe-area-inset-bottom)+0.9rem)] lg:h-14 lg:px-5"
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          Asistente Nutricional
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-background/84 backdrop-blur-md" />
        <Dialog.Content className="fixed inset-0 z-[90] outline-none">
          <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top,_rgba(255,106,0,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(148,163,184,0.08),_transparent_28%)] p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pr-[calc(env(safe-area-inset-right)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pl-[calc(env(safe-area-inset-left)+0.5rem)] sm:p-4 lg:p-5">
            <div className="mb-2.5 flex items-start justify-between gap-3 rounded-[1.5rem] border border-border/90 bg-surface/96 px-4 py-3.5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:mb-3 sm:items-center sm:rounded-[1.75rem] sm:py-4">
              <div className="min-w-0">
                <p className="section-kicker">Portal de cliente</p>
                <Dialog.Title className="mt-1 truncate font-heading text-lg font-bold text-text-primary sm:text-xl">
                  Asistente Nutricional
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[13px] leading-5 text-text-secondary sm:text-sm">
                  Acceso permanente al chat nutricional desde cualquier punto del area cliente.
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-10 rounded-full bg-background/90 p-0 sm:h-11 sm:w-11"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1">
              <NutritionChat
                initialMessages={initialMessages}
                initialThreadId={initialThreadId}
                clientFirstName={clientFirstName}
                initialQuota={initialQuota}
                mode="modal"
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
