"use client"

import Link, { type LinkProps } from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode
} from "react"

type InstantNavigationContextValue = {
  pendingHref: string | null
  startNavigation: (href: string) => void
}

type InstantLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> & {
    href: LinkProps["href"]
  }

const InstantNavigationContext = createContext<InstantNavigationContextValue | null>(null)

function hrefToString(href: LinkProps["href"]) {
  return typeof href === "string" ? href : href.pathname ?? "/"
}

function getInternalPath(href: string) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null
  }

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) {
      return null
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return href.startsWith("/") ? href : null
  }
}

function shouldIgnoreNavigationEvent(event: MouseEvent | PointerEvent) {
  return (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    ("button" in event && event.button !== 0)
  )
}

function getAnchorFromEvent(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) {
    return null
  }

  return target.closest("a[href]") as HTMLAnchorElement | null
}

export function InstantNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  function startNavigation(href: string) {
    const internalPath = getInternalPath(href)
    if (!internalPath) {
      return
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (internalPath === currentPath) {
      return
    }

    setPendingHref(internalPath)
    router.prefetch(internalPath)
  }

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useEffect(() => {
    if (!pendingHref) {
      return
    }

    const pendingPathname = getPathnameFromHref(pendingHref)
    const isSamePathNavigation = pendingPathname === window.location.pathname
    const timeout = window.setTimeout(
      () => setPendingHref(null),
      isSamePathNavigation ? 1200 : 8000
    )
    return () => window.clearTimeout(timeout)
  }, [pendingHref])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (shouldIgnoreNavigationEvent(event)) {
        return
      }

      const anchor = getAnchorFromEvent(event)
      if (!anchor || anchor.target || anchor.hasAttribute("download")) {
        return
      }

      startNavigation(anchor.href)
    }

    document.addEventListener("pointerdown", handlePointerDown, { capture: true })
    return () => document.removeEventListener("pointerdown", handlePointerDown, { capture: true })
  })

  return (
    <InstantNavigationContext.Provider value={{ pendingHref, startNavigation }}>
      <InstantNavigationProgress active={Boolean(pendingHref)} />
      {children}
    </InstantNavigationContext.Provider>
  )
}

export function useInstantNavigation() {
  const context = useContext(InstantNavigationContext)
  if (!context) {
    return {
      pendingHref: null,
      startNavigation: () => {}
    } satisfies InstantNavigationContextValue
  }

  return context
}

export function getPathnameFromHref(href: string | null) {
  if (!href) {
    return null
  }

  try {
    return new URL(href, "http://forjafit.local").pathname
  } catch {
    return href.split("?")[0]?.split("#")[0] ?? href
  }
}

export function InstantLink({ href, onPointerDown, onMouseEnter, ...props }: InstantLinkProps) {
  const { startNavigation } = useInstantNavigation()
  const router = useRouter()
  const hrefValue = hrefToString(href)

  return (
    <Link
      href={href}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (!event.defaultPrevented) {
          startNavigation(hrefValue)
        }
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (!event.defaultPrevented) {
          const internalPath = getInternalPath(hrefValue)
          if (internalPath) {
            router.prefetch(internalPath)
          }
        }
      }}
      {...props}
    />
  )
}

function InstantNavigationProgress({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 top-0 z-[100] h-1 origin-left bg-primary shadow-[0_0_24px_rgba(255,106,0,0.35)] transition-all duration-300 ${
        active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
      }`}
    />
  )
}
