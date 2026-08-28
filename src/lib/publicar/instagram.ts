/**
 * Publicar una imagen en Instagram.
 *
 * Va contra graph.instagram.com —"Instagram API con Instagram Login"— y no
 * contra graph.facebook.com. La diferencia importa antes de escribir una línea:
 * el camino clásico exige una Página de Facebook vinculada a la cuenta, y este
 * no. Para una marca que no usa Facebook, es una Página fantasma menos que
 * mantener y un permiso menos que pedir en la revisión.
 *
 * El requisito que no se puede esquivar por ningún camino: la cuenta tiene que
 * ser Profesional (Business o Creator). Para una cuenta personal no hay API.
 */

const VERSION = process.env.INSTAGRAM_API_VERSION ?? "v23.0"
const BASE = `https://graph.instagram.com/${VERSION}`

/** 2200 es el máximo de Instagram. Pasarse devuelve un 400 sin publicar nada. */
export const CAPTION_MAX = 2200

type RespuestaMeta = { id?: string; error?: { message?: string; code?: number } }

async function llamar(ruta: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`${BASE}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  })

  const cuerpo = (await res.json().catch(() => null)) as RespuestaMeta | null

  if (!res.ok || !cuerpo?.id) {
    const detalle = cuerpo?.error?.message ?? `HTTP ${res.status}`
    throw new Error(`Instagram: ${detalle}`)
  }

  return cuerpo.id
}

/**
 * Sube la imagen y la publica. Devuelve el id del post.
 *
 * Son dos llamadas y no una porque Instagram separa "preparar" de "publicar":
 * la primera crea un contenedor y le da a Meta la URL para que se descargue la
 * imagen él mismo —nunca se le mandan los bytes—, y la segunda lo publica.
 *
 * Eso obliga a que `imagenUrl` sea alcanzable desde afuera. Una URL firmada de
 * Supabase sirve: para Meta es un GET común. Lo que no sirve es una ruta del
 * bucket ni una URL detrás de la sesión, y el error que devuelve en ese caso
 * ("media couldn't be fetched") no dice cuál de las dos cosas pasó.
 */
export async function publicarEnInstagram(args: {
  igUserId: string
  accessToken: string
  imagenUrl: string
  caption: string
}): Promise<string> {
  const { igUserId, accessToken, imagenUrl, caption } = args

  if (caption.length > CAPTION_MAX) {
    throw new Error(`Instagram: el caption tiene ${caption.length} caracteres y el máximo es ${CAPTION_MAX}`)
  }

  const contenedorId = await llamar(`/${igUserId}/media`, {
    image_url: imagenUrl,
    caption,
    access_token: accessToken,
  })

  // Sin espera entre las dos llamadas: para una imagen sola el contenedor queda
  // listo de inmediato. El polling de `status_code` hace falta para reels y
  // carruseles, que son otro flujo y todavía no se usan acá.
  return llamar(`/${igUserId}/media_publish`, {
    creation_id: contenedorId,
    access_token: accessToken,
  })
}
