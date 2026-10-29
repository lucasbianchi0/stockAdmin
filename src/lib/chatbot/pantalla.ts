import { MAX_PANTALLA } from "@/lib/chatbot/limites"

/**
 * LO QUE LA PERSONA ESTÁ MIRANDO — el contexto que viaja cuando pregunta desde
 * un botón de "Preguntar" en una pantalla.
 *
 * Sin imports de servidor: lo arma cada pantalla con lo que ya tiene cargado y
 * lo lee el provider del chat.
 *
 * ── POR QUÉ VA ADENTRO DEL MENSAJE Y NO APARTE ──
 *
 * Porque así la conversación sigue sabiendo de qué se habla en la segunda y la
 * tercera pregunta ("¿y si bajo el presupuesto?") sin que nadie tenga que
 * recordarlo: viaja en el historial como cualquier otro mensaje. Y no le da
 * nada nuevo al modelo que la persona no pudiera pegar a mano: es lo que ya ve
 * en pantalla, con su acceso.
 *
 * Es texto plano y corto a propósito: el resumen que leería alguien que llega
 * a la reunión tarde, no un volcado de la tabla. Si el agente necesita más,
 * tiene sus herramientas.
 */

export type Pantalla = {
  /** "Resultados · Diagnóstico del período". Es lo que se ve en el chip del chat. */
  titulo: string
  /** El resumen: una cifra o un hallazgo por renglón. */
  texto: string
}

/** Lo que entra en el mensaje. El título no lleva comillas ni saltos: va en un atributo. */
export function acotarPantalla(p: Pantalla, ruta?: string): Pantalla {
  const titulo = p.titulo.replace(/["\n\r<>]/g, " ").trim().slice(0, 120)
  let texto = p.texto.trim()
  if (ruta) texto = `Pantalla: ${ruta}\n${texto}`
  if (texto.length > MAX_PANTALLA) texto = `${texto.slice(0, MAX_PANTALLA - 1)}…`
  return { titulo, texto }
}

/** El mensaje como lo lee el modelo. El prompt explica qué es el bloque (ver DATO_CONTRA_ORDEN). */
export function conPantalla(pregunta: string, p: Pantalla | undefined): string {
  if (!p) return pregunta
  return `<pantalla titulo="${p.titulo}">\n${p.texto.replace(/<\/?pantalla[^>]*>/gi, "")}\n</pantalla>\n\n${pregunta}`
}

/** Un renglón "Etiqueta: valor" para armar el resumen; los vacíos no se escriben. */
export function renglon(etiqueta: string, valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === "") return null
  return `${etiqueta}: ${typeof valor === "number" ? valor.toLocaleString("es-AR") : valor}`
}

/** Junta renglones descartando los vacíos. */
export function resumen(...partes: (string | null | undefined | false | (string | null | undefined | false)[])[]): string {
  return partes
    .flat()
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join("\n")
}
