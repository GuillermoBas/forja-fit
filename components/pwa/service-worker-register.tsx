"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration is a progressive enhancement.
      })
    }

    if (document.readyState === "complete") {
      register()
      return
    }

    window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
