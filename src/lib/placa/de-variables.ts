/**
 * De las variables del plan a la placa.
 *
 * Es la bisagra entre lo que ya existía y lo nuevo. `feed-variables.ts` traduce
 * la publicación escrita a un juego de campos —titular, rótulo, servicios,
 * cifra— contra el catálogo real de Accedra, y eso no cambia: sigue siendo la
 * misma derivación, con la misma prohibición de inventar un servicio o un número.
 *
 * Lo que cambia es a dónde van esos campos. Antes se interpolaban dentro de un
 * prompt y el generador decidía dónde ponerlos; acá eligen una composición y unas
 * coordenadas.
 */

import type { VariablesFeed } from "@/lib/feed-variables"
import type { Layout, PlacaTipografica } from "@/lib/placa/placa-tipografica"
import type { TemplateFeed } from "@/lib/templates-feed"

/**
 * Qué variante le toca a la pieza.
 *
 * Sale del CONTENIDO y no del template, a propósito: dos piezas del mismo
 * template pueden tener servicios del catálogo o no tenerlos, y forzar el layout
 * de lista sobre una pieza sin ítems deja el hueco más grande de la placa vacío.
 *
 * El orden es de más específico a menos: una pieza con ítems del catálogo los
 * muestra, la que no tiene pero sí bajada la desarrolla, y la que no tiene
 * ninguna de las dos se queda con el titular solo, centrado en la banda.
 */
export function layoutDe(variables: VariablesFeed): Layout {
  if (variables.servicios.length > 0 || variables.features.length > 0) return "bullets"
  if (variables.bajada) return "bajada"
  return "solo"
}

/**
 * La placa lista para renderizar, sin el fondo.
 *
 * `servicios` y `features` son el mismo bloque desde el punto de vista del
 * layout: una columna de líneas cortas. Los templates los piden con nombres
 * distintos porque describen cosas distintas —lo que Accedra vende contra lo que
 * la solución hace— pero eso es del copy, no de la composición.
 */
export function placaDeVariables(
  variables: VariablesFeed,
  template: TemplateFeed,
  formato: "square" | "portrait",
  /**
   * El layout impuesto desde afuera.
   *
   * "centrado" no se puede deducir del contenido como los otros tres: no es una
   * consecuencia de si hay ítems o bajada, es una decisión de composición de la
   * pieza. Viene de arriba o no viene.
   */
  layoutFijo?: PlacaTipografica["layout"],
  /**
   * Claro u oscuro. No es una variante de color: son dos composiciones, y el
   * copy se escribió con las reglas de una de ellas. Ver `PlacaClara`.
   */
  tema: PlacaTipografica["tema"] = "oscuro"
): Omit<PlacaTipografica, "fondo"> {
  // Los datos del evento entran por el mismo bloque que los servicios: fecha,
  // lugar y stand son tres líneas cortas apiladas, que es exactamente lo que ese
  // bloque ya resuelve. Un layout aparte para la misma forma sería otro camino
  // que mantener sin ninguna diferencia visible.
  const evento = [variables.fecha, variables.lugar, variables.codigo].filter(Boolean)

  const items =
    evento.length > 0
      ? evento
      : variables.servicios.length > 0
        ? variables.servicios
        : variables.features

  return {
    tema,
    layout: layoutFijo ?? layoutDe(variables),
    familia: template.familia,
    formato,
    // El rubro del template como red: acá el rótulo deja de ser opcional. Que
    // esté vacío significaba que el derivador no lo propuso —o que el template
    // ni siquiera lo pedía, el caso de seis de los quince— y la pieza salía sin
    // nada arriba del titular. El template sabe de qué habla; no hace falta
    // preguntárselo a un modelo para llenar ese hueco.
    eyebrow: variables.category || template.rubro,
    // La bajada solo se dibuja si no hay ítems: comparten banda y nunca conviven.
    bajada: variables.bajada || undefined,
    titular: variables.headline,
    destacado: variables.destacado || undefined,
    items,
    cta: variables.cta || undefined,
  }
}
