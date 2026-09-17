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
  lockup: string
  iconos: string
  partners: string
}

/**
 * El blanco de la firma no es blanco puro, y no es un capricho.
 *
 * caniemail.com y la guía de modo oscuro de Litmus coinciden: varios clientes
 * invierten #FFFFFF y #000000 *aunque estén declarados explícitamente*, porque
 * los leen como "el autor no eligió nada". Un off-white a un punto de distancia
 * se ve igual y esquiva esa heurística.
 *
 * Tiene que ser el MISMO valor con el que `generar-lockup.py` dibuja el halo del
 * logo: si no coinciden, el halo se recorta contra el fondo del bloque.
 */
const BLANCO = "#FDFDFD"

export const PALETA: Record<Tono, Paleta> = {
  claro: {
    fondo: BLANCO,
    fuerte: "#0D1F3A",
    texto: "#3A4A63",
    // #6B7A91 daba 4.29 de contraste contra el fondo, abajo del mínimo 4.5 de
    // WCAG AA. Es el color de la dirección y del cargo, o sea las líneas que ya
    // son las más chicas de la firma. Oscurecido en línea recta hacia el negro
    // —mismo tono, solo más oscuro— llega a 4.67, que deja algo de margen.
    suave: "#66748A",
    azul: "#2B56D4",
    regla: "#DCE3EE",
    lockup: "accedra-firma-lockup.png",
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
    lockup: "accedra-firma-lockup-blanco.png",
    iconos: "oscuro",
    partners: "accedra-firma-partners-12-oscuro-v3.png",
  },
}

const F = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"

/** Ancho útil adentro del bloque blanco de 600px (20px de padding por lado). */
const ANCHO = 560
/** Aire entre la fila de logo/iconos y la tira de marcas. */
const AIRE_PARTNERS = 34
/** Alto de la tira; lo fija `public/firma/tira_partners.py`, que la dibuja. */
const ALTO_PARTNERS = 56

/**
 * La banda del modelo homónimo: las marcas sobre navy, de borde a borde.
 *
 * Es otra imagen y no la tira de siempre pintada de azul. Va a 4 logos por fila
 * en vez de 6 porque con columnas de 93px los logos anchos —Nutanix, Check
 * Point, CommScope— se tocan antes de llegar a agrandarse: el techo lo pone la
 * columna, no el tamaño. Con 4 columnas entran a 30px de alto contra los 19 de
 * la tira normal.
 *
 * Trae su propio aire adentro del navy porque acá el borde de la imagen es el
 * borde de la banda: no hay tabla alrededor que ponga el margen.
 */
const BANDA = "accedra-firma-partners-12-banda-oscuro-v3.png"
const BANDA_ANCHO = 600
const BANDA_ALTO = 158
/** Lado de la ficha de enlace; los PNG están a 48px para que no se vean blandas. */
const ICONO = 24
/** Separación entre fichas, la del pie del sitio a esta escala. */
const AIRE_ICONOS = 8
/** Aire entre "IT Solutions" y las fichas cuando cuelgan del mismo bloque. */
const AIRE_ENLACES = 18
/**
 * Aire entre la columna de marca y la regla, y entre la regla y los datos.
 *
 * Va como padding de la celda, y el `width` que se declara al lado lo incluye:
 * un cliente de correo resuelve el ancho de una celda de tabla como borde a
 * borde. Declarar el ancho del logo a secas le come el gutter a la imagen.
 */
const GUTTER = 26

export type ModeloFirma = "completa" | "clasica" | "banda"

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

/**
 * El oscuro dejó de ser una firma de correo y quedó solo para exportar.
 *
 * Los clientes que fuerzan modo oscuro —Outlook.com, Outlook móvil, Gmail en
 * varios Android— están escritos para el caso común: texto oscuro sobre fondo
 * blanco, que invierten y queda bien. La firma oscura es el caso inverso: ya
 * viene con texto claro sobre fondo oscuro, el transformador la "arregla" igual
 * y la rompe. El fondo sobrevive porque va declarado en `bgcolor`; el texto no,
 * así que termina oscuro sobre oscuro e ilegible.
 *
 * Como imagen no le pasa nada de eso —nadie invierte los píxeles de un PNG—, y
 * por eso sigue disponible para bajar y pegar donde el fondo lo elijas vos.
 */
