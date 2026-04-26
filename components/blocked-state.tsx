import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function BlockedState() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full rounded-3xl bg-surface/98">
        <CardHeader>
          <CardTitle>Acceso bloqueado</CardTitle>
          <CardDescription>
            Tu usuario existe en InsForge Auth, pero no tiene perfil en la aplicacion.
            Un administrador debe darte de alta en `profiles`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button>Volver al login</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
