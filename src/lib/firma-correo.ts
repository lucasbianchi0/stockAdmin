import { EMPRESA } from "@/lib/brand-kit"

/**
 * Pie de firma de correo.
 *
 * El HTML se arma acá y no en el componente por una razón: una firma de mail no
 * es una vista de React. Tiene que sobrevivir a Gmail y a Outlook, que borran el
 * `<style>`, ignoran flexbox y reacomodan divs — de ahí las tablas anidadas y el
 * estilo inline en cada celda. Lo que se ve en la previa es literalmente el
 * string que se copia al portapapeles.
 *
 * Las imágenes van por URL de producción y nunca en base64: Gmail descarta los
 * `data:` de la firma guardada en Configuración.
 */

const CDN = "https://www.accedra.com.ar/logos/"

const NAVY = "#0D1F3A"
const TEXTO = "#3A4A63"
const SUAVE = "#6B7A91"
const AZUL = "#2B56D4"
const REGLA = "#DCE3EE"

const F = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"

/** Ancho útil adentro del bloque blanco de 600px (20px de padding por lado). */
const ANCHO = 560
/** Aire entre la fila de logo/iconos y la tira de marcas. */
const AIRE_PARTNERS = 34
/** Alto de la tira; lo fija `public/firma/tira_partners.py`, que la dibuja. */
const ALTO_PARTNERS = 54
/** Lado de la ficha de enlace; los PNG están a 48px para que no se vean blandas. */
const ICONO = 24
/** Separación entre fichas, la del pie del sitio a esta escala. */
const AIRE_ICONOS = 8

export type ModeloFirma = "completa" | "clasica"

export type DatosFirma = {
  nombre: string
  cargo: string
  email: string
  celular: string
  telefono: string
  linkedin: string
}

export const FIRMA_DEFAULT: DatosFirma = {
  nombre: "Carlos Bianchi",
  cargo: "Director Comercial",
  email: "carlosbianchi@accedra.com.ar",
  celular: "+54 9 11 6620-2809",
  telefono: "+54 11 5272-8753",
  linkedin: EMPRESA.linkedin,
}

export const MODELOS: { id: ModeloFirma; nombre: string; bajada: string }[] = [
  {
    id: "completa",
    nombre: "Completa",
    bajada:
      "Datos arriba y, debajo, el bloque de marca: el logo, los tres enlaces y los doce partners. La de un primer contacto.",
  },
  {
    id: "clasica",
    nombre: "Clásica",
    bajada:
      "Logo grande, regla vertical y datos al lado, como la firma histórica. Debajo los tres enlaces y las marcas.",
  },
]

/* ── Piezas ───────────────────────────────────────────────────────────────── */

/** Todo lo que escribe una persona pasa por acá: son datos, no marcado. */
function esc(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Un teléfono se marca por tel: sin espacios ni paréntesis. */
function tel(v: string) {
  return v.replace(/[^\d+]/g, "")
}

/** El SVG del wordmark es 1068×160; el PNG servido, 560×84. */
function wordmark(w: number) {
  const h = Math.round(w * 0.15)
  return (
    `<img src="${CDN}accedra-firma-email.png" alt="ACCEDRA" width="${w}" height="${h}" ` +
    `style="display:block;width:${w}px;height:${h}px;border:0;outline:none;">`
  )
}

/**
 * La fila de enlaces son tres iconos y nada más.
 *
 * Los botones con texto pesaban tanto como los datos de la persona y competían
 * con el wordmark; el icono ya dice a dónde va sin escribirlo. Son los mismos
 * glifos y el mismo tratamiento que el pie del sitio, en gris: abajo está la
 * tira de partners, y dos filas de color seguidas convierten el pie en un
 * tablero. Los arma `public/firma/generar-iconos.py`.
 */
function enlaces(d: DatosFirma) {
  const destinos: { href: string; icono: string; alt: string }[] = [
    { href: EMPRESA.sitio, icono: "web", alt: "Sitio web" },
    { href: d.linkedin.trim(), icono: "linkedin", alt: "LinkedIn" },
    { href: EMPRESA.instagram, icono: "instagram", alt: "Instagram" },
  ]
  const celdas = destinos
    .filter((x) => x.href)
    .map(({ href, icono, alt }, i) => {
      const pad = i === 0 ? "0" : `0 0 0 ${AIRE_ICONOS}px`
      return (
        `<td valign="middle" style="padding:${pad};"><a href="${esc(href)}">` +
        `<img src="${CDN}firma-icono-${icono}-gris.png" alt="${alt}" width="${ICONO}" height="${ICONO}" ` +
        `style="display:block;width:${ICONO}px;height:${ICONO}px;border:0;"></a></td>`
      )
    })
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>` +
    celdas.join("") +
    `</tr></table>`
  )
}

/**
 * La tira de partners es una sola imagen y no doce.
 *
 * Cada logo suelto es un pedido que Gmail además proxea la primera vez: doce
 * hacían que la firma se dibujara de a pedazos.
 */
function partners() {
  return (
    `<img src="${CDN}accedra-firma-partners-12.png" alt="Partners de Accedra" width="${ANCHO}" height="${ALTO_PARTNERS}" ` +
    `style="display:block;width:${ANCHO}px;height:${ALTO_PARTNERS}px;border:0;">`
  )
}

function espaciador(alto: number) {
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>` +
    `<td height="${alto}" style="height:${alto}px;line-height:${alto}px;font-size:0;">&nbsp;</td></tr></table>`
  )
}

