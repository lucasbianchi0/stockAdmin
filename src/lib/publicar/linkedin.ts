/**
 * Publicar una imagen en LinkedIn.
 *
 * Al revés que Instagram, acá los bytes se suben: LinkedIn no se descarga nada
 * de una URL nuestra. Son tres pasos —pedir un lugar donde subir, subir, y
 * recién ahí crear el post— y el orden no es negociable, porque el post se crea
 * con el URN de la imagen que devuelve el primer paso.
 *
 * El autor puede ser una persona o una organización y el request es idéntico:
 * cambia el URN y nada más. Lo que no es idéntico es el permiso —publicar en la
 * Página de la empresa exige la Community Management API, publicar en el perfil
 * no— pero eso se resuelve del lado de LinkedIn, no acá.
 */

/**
 * La API versionada de LinkedIn. El header es obligatorio y con formato AAAAMM.
 *
 * Configurable porque LinkedIn retira las versiones viejas cada doce meses y no
 * avisa dos veces: la 202508 se dio de baja el 17 de agosto de 2026. Cuando esto
 * empiece a devolver 426, se sube el número acá y listo — pero conviene mirar el
 * changelog antes de que pase, porque el día que caduca dejan de salir los posts
 * y nadie se entera hasta que alguien abre el feed.
 */
const VERSION = process.env.LINKEDIN_API_VERSION ?? "202608"
const BASE = "https://api.linkedin.com/rest"

/** 3000 es el máximo del `commentary` de la Posts API. */
export const COMMENTARY_MAX = 3000

function cabeceras(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  }
}

/**
 * El texto del post, con los caracteres reservados escapados.
 *
 * El `commentary` no es texto plano: LinkedIn lo interpreta con su propio
 * formato y un paréntesis suelto —"(y esto también)"— hace fallar el request
 * entero con un error de sintaxis que no menciona el paréntesis. Es la clase de
 * cosa que sale bien en las pruebas y revienta el primer día que un caption
 * tiene una aclaración entre paréntesis.
 *
 * `#` queda deliberadamente afuera de la lista: escaparlo convertiría cada
 * hashtag en texto muerto, que es justo lo contrario de lo que se quiere.
 */
export function escaparCommentary(texto: string): string {
  return texto.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`)
}

/** Paso 1: LinkedIn reserva un lugar y devuelve a dónde subir y con qué URN. */
async function iniciarSubida(
  accessToken: string,
  autorUrn: string
): Promise<{ uploadUrl: string; imagenUrn: string }> {
  const res = await fetch(`${BASE}/images?action=initializeUpload`, {
    method: "POST",
    headers: { ...cabeceras(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner: autorUrn } }),
  })

  const cuerpo = (await res.json().catch(() => null)) as
    | { value?: { uploadUrl?: string; image?: string }; message?: string }
    | null

  if (!res.ok || !cuerpo?.value?.uploadUrl || !cuerpo.value.image) {
    throw new Error(`LinkedIn (initializeUpload): ${cuerpo?.message ?? `HTTP ${res.status}`}`)
  }

  return { uploadUrl: cuerpo.value.uploadUrl, imagenUrn: cuerpo.value.image }
}

/** Paso 2: los bytes. Un PUT crudo, sin JSON de por medio. */
async function subirBytes(uploadUrl: string, accessToken: string, imagen: ArrayBuffer): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: imagen,
  })

  if (!res.ok) {
    throw new Error(`LinkedIn (subida de imagen): HTTP ${res.status}`)
  }
}

/**
 * Los tres pasos. Devuelve el id del post.
 *
 * `imagenUrl` se descarga acá adentro —a diferencia de Instagram, donde se le
 * pasa la URL a Meta— así que sirve cualquier URL que alcance este proceso,
 * incluida una firmada de Supabase.
 */
export async function publicarEnLinkedin(args: {
  autorUrn: string
  accessToken: string
  imagenUrl: string
  texto: string
  altText: string
}): Promise<string> {
  const { autorUrn, accessToken, imagenUrl, texto, altText } = args

  if (texto.length > COMMENTARY_MAX) {
    throw new Error(`LinkedIn: el texto tiene ${texto.length} caracteres y el máximo es ${COMMENTARY_MAX}`)
  }

  const descarga = await fetch(imagenUrl)
  if (!descarga.ok) {
    throw new Error(`LinkedIn: no se pudo leer la imagen de la pieza (HTTP ${descarga.status})`)
  }
  const bytes = await descarga.arrayBuffer()

  const { uploadUrl, imagenUrn } = await iniciarSubida(accessToken, autorUrn)
  await subirBytes(uploadUrl, accessToken, bytes)

  const res = await fetch(`${BASE}/posts`, {
    method: "POST",
    headers: { ...cabeceras(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      author: autorUrn,
      commentary: escaparCommentary(texto),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      // `altText` no es decorativo: sin él el post es ilegible para cualquiera
      // que use lector de pantalla, y en LinkedIn el campo es gratis.
      content: { media: { id: imagenUrn, altText: altText.slice(0, 300) } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => "")
    throw new Error(`LinkedIn (posts): HTTP ${res.status} ${detalle.slice(0, 300)}`)
  }

  // El id viene en un header, no en el cuerpo —la respuesta es 201 sin body—.
  // Si algún día LinkedIn deja de mandarlo, no se puede tratar como éxito sin
  // id: el id es lo único que impide que el reintento republique la pieza.
  const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id")
  if (!id) throw new Error("LinkedIn: el post se creó pero no devolvió id")

  return id
}