export const TONOS: { id: Tono; nombre: string; correo: boolean; nota?: string }[] = [
  { id: "claro", nombre: "Claro", correo: true },
  {
    id: "oscuro",
    nombre: "Oscuro",
    correo: false,
    nota: "Solo para bajar como imagen. Como firma de correo se rompe: los clientes que fuerzan modo oscuro le invierten el texto y queda ilegible sobre el fondo navy.",
  },
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
  {
    id: "banda",
    nombre: "Con banda",
    bajada:
      "La misma organización de la clásica, pero las marcas van abajo en una banda navy de borde a borde, con los logos bastante más grandes.",
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

/**
 * El lockup servido es 560×138: el doble exacto de 280×69.
 *
 * De ahí sale el techo. A 280px de ancho entra justo al doble, que es lo que
 * pide una pantalla retina; más grande que eso hay que volver a rasterizarlo con
 * `public/firma/generar-lockup.py` antes de subir el número acá.
 */
const WORDMARK_MAX = 280

/** 69/280, la proporción del lockup. La fija `generar-lockup.py`. */
const LOCKUP_RATIO = 0.246429

/**
 * El lockup entero —wordmark y "IT Solutions"— en una sola imagen.
 *
 * El `alt` dice el nombre completo de la empresa porque es lo único que queda
 * cuando el cliente bloquea las imágenes remotas, que es el default de Outlook
 * de escritorio y lo que hace Gmail con un remitente desconocido. Así la firma
 * pierde el logo pero no deja de decir de quién es.
 */
function lockup(w: number, t: Tono) {
  const h = Math.round(w * LOCKUP_RATIO)
  return (
    `<img src="${CDN}${PALETA[t].lockup}" alt="Accedra IT Solutions" width="${w}" height="${h}" ` +
    `style="display:block;width:${w}px;height:${h}px;border:0;outline:none;">`
  )
}

/**
 * La columna de marca: el lockup y, si se le cuelga, la fila de enlaces.
 *
 * "IT Solutions" era la última línea de texto que quedaba acá, y el texto de un
 * mail lo dibuja el cliente, no nosotros: la pila 'Segoe UI'/Roboto/Helvetica/
 * Arial la resuelve distinto Gmail en Android que Outlook en Windows, y en una
 * línea en versalitas con `letter-spacing` esa diferencia se ve — la bajada
 * terminaba más ancha o más angosta que el wordmark que tiene encima, que es lo
 * único que no puede pasar en un lockup. Horneada dentro del PNG sale igual en
 * todos lados, y además en Inter, la tipografía de la marca, que ningún cliente
 * de correo tiene instalada.
 *
 * Los tres íconos NO entran en esa imagen a propósito: van a tres destinos
 * distintos y adentro de un PNG perderían el link.
 */
function marca(w: number, t: Tono, pie = "") {
  return (
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">` +
    `<tr><td style="padding:0;">${lockup(w, t)}</td></tr>` +
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

/**
 * Un enlace con el color puesto dos veces: en el `<a>` y en un `<span>` adentro.
 *
 * Apple Mail y Gmail detectan solos los teléfonos y las direcciones y los
 * convierten en enlaces suyos —azul y subrayado—, pisando el estilo inline que
 * nosotros le pusimos al ancla. Lo que reescriben es el `<a>`; el `<span>` de
 * adentro les gana. Es feo y es el único que funciona.
 *
 * Que el `<a>` lo pongamos nosotros importa incluso cuando el destino es
 * secundario: si ya hay un ancla, muchos clientes no inventan la suya.
 */
function enlace(href: string, valor: string, color: string) {
  return (
    `<a href="${esc(href)}" style="color:${color};text-decoration:none;">` +
    `<span style="color:${color};text-decoration:none;">${esc(valor)}</span></a>`
  )
}

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
      // `text-transform` y `letter-spacing` se quedan: caniemail.com los da con
      // 95% de soporte. En Outlook Windows son parciales, pero lo único que les
      // falla es `lowercase` y los valores negativos grandes o en `em`; acá
      // usamos `uppercase` y `.7px`, que están dentro de lo que sí anda.
      `${F}font-size:11px;line-height:15px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:${suave};`,
      esc(d.cargo)
    )
  }
  if (d.email.trim()) {
    push(
      11,
      `${F}font-size:13px;line-height:19px;color:${texto};`,
      enlace(`mailto:${d.email.trim()}`, d.email, azul)
    )
  }

  const linea = (etiqueta: string, valor: string) => {
    const numero = enlace(`tel:${tel(valor)}`, valor, texto)
    const prefijo = conEtiquetas ? `<span style="color:${suave};">${etiqueta}</span> ` : ""
    push(1, `${F}font-size:13px;line-height:19px;color:${texto};`, prefijo + numero)
  }
  if (d.celular.trim()) linea("Cel.", d.celular)
  if (d.telefono.trim()) linea("Tel.", d.telefono)

  // La dirección va linkeada a propósito, aunque nadie haya pedido que lleve
  // enlace: es el campo que Apple Mail detecta y convierte en un link azul
  // subrayado suyo. Con el nuestro puesto, se queda con el nuestro.
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${EMPRESA.domicilio}, Buenos Aires, Argentina`
  )}`
  push(8, `${F}font-size:12px;line-height:17px;color:${suave};`, enlace(mapa, EMPRESA.domicilio, suave))
  push(1, `${F}font-size:12px;line-height:17px;color:${suave};`, "Buenos Aires — Argentina")

  return filas.join("")
}

const TABLA = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${F}">`

/* ── Modelos ──────────────────────────────────────────────────────────────── */

function completa(d: DatosFirma, t: Tono) {
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" style="padding:0;">${marca(200, t)}</td>` +
    `<td valign="middle" align="right" style="padding:0;">${enlaces(d, t)}</td>` +
    `</tr></table>`
  const bloque = cabecera + espaciador(AIRE_PARTNERS) + partners(t)

  /*
   * Los datos también se llevan su piso blanco, aunque no estén adentro del
   * bloque de marca.
   *
   * Antes caían sobre el fondo del mail y se dibujaban siempre en tono claro:
   * en un cliente en modo oscuro eso es texto oscuro sobre fondo oscuro, la
   * misma falla que rompe la firma oscura, pero acá pasaba incluso con el tono
   * claro elegido. Ningún texto de la firma puede quedar apoyado sobre un fondo
   * que no pusimos nosotros.
   */
  const datos =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="600" bgcolor="${BLANCO}" ` +
    `style="border-collapse:collapse;width:600px;background-color:${BLANCO};">` +
    `<tr><td bgcolor="${BLANCO}" style="padding:0;background-color:${BLANCO};">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${F}">` +
    identidad(d, { conEtiquetas: true, tono: "claro" }) +
    `</table></td></tr></table>`

  return (
    TABLA +
    `<tr><td style="padding:0;">${datos}</td></tr>` +
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
function cabeceraClasica(d: DatosFirma, t: Tono) {
  /** Largo de la regla: lo que miden las líneas de datos. */
  const altoDatos = 149
  /**
   * Las tres columnas se declaran y suman ANCHO exacto: marca + regla + datos.
   *
   * La de datos no se deja al criterio del cliente porque es la que paga el
   * agrandamiento del logo — con 253 entran las líneas más largas que puede
   * escribir alguien acá (la dirección mide 185 y el mail 179, más el gutter).
   */
  const colMarca = WORDMARK_MAX + GUTTER
  const colDatos = ANCHO - colMarca - 1
  const cabecera =
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="${ANCHO}" ` +
    `style="border-collapse:collapse;width:${ANCHO}px;"><tr>` +
    `<td valign="middle" align="left" width="${colMarca}" style="width:${colMarca}px;padding:0 ${GUTTER}px 0 0;">` +
    `${marca(WORDMARK_MAX, t, enlaces(d, t))}</td>` +
    `<td width="1" valign="middle" style="width:1px;padding:0;background-color:${PALETA[t].regla};font-size:0;line-height:0;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>` +
    `<td width="1" height="${altoDatos}" style="width:1px;height:${altoDatos}px;font-size:0;line-height:0;">&nbsp;</td>` +
    `</tr></table></td>` +
    `<td valign="middle" width="${colDatos}" style="width:${colDatos}px;padding:0 0 0 ${GUTTER}px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">` +
    identidad(d, { conEtiquetas: true, tono: t }) +
    `</table></td></tr></table>`
  return cabecera
}

function clasica(d: DatosFirma, t: Tono) {
  const interno = cabeceraClasica(d, t) + espaciador(AIRE_PARTNERS) + partners(t)
  return TABLA + `<tr><td style="padding:0;">${envolver(interno, t)}</td></tr></table>`
}

/**
 * La misma cabecera de la clásica, pero las marcas bajan a una banda navy propia.
 *
 * La banda va PEGADA al bloque de arriba y de borde a borde de la firma: es un
 * contenedor, no una tira apoyada adentro del bloque blanco. Por eso la imagen
 * mide 600 y no 560, y por eso su celda va sin padding.
 *
 * El `font-size:0;line-height:0` de esa celda no es decorativo: una imagen en
 * bloque adentro de un `<td>` hereda el interlineado del texto y varios clientes
 * le dejan tres o cuatro píxeles de aire abajo. Contra un bloque blanco no se
 * nota; contra el navy de la banda es una franja clara cruzando la firma.
 */
function banda(d: DatosFirma, t: Tono) {
  const tira =
    `<img src="${CDN}${BANDA}" alt="Partners de Accedra" width="${BANDA_ANCHO}" height="${BANDA_ALTO}" ` +
    `style="display:block;width:${BANDA_ANCHO}px;height:${BANDA_ALTO}px;border:0;">`
  return (
    TABLA +
    `<tr><td style="padding:0;">${envolver(cabeceraClasica(d, t), t)}</td></tr>` +
    `<tr><td style="padding:0;font-size:0;line-height:0;">${tira}</td></tr>` +
    `</table>`
  )
}

/**
 * Los mismos números con los que se arma el HTML, para que el PNG no invente
 * los suyos.
 *
 * El PNG se dibuja con Satori, que no entiende tablas y compone con flexbox: es
 * obligatoriamente una segunda escritura del mismo diseño. Que las medidas
 * salgan de acá es lo único que evita que las dos versiones se separen con el
 * tiempo sin que nadie se dé cuenta.
 */
export const GEOMETRIA = {
  ancho: ANCHO,
  gutter: GUTTER,
  airePartners: AIRE_PARTNERS,
  altoPartners: ALTO_PARTNERS,
  banda: BANDA,
  bandaAncho: BANDA_ANCHO,
  bandaAlto: BANDA_ALTO,
  icono: ICONO,
  aireIconos: AIRE_ICONOS,
  aireEnlaces: AIRE_ENLACES,
  lockupAncho: WORDMARK_MAX,
  lockupRatio: LOCKUP_RATIO,
} as const

export function firmaHtml(datos: DatosFirma, modelo: ModeloFirma, tono: Tono = "claro", base = CDN) {
  const html =
    modelo === "clasica"
      ? clasica(datos, tono)
      : modelo === "banda"
        ? banda(datos, tono)
        : completa(datos, tono)
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
