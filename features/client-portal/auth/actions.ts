"use server"

import { redirect } from "next/navigation"
import { appConfig } from "@/lib/config"
import { clearPortalAuthCookies } from "@/lib/auth/portal-cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { completePortalAuthentication, type PortalActionState } from "@/features/client-portal/auth/server"

function getPasswordValidationError(password: string, confirmPassword?: string) {
  if (password.length < 6) {
    return "La clave debe tener al menos 6 caracteres."
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return "Las claves no coinciden."
  }

  return null
}

export async function portalSignInAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Introduce email y clave." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      return { error: result.error?.message ?? "No se pudo iniciar sesion en el portal." }
    }

    return completePortalAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null,
      provider: "password"
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo iniciar sesion en el portal."
    }
  }
}

export async function portalSignUpAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!email || !password || !confirmPassword) {
    return { error: "Completa email, clave y confirmacion." }
  }

  const passwordError = getPasswordValidationError(password, confirmPassword)
  if (passwordError) {
    return { error: passwordError }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signUp({
      email,
      password,
      redirectTo: `${appConfig.appUrl}/cliente/login`
    })

    if (result.error) {
      return { error: result.error.message ?? "No se pudo crear tu acceso al portal." }
    }

    if (result.data?.accessToken) {
      return completePortalAuthentication({
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken ?? null,
        provider: "password"
      })
    }

    return {
      success: "Te hemos enviado un codigo de verificacion al email indicado.",
      verificationRequired: true,
      email
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo crear tu acceso al portal."
    }
  }
}

export async function portalVerifyEmailAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const otp = String(formData.get("otp") ?? "").trim()

  if (!email || !otp) {
    return {
      error: "Introduce el email y el codigo de verificacion.",
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

    return completePortalAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null,
      provider: "password"
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo verificar el email.",
      verificationRequired: true,
      email
    }
  }
}

export async function portalSendResetPasswordAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
  const email = String(formData.get("email") ?? "").trim()

  if (!email) {
    return { error: "Introduce tu email para recuperar la clave." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.sendResetPasswordEmail({
      email,
      redirectTo: `${appConfig.appUrl}/cliente/recuperar-clave`
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

export async function portalExchangeResetCodeAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
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

export async function portalResetPasswordAction(
  _prevState: PortalActionState,
  formData: FormData
): Promise<PortalActionState> {
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

  redirect("/cliente/login?reset=success")
}

export async function portalSignOutAction() {
  await clearPortalAuthCookies()
  redirect("/cliente/login")
}
