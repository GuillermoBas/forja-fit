"use client"

import Image from "next/image"
import { createContext, useContext } from "react"
import {
  defaultTenantBranding,
  getBrandAssetUrl,
  type TenantBranding
} from "@/lib/branding-shared"
import type { BrandAssetVariant } from "@/types/domain"

const TenantBrandingContext = createContext<TenantBranding>(defaultTenantBranding)

export function TenantBrandingProvider({
  branding,
  children
}: {
  branding: TenantBranding
  children: React.ReactNode
}) {
  return (
    <TenantBrandingContext.Provider value={branding}>
      {children}
    </TenantBrandingContext.Provider>
  )
}

export function useTenantBranding() {
  return useContext(TenantBrandingContext)
}

export function TenantLogo({
  className,
  width = 320,
  height = 320,
  priority = false,
  variant = "logo-512-png"
}: {
  className?: string
  width?: number
  height?: number
  priority?: boolean
  variant?: BrandAssetVariant
}) {
  const branding = useTenantBranding()
  const src = getBrandAssetUrl(branding.assets, variant)

  return (
    <Image
      src={src}
      alt={`Logo de ${branding.businessName}`}
      width={width}
      height={height}
      priority={priority}
      unoptimized={src.startsWith("http")}
      className={className}
    />
  )
}

export function TenantBusinessName({ className }: { className?: string }) {
  const branding = useTenantBranding()

  return <span className={className}>{branding.businessName}</span>
}
