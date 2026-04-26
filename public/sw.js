const SW_VERSION = "forjafit-pwa-v2"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("forjafit-") && cacheName !== SW_VERSION)
          .map((cacheName) => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("push", (event) => {
  const fallback = {
    title: "ForjaFit",
    body: "Tienes una novedad en tu portal.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    url: "/cliente/dashboard",
    eventType: "unknown"
  }

  let payload = fallback

  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() }
    } catch {
      payload = { ...fallback, body: event.data.text() || fallback.body }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || fallback.title, {
      body: payload.body || fallback.body,
      icon: payload.icon || fallback.icon,
      badge: payload.badge || fallback.badge,
      data: {
        url: payload.url || fallback.url,
        eventType: payload.eventType || fallback.eventType
      }
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetUrl = new URL(event.notification.data?.url || "/cliente/dashboard", self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return undefined
    })
  )
})
