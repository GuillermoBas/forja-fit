"use client"

import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

export function AuthFormSubmit({
  idleLabel,
  pendingLabel
}: {
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button className="w-full" disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
}
