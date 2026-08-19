/**
 * Los archivos de fuente que necesita el renderizador.
 *
 * Satori —el motor detrás de `next/og`— NO acepta woff2, que es lo único que
 * sirve `next/font`. Por eso los TTF viven en el repo en vez de resolverse por
 * la vía normal de Next: son dos consumidores distintos de la misma tipografía.
 *
 * Se leen una vez por proceso. En serverless eso es una vez por instancia fría, y
 * son ~975 KB en total: leerlos por pieza multiplicaría el I/O por once en cada
 * lote sin ganar nada.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { FAMILIA } from "@/lib/placa/sistema"

type Peso = 400 | 600 | 700

/**
 * Viven en `public/` y no en `src/` a propósito.
 *
 * El trazado de archivos de Next incluye `public/` en el bundle de una función
 * serverless; un `readFile` sobre `src/assets` anda perfecto en desarrollo y en
 * Vercel tira ENOENT, porque ese archivo nunca se subió. Es el mismo tipo de
 * error que ya tiene documentado la ruta del calendario con su `maxDuration`:
 * solo aparece después de desplegar.
 */
const ARCHIVOS: Record<Peso, string> = {
  400: "public/fuentes/Inter-Regular.ttf",
  600: "public/fuentes/Inter-SemiBold.ttf",
  700: "public/fuentes/Inter-Bold.ttf",
}

export type FuenteSatori = {
  name: string
  data: Buffer
  weight: Peso
  style: "normal"
}

let cache: FuenteSatori[] | null = null

export async function fuentes(): Promise<FuenteSatori[]> {
  if (cache) return cache

  const pesos = Object.keys(ARCHIVOS).map(Number) as Peso[]

  cache = await Promise.all(
    pesos.map(async (peso) => ({
      name: FAMILIA,
      data: await readFile(join(process.cwd(), ARCHIVOS[peso])),
      weight: peso,
      style: "normal" as const,
    }))
  )

  return cache
}
