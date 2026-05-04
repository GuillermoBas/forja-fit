"use server"

import { redirect } from "next/navigation"
import { clearAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { resolvePublicOrigin } from "@/lib/public-origin"
import {
  canBootstrapFirstAdmin,
  completeStaffAuthentication,
  type StaffAuthActionState
} from "@/features/auth/server"

export type AuthActionState = StaffAuthActionState

function getPasswordValidationError(password: string, confirmPassword?: string) {
  if (password.length < 6) {
    return "La clave debe tener al menos 6 caracteres."
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return "Las claves no coinciden."
  }

  return null
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Introduce email y contrasena." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      return { error: result.error?.message ?? "No se pudo iniciar sesion." }
    }

    return completeStaffAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo iniciar sesion."
    }
  }

  redirect("/dashboard")
}

export async function verifyStaffEmailAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const otp = String(formData.get("otp") ?? "").trim()

  if (!email || !otp) {
    return {
      error: "Introduce email y codigo de activacion.",
      verificationRequired: true,
      email
    }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.verifyEmail({ email, otp })

    if (result.error || !result.data?.accessToken) {
      return {
        error: result.error?.message ?? "No se pudo verificar el email.",
        verificationRequired: true,
        email
      }
    }

    return completeStaffAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo verificar el email.",
      verificationRequired: true,
      email
    }
  }
}

export async function signOutAction() {
  await clearAuthCookies()
  redirect("/login")
}

export async function bootstrapFirstAdminAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const fullName = String(formData.get("fullName") ?? "").trim()

  if (!email || !password || !fullName) {
    return { error: "Completa nombre, email y contrasena." }
  }

  const passwordError = getPasswordValidationError(password)
  if (passwordError) {
    return { error: passwordError }
  }

  try {
    const client = createServerInsforgeClient() as any
    if (!(await canBootstrapFirstAdmin())) {
      return { error: "Ya existe un admin. El bootstrap inicial esta cerrado." }
    }
    const publicOrigin = await resolvePublicOrigin()

    const signUp = await client.auth.signUp({
      email,
      password,
      name: fullName,
      redirectTo: `${publicOrigin}/login`
    })

    if (signUp.error || !signUp.data?.user?.id) {
      return { error: signUp.error?.message ?? "No se pudo crear el usuario admin." }
    }

    const profileInsert = await client.database.from("profiles").insert([
      {
        auth_user_id: signUp.data.user.id,
        full_name: fullName,
        email,
        role: "admin",
        is_active: true
      }
    ])

    if (profileInsert.error) {
      return { error: profileInsert.error.message ?? "No se pudo crear el perfil admin." }
    }

    if (signUp.data.accessToken) {
      return completeStaffAuthentication({
        accessToken: signUp.data.accessToken,
        refreshToken: signUp.data.refreshToken ?? null
      })
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo crear el admin inicial."
    }
  }

  redirect("/login?insforge_status=success")
}

export async function sendResetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()

  if (!email) {
    return { error: "Introduce tu email para recuperar la clave." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const publicOrigin = await resolvePublicOrigin()
    const result = await client.auth.sendResetPasswordEmail({
      email,
      redirectTo: `${publicOrigin}/recuperar-clave`
    })

    if (result.error) {
      return { error: result.error.message ?? "No se pudo enviar el codigo de recuperacion." }
    }

    return {
      success: "Te hemos enviado un codigo para restablecer la clave.",
      resetCodeSent: true,
      email
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo enviar el codigo de recuperacion."
    }
  }
}

export async function exchangeResetCodeAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const code = String(formData.get("code") ?? "").trim()

  if (!email || !code) {
    return {
      error: "Introduce email y codigo de recuperacion.",
      resetCodeSent: true,
      email
    }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.exchangeResetPasswordToken({ email, code })

    if (result.error || !result.data?.token) {
      return {
        error: result.error?.message ?? "No se pudo validar el codigo.",
        resetCodeSent: true,
        email
      }
    }

    return {
      success: "Codigo verificado. Ya puedes definir una nueva clave.",
      resetCodeSent: true,
      resetToken: result.data.token,
      email
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo validar el codigo.",
      resetCodeSent: true,
      email
    }
  }
}

export async function resetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const resetToken = String(formData.get("resetToken") ?? "").trim()
  const newPassword = String(formData.get("newPassword") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!email || !resetToken || !newPassword || !confirmPassword) {
    return {
      error: "Completa todos los campos para restablecer la clave.",
      resetCodeSent: true,
      email,
      resetToken
    }
  }

  const passwordError = getPasswordValidationError(newPassword, confirmPassword)
  if (passwordError) {
    return {
      error: passwordError,
      resetCodeSent: true,
      email,
      resetToken
    }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.resetPassword({
      newPassword,
      otp: resetToken
    })

    if (result.error) {
      return {
        error: result.error.message ?? "No se pudo actualizar la clave.",
        resetCodeSent: true,
        email,
        resetToken
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo actualizar la clave.",
      resetCodeSent: true,
      email,
      resetToken
    }
  }

  redirect("/login?reset=success")
}
