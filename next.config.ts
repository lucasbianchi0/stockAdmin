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
      /*
       * Las fuentes de Satori, que faltaban y rompían la generación entera.
       *
       * `fuentes.ts` dice que el rastreo automático incluye `public/`, y no es
       * así: en producción el error era
       * `ENOENT /var/task/public/fuentes/Inter-Regular.ttf`. La placa se componía
       * hasta ahí y moría, así que la pieza quedaba con su copy y sin imagen —
       * el síntoma con el que se descubrió todo esto.
       */
      "./public/fuentes/*.ttf",
    ],
    "/api/contenido/placa/muestra": [
      "./public/brand/accedra-logo-blanco.svg",
      "./public/brand/accedra-logo-navy.svg",
      // Compone con Satori igual que la de arriba. Hoy es solo de desarrollo, así
      // que no se le nota; el día que deje de serlo, fallaría por lo mismo.
      "./public/fuentes/*.ttf",
    ],
    /*
     * El asistente lee los informes de campañas del disco para pasárselos al
     * modelo (`leer_documento`). Mismo motivo que arriba: la ruta se arma con un
     * `join()` a partir del slug y el rastreo no la ve.
     */
    "/api/chat": ["./public/informes/*.pdf"],
    /*
     * El PNG de la firma compone el lockup, la tira de partners y los tres
     * iconos de enlace leyéndolos del disco, y las fuentes para Satori.
     *
     * Mismo motivo que todas las de arriba, con un agravante: acá los nombres de
     * archivo salen de `PALETA` en tiempo de ejecución —`p.lockup`,
     * `firma-icono-${n}-${p.iconos}.png`— así que el rastreo no tiene ni
     * siquiera un literal que seguir. Sin esta línea el botón PNG anda en
     * desarrollo y falla para todo el mundo en producción, que es exactamente
     * como se descubrió.
     */
    "/api/marketing/firma-png": ["./public/logos/*.png", "./public/fuentes/*.ttf"],
  },
};

export default nextConfig;
