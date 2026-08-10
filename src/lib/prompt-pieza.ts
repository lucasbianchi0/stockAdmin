/**
 * El prompt con el que se genera la imagen de una pieza del calendario.
 *
 * Vive en su propio módulo por una razón concreta: lo necesitan la generación en
 * lote (en el cliente del plan) y el botón de generar de a una (en el panel de
 * la pieza). Cuando estaba en uno de los dos, el otro tenía que importarlo y los
 * dos archivos quedaban importándose entre sí.
 *
 * Y sobre todo: tiene que ser UNO. Dos formas de armar el prompt son dos piezas
 * distintas saliendo del mismo botón según por dónde se entró, y eso es
 * exactamente lo que rompe la coherencia visual que los templates vienen a dar.
 */

import type { Slot } from "@/lib/calendario-context"
import { promptDeTemplate, templatePorId } from "@/lib/templates-pieza"

export function promptDeImagen(slot: Slot): string {
  const template = templatePorId(slot.templateSlug)

  // Sin template asignado —los planes anteriores al rediseño— manda el prompt
  // libre que escribió el modelo. Es peor, porque nada fija la composición, pero
  // es lo único que hay y la pieza tiene que poder generarse igual.
  if (!template) return slot.contenido?.promptImagen ?? ""

  const elegida = slot.opciones.find((o) => o.id === slot.elegida)

  return promptDeTemplate({
    template,
    titular: elegida?.titulo ?? "",
    // Qué se va a VER: lo describió el modelo del plan por pieza, cuando propuso
    // la opción. El template pone la composición y esto pone el sujeto.
    sujeto: elegida?.imagen ?? "",
  })
}
