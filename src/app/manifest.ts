import type { MetadataRoute } from "next"

/**
 * Lo que lee Android/Chrome al anclar el backoffice al inicio. Los íconos los
 * genera public/brand/generar-icono-app.mjs. El middleware lo deja pasar sin
 * sesión: si redirigiera al login, el navegador no encontraría el ícono.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Accedra · Backoffice",
    short_name: "Accedra",
    start_url: "/",
    display: "standalone",
    background_color: "#0A1424",
    theme_color: "#0A1424",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
