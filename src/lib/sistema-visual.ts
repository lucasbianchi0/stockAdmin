/**
 * El sistema visual del calendario: "Feed 1080" (el camino 2), el único que
 * quedó. El camino 1 —Templates Accedra, con receta en castellano y plantillas
 * de otras marcas como molde— se retiró: generaba peor y duplicaba la UI.
 *
 * El tipo se conserva de una sola variante para no reescribir el hilván de props
 * que lo lleva por los componentes; hoy siempre vale "feed".
 */

import type { Canal, Slot } from "@/lib/calendario-context"
import { ESPERA, fetchConEspera } from "@/lib/red"
import { secuenciaRecomendada } from "@/lib/secuencia"
import { TEMPLATES_FEED } from "@/lib/templates-feed"

export const SISTEMAS = ["feed"] as const
export type SistemaVisual = (typeof SISTEMAS)[number]

export const SISTEMA_LABEL: Record<SistemaVisual, string> = {
  feed: "Feed 1080",
}

/* ── Medidas ──────────────────────────────────────────────────────────────── */

/**
 * La proporción de cada canal. NO es opcional y no la elige el usuario.
 *
 * Antes el lote mandaba "square" fijo para todo, así que una pieza de LinkedIn
 * salía con la medida de Instagram y nadie se enteraba hasta verla publicada.
 * Una pieza con la proporción equivocada no se arregla: se regenera.
 *
 * Meta es cuadrado y no se discute: es el feed de Instagram y Facebook.
 *
 * LinkedIn admite las dos —1200×627 apaisado o 1080×1080 cuadrado— y queda en
 * cuadrado por dos razones: es la medida de toda la placa de referencia, y
 * Gemini solo ofrece 1:1, 4:5 y 16:9, así que el apaisado real de LinkedIn
 * (1,91:1) no existe como opción: lo más cercano es 16:9, que recorta distinto.
 * Cambiar esta línea a "landscape" es todo lo que hace falta si se prefiere.
 */
export const PROPORCION_CANAL: Record<Canal, "square" | "portrait" | "landscape"> = {
  linkedin: "square",
  meta: "square",
}

export function proporcionDe(canal: Canal) {
  return PROPORCION_CANAL[canal]
}

/** Dónde se recuerda la elección. Por plan: son experimentos, no una preferencia. */
export function claveSistema(planId: string): string {
  return `calendario:sistema:${planId}`
}

/**
 * Qué template del feed le toca a cada pieza.
 *
 * Reusa el mismo repartidor que el sistema viejo —mira `densidad` y arma la
 * grilla del canal— pero sobre los quince prompts nuevos. Con semilla fija, así
 * que es estable entre recargas sin necesidad de guardar nada: mientras el plan
 * tenga los mismos slots, cada pieza cae siempre en el mismo template.
 *
 * Contracara honesta: "Reordenar formatos" no lo mueve, porque ese botón escribe
 * `template_slug`, que es del otro sistema.
 */
export function secuenciaFeed(slots: Slot[]): Map<string, string> {
  // `fotoColor` sale de la familia y no de un campo por template: la familia
  // `foto-real` ES la de color natural —gente, piel, luz de ventana— y las otras
  // dos son negro con azul. Sin este mapeo el repartidor recibía los quince con
  // `fotoColor` en undefined, o sea todos iguales, y su regla de alternar claro
  // y oscuro en la grilla no podía distinguir nada: penalizaba igual a cualquier
  // par de vecinas y era, en los hechos, código muerto.
  return secuenciaRecomendada(
    slots.map((s) => ({ id: s.id, fecha: s.fecha, canal: s.canal })),
    TEMPLATES_FEED.map((t) => ({
      id: t.id,
      densidad: t.densidad,
      fotoColor: t.familia === "foto-real",
    })),
    { semilla: 0 }
  )
}

/**
 * El prompt de una pieza por el camino 2. Pasa por el servidor porque en el
 * medio hay una llamada a un modelo que traduce la publicación a las variables
 * del template.
 */
export async function pedirPromptFeed(
  slotId: string,
  templateFeedId: string
): Promise<{ prompt: string; variables: Record<string, unknown> }> {
  const res = await fetchConEspera(
    "/api/contenido/calendario/slot/prompt-feed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, templateFeedId }),
    },
    ESPERA.texto
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "No se pudo armar el prompt")
  return { prompt: data.prompt as string, variables: data.variables ?? {} }
}

/**
 * Una pieza por el sistema nuevo: fondo generado + texto compuesto por código.
 *
 * Manda las variables que `pedirPromptFeed` ya devolvió en vez de dejar que el
 * servidor las derive otra vez: esa traducción cuesta una llamada a un modelo y
 * dos derivaciones de la misma pieza pueden no coincidir.
 */
export async function pedirPlaca(
  slotId: string,
  templateFeedId: string,
  variables: Record<string, unknown>,
  size: "square" | "portrait"
): Promise<{ imagen: string; fallas: string[] }> {
  const res = await fetchConEspera(
    "/api/contenido/placa",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, templateFeedId, variables, size }),
    },
    ESPERA.imagen
  )
  const data = await res.json()
  if (!res.ok || !data.image) throw new Error(data.error ?? "No se pudo componer la pieza")

  // Las fallas viajan con la imagen: la pieza salió, pero salió fuera de
  // sistema y quien la va a publicar tiene que enterarse ahora y no en el feed.
  const fallas = Array.isArray(data.fallas)
    ? (data.fallas as { detalle?: unknown }[])
        .map((f) => (typeof f?.detalle === "string" ? f.detalle : ""))
        .filter(Boolean)
    : []

  return { imagen: data.image as string, fallas }
}
