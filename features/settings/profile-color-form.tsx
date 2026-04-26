"use client"

import { useEffect, useState } from "react"
import { useFormState } from "react-dom"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { updateProfileCalendarColorAction } from "@/features/settings/actions"
import { cn } from "@/lib/utils"
import type { Profile } from "@/types/domain"

const agendaColors = [
  "#BFDBFE",
  "#BAE6FD",
  "#A7F3D0",
  "#BBF7D0",
  "#FEF3C7",
  "#FED7AA",
  "#FECACA",
  "#FBCFE8",
  "#E9D5FF",
  "#DDD6FE",
  "#C7D2FE",
  "#CCFBF1",
  "#D9F99D",
  "#FDE68A",
  "#FDBA74",
  "#FCA5A5",
  "#F5D0FE",
  "#E0E7FF",
  "#CFFAFE",
  "#E2E8F0"
]

function FormToast({ error, success }: { error?: string; success?: string }) {
  useEffect(() => {
    if (error) {
      toast.error(error)
    }

    if (success) {
      toast.success(success)
    }
  }, [error, success])

  return null
}

export function ProfileColorForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useFormState(updateProfileCalendarColorAction, {})
  const [selectedColor, setSelectedColor] = useState(profile.calendarColor)

  return (
    <form action={formAction} className="space-y-5">
      <FormToast error={state.error} success={state.success} />
      <input type="hidden" name="profileId" value={profile.id} />
      <input type="hidden" name="calendarColor" value={selectedColor} />

      <div className="rounded-2xl border border-border/80 bg-surface-alt/60 p-4">
        <p className="text-sm font-semibold text-text-primary">{profile.fullName}</p>
        <div
          className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900"
          style={{ backgroundColor: selectedColor }}
        >
          Vista previa de cita en agenda
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {agendaColors.map((color) => {
          const active = color.toLowerCase() === selectedColor.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => setSelectedColor(color)}
              className={cn(
                "h-10 rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
                active ? "border-primary ring-2 ring-primary/20" : "border-border/80 hover:border-primary/30"
              )}
              style={{ backgroundColor: color }}
            />
          )
        })}
      </div>

      <AuthFormSubmit idleLabel="Guardar color" pendingLabel="Guardando..." />
    </form>
  )
}
