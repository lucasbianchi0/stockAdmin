/**
 * El worker: toma lo que venció, lo publica y deja escrito qué pasó.
 *
 * Es el único lugar que llama a los publicadores. Que sea uno solo es lo que
 * hace que la garantía de no duplicar valga: la regla "reclamar antes de
 * publicar, escribir el id apenas vuelve" no se puede sostener si hay tres
 * caminos distintos que publican.
 *
 * Solo servidor: importa el cliente de Supabase con service key.
 */

import { supabase } from "@/lib/supabase"
import { firmar } from "@/lib/calendario-server"
import type { Canal, Contenido } from "@/lib/calendario-context"
import { traerCuenta, tokenInstagram, tokenLinkedin, type Destino } from "@/lib/publicar/cuentas"
import { publicarEnInstagram } from "@/lib/publicar/instagram"
import { publicarEnLinkedin } from "@/lib/publicar/linkedin"

/**
 * De canal a destino.
 *
 * 'meta' es un canal con dos destinos posibles y hoy sólo se publica en uno. El
 * mapa existe para que el día que se sume Facebook sea agregar un destino acá y
 * no revisar cada `if (canal === "meta")` disperso por el código.
 */
const DESTINO_DE_CANAL: Record<Canal, Destino> = {
  meta: "instagram",
  linkedin: "linkedin",
}

/**
 * Cuántas piezas por tick.
 *
 * Cinco y no todas: si algo se acumuló —el cron estuvo caído, alguien programó
 * veinte piezas para la misma hora— publicarlas todas de golpe es un aluvión en
 * el feed y, del lado de Meta, el camino directo al límite de 50 por día. Lo que
 * sobra sale en el tick siguiente, quince minutos después.
 */
const POR_TICK = 5

export type Resultado = {
  slotId: string
  canal: Canal
  ok: boolean
  postId?: string
  error?: string
}

type Fila = Record<string, unknown>

/**
 * El texto final del post.
 *
 * Caption, CTA y hashtags viven separados en `contenido` porque se generan y se
 * editan por separado, pero salen pegados. El armado está acá y no en cada
 * publicador para que Instagram y LinkedIn publiquen exactamente lo mismo: la
 * pieza es una sola y ver dos textos distintos según la red sería un bug muy
 * difícil de notar y muy fácil de cometer.
 */
export function textoDePieza(contenido: Contenido): string {
  return [contenido.caption, contenido.cta, contenido.hashtags]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
}

async function cerrar(
  slotId: string,
  campos: { estado_publicacion: string; post_externo_id?: string; error_publicacion?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("content_slots")
    .update({
      ...campos,
      publicando_desde: null,
      ...(campos.estado_publicacion === "publicado"
        ? { publicado_at: new Date().toISOString(), error_publicacion: null }
        : {}),
    })
    .eq("id", slotId)

  if (error) {
    // Esto es lo peor que puede pasar: la pieza salió y no pudimos anotarlo. El
    // reintento la republicaría. Queda gritado en el log porque no hay forma
    // automática de arreglarlo — hay que mirar la fila a mano.
    console.error(`[publicar] NO SE PUDO CERRAR el slot ${slotId}`, error, campos)
  }
}

async function publicarUna(fila: Fila): Promise<Resultado> {
  const slotId = String(fila.id)
  const canal = (fila.canal === "linkedin" ? "linkedin" : "meta") as Canal
  const destino = DESTINO_DE_CANAL[canal]

  try {
    const contenido = fila.contenido as Contenido | null
    if (!contenido?.caption) throw new Error("La pieza no tiene contenido escrito")

    const imagenPath = typeof fila.imagen_path === "string" ? fila.imagen_path : null
    if (!imagenPath) throw new Error("La pieza no tiene imagen generada")

    const [imagenUrl] = await firmar([imagenPath])
    if (!imagenUrl) throw new Error("No se pudo firmar la URL de la imagen")

    const cuenta = await traerCuenta(destino)
    if (!cuenta) throw new Error(`No hay ninguna cuenta de ${destino} conectada`)

    const texto = textoDePieza(contenido)

    const postId =
      destino === "instagram"
        ? await publicarEnInstagram({
            igUserId: cuenta.cuentaId,
            accessToken: await tokenInstagram(cuenta),
            imagenUrl,
            caption: texto,
          })
        : await publicarEnLinkedin({
            autorUrn: cuenta.cuentaId,
            accessToken: await tokenLinkedin(cuenta),
            imagenUrl,
            texto,
            // El titular de la pieza como alt: es literalmente lo que dice la
            // imagen, así que describe mejor que cualquier texto genérico.
            altText: contenido.captionCorto || contenido.caption.slice(0, 200),
          })

    // Primero el id, después el estado, en el mismo update: mientras el id sea
    // null la pieza se puede reintentar sin riesgo, y con id ya no se reintenta
    // nunca más. Es la línea que separa "no salió" de "salió".
    await cerrar(slotId, { estado_publicacion: "publicado", post_externo_id: postId })
    return { slotId, canal, ok: true, postId }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    await cerrar(slotId, { estado_publicacion: "error", error_publicacion: mensaje })
    console.error(`[publicar] falló el slot ${slotId} (${canal})`, mensaje)
    return { slotId, canal, ok: false, error: mensaje }
  }
}

/**
 * Un tick del cron.
 *
 * Las piezas se publican en serie y no en paralelo, a propósito. Son cinco como
 * mucho y ninguna tarda más de unos segundos, así que no se gana nada; y en
 * paralelo, dos piezas del mismo canal pueden pedir el refresh del mismo token
 * a la vez y una pisar el resultado de la otra.
 */
export async function tickDePublicacion(): Promise<Resultado[]> {
  const { data, error } = await supabase.rpc("reclamar_publicaciones", { limite: POR_TICK })

  if (error) throw new Error(`No se pudo leer la cola: ${error.message}`)

  const filas = (data ?? []) as Fila[]
  const resultados: Resultado[] = []

  for (const fila of filas) {
    resultados.push(await publicarUna(fila))
  }

  return resultados
}
