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

/**
 * De dónde salen las imágenes.
 *
 * En el mail, siempre de accedra.com.ar: un cliente de correo no puede leer nada
 * de esta app, y Gmail descarta las imágenes incrustadas. En la previa de acá,
 * de `public/logos/`, que son las mismas copiadas al repo — así lo que se ve no
 * depende de que el sitio esté desplegado, que es lo que hacía aparecer la tira
 * rota en el minuto que va entre el push y el deploy.
 */
export const CDN = "https://www.accedra.com.ar/logos/"
export const LOGOS_PREVIA = "/logos/"

/**
 * Los dos tonos del bloque de marca.
 *
 * El claro es la firma de siempre: el bloque blanco que le da piso al wordmark
 * navy. El oscuro es el pie del sitio traído al mail —fondo navy, wordmark
 * blanco, "IT Solutions" en azul y los partners en blanco—, y no es un negativo
 * automático del claro: sobre navy el azul de enlace (#2B56D4) se hunde y el
 * gris de los datos secundarios no llega a leerse, así que los dos suben.
 *
 * Cada tono nombra además sus imágenes, que son archivos distintos: un PNG no se
 * puede recolorear desde el CSS de un mail.
 */
export type Tono = "claro" | "oscuro"

type Paleta = {
  fondo: string
  fuerte: string
  texto: string
  suave: string
  azul: string
  regla: string
  wordmark: string
  iconos: string
  partners: string
}

const PALETA: Record<Tono, Paleta> = {
  claro: {
    fondo: "#ffffff",
    fuerte: "#0D1F3A",
    texto: "#3A4A63",
    suave: "#6B7A91",
    azul: "#2B56D4",
    regla: "#DCE3EE",
    wordmark: "accedra-firma-email.png",
    iconos: "gris",
    partners: "accedra-firma-partners-12-v3.png",
  },
  oscuro: {
    fondo: "#101827",
    fuerte: "#ffffff",
    texto: "#C8D2E1",
    suave: "#8DA0BD",
    azul: "#7EA6FF",
    regla: "#263047",
    wordmark: "accedra-firma-email-blanco.png",
    iconos: "oscuro",
    partners: "accedra-firma-partners-12-oscuro-v3.png",
  },
}

/** El azul del "IT Solutions" del pie del sitio; sobre blanco va el de la marca. */
const BAJADA = { claro: "#2B56D4", oscuro: "#60A5FA" }

const F = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"

/** Ancho útil adentro del bloque blanco de 600px (20px de padding por lado). */
const ANCHO = 560
/** Aire entre la fila de logo/iconos y la tira de marcas. */
const AIRE_PARTNERS = 34
/** Alto de la tira; lo fija `public/firma/tira_partners.py`, que la dibuja. */
const ALTO_PARTNERS = 56
/** Lado de la ficha de enlace; los PNG están a 48px para que no se vean blandas. */
const ICONO = 24
/** Separación entre fichas, la del pie del sitio a esta escala. */
const AIRE_ICONOS = 8
/** Aire entre "IT Solutions" y las fichas cuando cuelgan del mismo bloque. */
const AIRE_ENLACES = 18

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

export const TONOS: { id: Tono; nombre: string }[] = [
  { id: "claro", nombre: "Claro" },
  { id: "oscuro", nombre: "Oscuro" },
]

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
function wordmark(w: number, t: Tono) {
  const h = Math.round(w * 0.15)
  return (
    `<img src="${CDN}${PALETA[t].wordmark}" alt="ACCEDRA" width="${w}" height="${h}" ` +
    `style="display:block;width:${w}px;height:${h}px;border:0;outline:none;">`
  )
}

/**
 * El wordmark con "IT Solutions" abajo: el lockup del pie del sitio.
 *
 * El wordmark solo es una palabra de 21px de alto contra una fila de fichas de
 * 24 y una tira de doce marcas; la columna quedaba vacía y la marca, liviana. La
 * bajada la llena con lo único que puede ir ahí sin agregar un mensaje nuevo:
 * cómo se llama la empresa entera. Va en versalitas espaciadas, que es como
 * aparece en accedra.com.ar y lo que permite que una línea de 10px sostenga un
 * ancho de 140 sin engordar la tipografía.
 */
function marca(w: number, t: Tono, pie = "") {
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">` +
    `<tr><td style="padding:0;">${wordmark(w, t)}</td></tr>` +
    `<tr><td style="padding:7px 0 0 0;${F}font-size:10px;line-height:13px;font-weight:600;` +
    `letter-spacing:2.5px;text-transform:uppercase;color:${BAJADA[t]};">IT Solutions</td></tr>` +
    (pie ? `<tr><td style="padding:${AIRE_ENLACES}px 0 0 0;">${pie}</td></tr>` : "") +
    `</table>`
  )
}

/**
 * La fila de enlaces son tres iconos y nada más.
 *
 * Los botones con texto pesaban tanto como los datos de la persona y competían
 * con el wordmark; el icono ya dice a dónde va sin escribirlo. Son los mismos
 * glifos y el mismo tratamiento que el pie del sitio, apagados: abajo está la
 * tira de partners, y dos filas de color seguidas convierten el pie en un
 * tablero. Los arma `public/firma/generar-iconos.py`, uno por tono.
 */
