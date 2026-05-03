"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )

      if ("caches" in window) {
        void caches.keys().then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("trainium-") || cacheName.startsWith("forjafit-"))
              .map((cacheName) => caches.delete(cacheName))
          )
        )
      }

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
