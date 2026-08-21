/**
 * Lo que toda pieza del feed tiene que cumplir, dicho como una función.
 *
 * Las tres reglas —el titular entero, el rótulo arriba, el azul en el titular—
 * ya estaban garantizadas río arriba, cada una en su lugar. Esto es la
 * verificación FINAL, sobre la placa que se va a dibujar y no sobre las
 * intenciones de nadie: si alguna de las garantías se rompe el día que alguien
 * toque un prompt o agregue un template, acá se ve.
 *
 * Existe porque el modo de fallar de este sistema nunca fue "explota": fue
 * "sale una pieza un poco peor y el único rastro es un `console.warn` que en
 * producción no lee nadie". Un chequeo que devuelve datos se puede mostrar en la
 * UI; una advertencia en el log, no.
 */

import { terminaColgado, tramoAzul } from "@/lib/copy-headline"
import type { PlacaTipografica } from "@/lib/placa/placa-tipografica"
import { CUERPO_TITULAR, composicionDeTexto } from "@/lib/placa/sistema"

export type Falla = {
  /** Para poder contar por tipo sin parsear el texto. */
  codigo: "sin-titular" | "titular-colgado" | "sin-eyebrow" | "sin-azul" | "titular-chico"
  /** Qué pasó, en una frase, listo para mostrar. */
  detalle: string
}

/**
 * Revisa una placa antes de dibujarla. Devuelve la lista de lo que no cumple.
 *
 * Vacío quiere decir que la pieza está en sistema. No lanza: una pieza con una
 * falla se publica igual —es mejor que no tener pieza— pero se publica SABIENDO.
 */
export function revisarPlaca(placa: Omit<PlacaTipografica, "fondo">): Falla[] {
  const fallas: Falla[] = []
  const titular = placa.titular.join(" ").trim()

  if (!titular) {
    return [{ codigo: "sin-titular", detalle: "La pieza no tiene titular." }]
  }

  if (terminaColgado(titular)) {
    fallas.push({
      codigo: "titular-colgado",
      detalle: `El titular termina colgado: "${titular}".`,
    })
  }

  if (!placa.eyebrow?.trim()) {
    fallas.push({ codigo: "sin-eyebrow", detalle: "La pieza sale sin rótulo arriba del titular." })
  }

  if (!tramoAzul(titular, placa.destacado)) {
    fallas.push({ codigo: "sin-azul", detalle: "El titular sale entero en blanco, sin acento azul." })
  }

  // La MISMA composición que va a dibujar el renderizador, recorte de ítems
  // incluido. Midiendo la lista entera se marcaban como fuera de sistema piezas
  // que el render ya había salvado soltando el cuarto ítem.
  const { entra, cuerpo } = composicionDeTexto({
    formato: placa.formato ?? "square",
    titular: placa.titular,
    layout: placa.layout ?? "solo",
    familia: placa.familia ?? "tecnologia",
    items: placa.items?.length ?? 0,
    bajada: Boolean(placa.bajada),
    eyebrow: Boolean(placa.eyebrow),
    enfasisPrimera: placa.enfasis === "primera",
  })

  if (!entra) {
    fallas.push({
      codigo: "titular-chico",
      detalle:
        `El titular tiene ${titular.length} caracteres y sale en ${cuerpo}px en vez de ` +
        `${CUERPO_TITULAR}: la letra queda más chica que la del resto del feed.`,
    })
  }

  return fallas
}