function enlaces(d: DatosFirma, t: Tono) {
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
        `<img src="${CDN}firma-icono-${icono}-${PALETA[t].iconos}.png" alt="${alt}" width="${ICONO}" height="${ICONO}" ` +
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
 *
 * El `-v3` del nombre no es un descuido: una imagen de firma queda cacheada en
 * el navegador, en el CDN y en el proxy de Gmail, y de los tres se controla uno
 * solo. Al redibujarla se sube el número en `tira_partners.py` y se cambia acá;
 * es lo único que hace que todos vean lo mismo el mismo día.
 */
function partners(t: Tono) {
  return (
    `<img src="${CDN}${PALETA[t].partners}" alt="Partners de Accedra" width="${ANCHO}" height="${ALTO_PARTNERS}" ` +
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
 * El bloque se lleva su propio piso, sea blanco o navy. Un cliente en modo
 * oscuro invierte el texto pero no las imágenes: sin un fondo propio, el
 * wordmark queda flotando sobre lo que se le ocurra al cliente y desaparece.
 *
 * El color va en el `bgcolor` además del `style` porque Outlook lo lee de ahí, y
 * en las dos celdas porque algunos clientes se quedan con el de la interior.
 */
function envolver(interno: string, t: Tono) {
  const { fondo } = PALETA[t]
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="600" bgcolor="${fondo}" ` +
    `style="border-collapse:collapse;width:600px;background-color:${fondo};">` +
    `<tr><td bgcolor="${fondo}" style="padding:18px 20px 18px 20px;background-color:${fondo};">${interno}</td></tr></table>`
  )
}

/**
 * `tono` acá es el del fondo sobre el que caen estas líneas, que no siempre es
 * el del bloque de marca: en la completa los datos van afuera del bloque, sobre
 * el fondo del mail, y siguen en claro aunque el bloque de abajo sea navy.
 */
type LineaOpts = { conEtiquetas: boolean; tono: Tono }

/** Las líneas de la persona. Un campo vacío no deja el renglón en blanco: no sale. */
function identidad(d: DatosFirma, { conEtiquetas, tono }: LineaOpts) {
  const { fuerte, texto, suave, azul } = PALETA[tono]
  const filas: string[] = []
  const push = (pad: number, estilo: string, contenido: string) =>
    filas.push(`<tr><td style="padding:${pad}px 0 0 0;${estilo}">${contenido}</td></tr>`)

  if (d.nombre.trim()) {
    push(0, `${F}font-size:15px;line-height:20px;font-weight:700;color:${fuerte};`, esc(d.nombre))
  }
  if (d.cargo.trim()) {
    push(
      3,
      `${F}font-size:11px;line-height:15px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:${suave};`,
      esc(d.cargo)
    )
  }
  if (d.email.trim()) {
    push(
      11,
      `${F}font-size:13px;line-height:19px;color:${texto};`,
      `<a href="mailto:${esc(d.email.trim())}" style="color:${azul};text-decoration:none;">${esc(d.email)}</a>`
    )
  }

  const linea = (etiqueta: string, valor: string) => {
    const numero = `<a href="tel:${tel(valor)}" style="color:${texto};text-decoration:none;">${esc(valor)}</a>`
    const prefijo = conEtiquetas ? `<span style="color:${suave};">${etiqueta}</span> ` : ""
    push(1, `${F}font-size:13px;line-height:19px;color:${texto};`, prefijo + numero)
  }
  if (d.celular.trim()) linea("Cel.", d.celular)
  if (d.telefono.trim()) linea("Tel.", d.telefono)

  push(8, `${F}font-size:12px;line-height:17px;color:${suave};`, EMPRESA.domicilio)
  push(1, `${F}font-size:12px;line-height:17px;color:${suave};`, "Buenos Aires — Argentina")

  return filas.join("")
}

const TABLA = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${F}">`

/* ── Modelos ──────────────────────────────────────────────────────────────── */

function completa(d: DatosFirma, t: Tono) {
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" style="padding:0;">${marca(140, t)}</td>` +
    `<td valign="middle" align="right" style="padding:0;">${enlaces(d, t)}</td>` +
    `</tr></table>`
  const bloque = cabecera + espaciador(AIRE_PARTNERS) + partners(t)
  return (
    TABLA +
    identidad(d, { conEtiquetas: true, tono: "claro" }) +
    `<tr><td style="padding:16px 0 0 0;">${envolver(bloque, t)}</td></tr>` +
    `</table>`
  )
}

/**
 * Los tres iconos van colgados del wordmark, no en una fila propia debajo del
 * bloque: sueltos abajo a la izquierda quedaban a la misma altura que la tira de
 * partners y se leían como una marca más. Apilados bajo "IT Solutions" cierran
 * la columna de marca, que es a lo que pertenecen.
 */
function clasica(d: DatosFirma, t: Tono) {
  /** Largo de la regla: lo que miden las líneas de datos. */
  const altoDatos = 149
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" align="left" width="216" style="width:216px;padding:0 26px 0 0;">` +
    `${marca(190, t, enlaces(d, t))}</td>` +
    `<td width="1" valign="middle" style="width:1px;padding:0;background-color:${PALETA[t].regla};font-size:0;line-height:0;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>` +
    `<td width="1" height="${altoDatos}" style="width:1px;height:${altoDatos}px;font-size:0;line-height:0;">&nbsp;</td>` +
    `</tr></table></td>` +
    `<td valign="middle" style="padding:0 0 0 26px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">` +
    identidad(d, { conEtiquetas: true, tono: t }) +
    `</table></td></tr></table>`
  const interno = cabecera + espaciador(AIRE_PARTNERS) + partners(t)
  return TABLA + `<tr><td style="padding:0;">${envolver(interno, t)}</td></tr></table>`
}

export function firmaHtml(datos: DatosFirma, modelo: ModeloFirma, tono: Tono = "claro", base = CDN) {
  const html = modelo === "clasica" ? clasica(datos, tono) : completa(datos, tono)
  return base === CDN ? html : html.replaceAll(CDN, base)
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
