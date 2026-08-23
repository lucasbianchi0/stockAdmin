/**
 * `fetch` con un reloj. Nada que espere a un modelo debería esperar para siempre.
 *
 * POR QUÉ EXISTE. La producción de un lote es un bucle de `await`: pide el copy,
 * pide la placa, guarda la imagen, sigue con la que viene. Si una de esas
 * peticiones queda colgada —el servidor no responde, la conexión se corta a
 * mitad, el generador de imágenes se traba— el `await` no vuelve NUNCA. El
 * bucle se queda ahí, el `finally` que apaga el indicador no llega a correr, y
 * el botón queda en "Texto 1/8…" hasta que alguien recarga la página.
 *
 * Pasó, y el diagnóstico es engañoso: parece que el lote sigue trabajando.
 *
 * Con el reloj, una petición colgada se convierte en un error normal — la pieza
 * cuenta como fallada, se reintenta una vez y el lote sigue con la siguiente.
 * Un lote que termina con dos piezas a medias se arregla apretando un botón; uno
 * que no termina nunca, no.
 */

/**
 * Cuánto se espera cada cosa.
 *
 * No es un número solo porque no son la misma espera: el copy son unos segundos
 * de modelo de texto, y la placa incluye generar un fondo, que medido tarda
 * entre veinte y cuarenta segundos. Un techo único obligaría a poner el del caso
 * más lento en todos, y ahí una llamada de texto colgada tardaría dos minutos en
 * darse por vencida.
 *
 * Todos son bastante más altos que el peor caso medido: esto es una red contra
 * lo que se colgó, no un límite de paciencia.
 */
export const ESPERA = {
  /** El copy de una pieza. Medido: 7 a 15 s. */
  texto: 90_000,
  /** La placa: derivar variables + generar el fondo + componer. Medido: 20 a 40 s. */
  imagen: 150_000,
  /** Subir el JPEG al bucket. Medido: 2 a 3 s. */
  subida: 60_000,
  /**
   * El lote de ideas. Medido: 34 a 44 s —son dos llamadas en paralelo al modelo
   * más, a veces, una de reparación de titulares.
   */
  lote: 180_000,
} as const

/**
 * Como `fetch`, pero aborta al pasarse del tiempo.
 *
 * `AbortSignal.timeout` lo hace el navegador: no hace falta un `setTimeout` ni
 * limpiarlo, y el error que tira ya viene tipado como `TimeoutError`.
 */
export async function fetchConEspera(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    // El error nativo dice "signal timed out", que no le explica nada a nadie.
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`El servidor no respondió en ${Math.round(ms / 1000)} s`)
    }
    throw e
  }
}