/**
 * El bloque se lleva su propio piso blanco. Un cliente en modo oscuro invierte
 * el texto pero no las imágenes: sin este fondo, el wordmark navy desaparece.
 */
function envolver(interno: string) {
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="600" ` +
    `style="border-collapse:collapse;width:600px;background-color:#ffffff;">` +
    `<tr><td style="padding:18px 20px 18px 20px;background-color:#ffffff;">${interno}</td></tr></table>`
  )
}

type LineaOpts = { conEtiquetas: boolean }

/** Las líneas de la persona. Un campo vacío no deja el renglón en blanco: no sale. */
function identidad(d: DatosFirma, { conEtiquetas }: LineaOpts) {
  const filas: string[] = []
  const push = (pad: number, estilo: string, contenido: string) =>
    filas.push(`<tr><td style="padding:${pad}px 0 0 0;${estilo}">${contenido}</td></tr>`)

  if (d.nombre.trim()) {
    push(0, `${F}font-size:15px;line-height:20px;font-weight:700;color:${NAVY};`, esc(d.nombre))
  }
  if (d.cargo.trim()) {
    push(
      3,
      `${F}font-size:11px;line-height:15px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:${SUAVE};`,
      esc(d.cargo)
    )
  }
  if (d.email.trim()) {
    push(
      11,
      `${F}font-size:13px;line-height:19px;color:${TEXTO};`,
      `<a href="mailto:${esc(d.email.trim())}" style="color:${AZUL};text-decoration:none;">${esc(d.email)}</a>`
    )
  }

  const linea = (etiqueta: string, valor: string) => {
    const marca = `<a href="tel:${tel(valor)}" style="color:${TEXTO};text-decoration:none;">${esc(valor)}</a>`
    const prefijo = conEtiquetas ? `<span style="color:${SUAVE};">${etiqueta}</span> ` : ""
    push(1, `${F}font-size:13px;line-height:19px;color:${TEXTO};`, prefijo + marca)
  }
  if (d.celular.trim()) linea("Cel.", d.celular)
  if (d.telefono.trim()) linea("Tel.", d.telefono)

  push(8, `${F}font-size:12px;line-height:17px;color:${SUAVE};`, EMPRESA.domicilio)
  push(1, `${F}font-size:12px;line-height:17px;color:${SUAVE};`, "Buenos Aires — Argentina")

  return filas.join("")
}

const TABLA = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${F}">`

/* ── Modelos ──────────────────────────────────────────────────────────────── */

function completa(d: DatosFirma) {
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" style="padding:0;">${wordmark(140)}</td>` +
    `<td valign="middle" align="right" style="padding:0;">${enlaces(d)}</td>` +
    `</tr></table>`
  const bloque = cabecera + espaciador(AIRE_PARTNERS) + partners()
  return (
    TABLA +
    identidad(d, { conEtiquetas: true }) +
    `<tr><td style="padding:16px 0 0 0;">${envolver(bloque)}</td></tr>` +
    `</table>`
  )
}

function clasica(d: DatosFirma) {
  /** Largo de la regla: lo que miden las líneas de datos. */
  const altoDatos = 149
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" align="left" width="216" style="width:216px;padding:0 26px 0 0;">${wordmark(190)}</td>` +
    `<td width="1" valign="middle" style="width:1px;padding:0;background-color:${REGLA};font-size:0;line-height:0;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>` +
    `<td width="1" height="${altoDatos}" style="width:1px;height:${altoDatos}px;font-size:0;line-height:0;">&nbsp;</td>` +
    `</tr></table></td>` +
    `<td valign="middle" style="padding:0 0 0 26px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">` +
    identidad(d, { conEtiquetas: true }) +
    `</table></td></tr></table>`
  const interno =
    cabecera + espaciador(22) + enlaces(d) + espaciador(AIRE_PARTNERS) + partners()
  return TABLA + `<tr><td style="padding:0;">${envolver(interno)}</td></tr></table>`
}

export function firmaHtml(datos: DatosFirma, modelo: ModeloFirma) {
  return modelo === "clasica" ? clasica(datos) : completa(datos)
}

/** La versión en texto plano que acompaña al copiado, para el cliente que no acepta HTML. */
export function firmaTexto(d: DatosFirma) {
  return [
    d.nombre,
    d.cargo,
    d.email,
    d.celular && `Cel. ${d.celular}`,
    d.telefono && `Tel. ${d.telefono}`,
    EMPRESA.domicilio,
    "Buenos Aires — Argentina",
    EMPRESA.sitio,
  ]
    .filter(Boolean)
    .join("\n")
}
