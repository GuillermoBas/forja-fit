import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trainium",
    short_name: "Trainium",
    description: "La plataforma inteligente para entrenadores personales",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F6F8",
    theme_color: "#0D1B2A",
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
