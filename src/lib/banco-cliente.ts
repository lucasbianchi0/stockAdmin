/**
 * Producir una pieza del banco: el copy y la imagen.
 *
 * LO IMPORTANTE DE ESTE ARCHIVO ES LO QUE NO TIENE. No hay ni una línea de
 * generación de imágenes: se llaman las MISMAS tres rutas que usa el calendario
 * —el copy, el prompt del feed, la placa— y la única traducción que se hace acá
 * es leer del `Slot` que devuelven los campos que la pieza del banco necesita.
 *
 * Es a propósito y es la decisión central de todo el banco. La composición de la
 * placa —fondo generado, titular compuesto por código, rótulo, azul en el
 * remate— funciona y no se toca. Cualquier atajo que duplicara un pedacito de
 * ese camino para "adaptarlo al banco" terminaría en dos generadores que se
 * parecen, uno de los dos quedándose viejo, y piezas de dos calidades saliendo
 * de la misma marca.
 */

import type { PiezaBanco } from "@/lib/banco-context"
import type { Contenido, Slot } from "@/lib/calendario-context"
import { pedirPlaca, pedirPromptFeed, proporcionDe } from "@/lib/sistema-visual"

/** En qué anda una pieza mientras se produce. Lo dibuja la tarjeta. */
export type PasoPieza = "texto" | "imagen"

async function pedir(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const data = await res.json()
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Falló el pedido")
  return data as Record<string, unknown>
}

/**
 * El copy de la pieza.
 *
 * Es la ruta del slot del calendario, sin cambios: una pieza del banco ES un
 * slot con la idea ya elegida, así que la ruta no tiene que enterarse de que
 * existe otro flujo.
 */
export async function generarCopy(piezaId: string): Promise<Contenido> {
  const data = await pedir("/api/contenido/calendario/slot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId: piezaId, ajuste: "" }),
  })

  const slot = data.slot as Slot | undefined
  if (!slot?.contenido) throw new Error("El copy volvió vacío")
  return slot.contenido
}

/**
 * La imagen, por el camino de siempre: se derivan las variables del template y
 * se compone la placa. Devuelve el data URI, todavía sin guardar.
 */
export async function generarImagen(pieza: PiezaBanco): Promise<string> {
  if (!pieza.templateSlug) throw new Error("La pieza no tiene template asignado")

  const { variables } = await pedirPromptFeed(pieza.id, pieza.templateSlug)
  const medida = proporcionDe(pieza.canal)

  const { imagen, fallas } = await pedirPlaca(
    pieza.id,
    pieza.templateSlug,
    variables,
    medida === "portrait" ? "portrait" : "square"
  )

  // Una pieza fuera de sistema se genera igual —no tenerla es peor— pero queda
  // dicho con su id, para poder ir a esa y no a las ocho.
  if (fallas.length > 0) console.warn(`[banco ${pieza.id}]`, fallas.join(" "))

  return imagen
}

/** Sube la imagen al bucket y devuelve dónde quedó. */
export async function guardarImagen(
  piezaId: string,
  imagen: string
): Promise<{ imagenPath: string | null; imagenUrl: string | null }> {
  const data = await pedir("/api/contenido/calendario/slot/imagen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId: piezaId, imagen }),
  })

  const slot = data.slot as Slot | undefined
  return { imagenPath: slot?.imagenPath ?? null, imagenUrl: slot?.imagenUrl ?? null }
}

/**
 * Una pieza completa: copy y después imagen.
 *
 * En ese orden y no al revés porque la imagen es lo caro: si el copy falla, no
 * se gastó una generación de fondo en una pieza que hay que rehacer igual.
 *
 * `onPaso` existe para que la tarjeta pueda decir en cuál de los dos está. Sin
 * eso, una pieza tarda un minuto sin mover nada en pantalla y se lee como colgada.
 */
export async function producirPieza(
  pieza: PiezaBanco,
  onPaso?: (paso: PasoPieza) => void
): Promise<PiezaBanco> {
  let completa = pieza

  if (!completa.contenido) {
    onPaso?.("texto")
    completa = { ...completa, contenido: await generarCopy(completa.id) }
  }

  if (!completa.imagenUrl) {
    onPaso?.("imagen")
    const imagen = await generarImagen(completa)
    completa = { ...completa, ...(await guardarImagen(completa.id, imagen)) }
  }

  return completa
}
