import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ForjaFit",
    short_name: "ForjaFit",
    description: "La plataforma inteligente para entrenadores personales",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#FF6A00",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  }
}
