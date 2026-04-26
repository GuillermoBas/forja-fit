export async function handler(input: unknown) {
  const payload = input as Record<string, unknown>

  return {
    ok: true,
    action: "bootstrap_admin",
    notes: [
      "Verificar que no exista ya un perfil admin",
      "Crear usuario en InsForge Auth con email/password",
      "Insertar fila en profiles con role=admin",
      "Registrar audit_logs de bootstrap inicial"
    ],
    payload
  }
}
