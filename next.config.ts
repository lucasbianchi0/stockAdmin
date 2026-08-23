import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["docs.distecna.com"],
  },
  /**
   * La referencia de marca del camino 2 se lee del disco en tiempo de ejecución.
   *
   * Sin esto anda en local y falla en Vercel: `public/` se sirve por CDN y no
   * viaja dentro de la función serverless, así que el `readFile` no encuentra
   * nada. El rastreo automático tampoco la agarra porque la ruta se arma con un
   * `join()` y no con un import. Declararla acá la mete en el bundle.
   */
  outputFileTracingIncludes: {
    "/api/contenido/image": [
      "./public/brand/referencia-feed.png",
      "./public/brand/accedra-logo-blanco.svg",
    ],
    /*
     * La placa compone el logo leyéndolo del disco, igual que la ruta de arriba
     * y por el mismo motivo: `soloLogo` arma la ruta con un `join()`, así que el
     * rastreo automático no la ve y el archivo no viaja dentro de la función.
     * Los dos logos, porque el tema claro usa el navy.
     */
    "/api/contenido/placa": [
      "./public/brand/accedra-logo-blanco.svg",
      "./public/brand/accedra-logo-navy.svg",
    ],
    "/api/contenido/placa/muestra": [
      "./public/brand/accedra-logo-blanco.svg",
      "./public/brand/accedra-logo-navy.svg",
    ],
  },
};

export default nextConfig;
