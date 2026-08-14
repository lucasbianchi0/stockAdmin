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
  },
};

export default nextConfig;
