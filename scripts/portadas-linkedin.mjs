/**
 * Genera las portadas de LinkedIn del equipo desde `src/lib/brand-portadas.ts`.
 *
 *   node scripts/portadas-linkedin.mjs                    los tres modelos
 *   node scripts/portadas-linkedin.mjs --modelo=trazado   uno solo
 *   node scripts/portadas-linkedin.mjs --motor=openrouter  por OpenRouter
 *
 * Escribe en `public/brand/portada-linkedin-<id>.jpg`, con el titular y el
 * logotipo oficial compuestos, al doble de la medida oficial: ver
 * `ESCALA_PORTADA`.
 *
 * Es un script y no una ruta de la app a propósito: estas tres imágenes se
 * generan una vez, se miran, y recién ahí se congelan en el repo. Una portada de
 * perfil no se regenera por pieza como un post — la sube una persona a su perfil
 * y queda ahí durante años, así que tiene que ser un archivo versionado y no
 * algo que salga distinto cada vez que alguien abre el Brand Kit.
 *
 * Ni el logotipo ni el titular los dibuja el generador, por lo mismo que en el
 * resto del sistema: un modelo dibuja de memoria una marca que no conoce y
 * escribe con la tipografía que se le ocurre, y sale distinto en cada una de las
 * tres. Los dos se componen acá —el logo desde el SVG oficial, el texto desde
 * `MENSAJE_PORTADA` con las tipografías de la marca— y por eso el prompt les
 * reserva el lugar: la esquina para uno, el 60% izquierdo para el otro.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { registerHooks } from "node:module"

import sharp from "sharp"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "..")

// ── Poder leer el módulo de la app sin compilarlo ───────────────────────────
// Node 22 ya despoja los tipos de un `.ts` solo, pero no sabe nada del alias
// `@/` de tsconfig. Doce líneas de hook evitan la alternativa, que era escribir
// los prompts dos veces —acá y en la app— y verlos divergir en el primer cambio
// de color.
registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith("@/")) {
      const archivo = resolve(RAIZ, "src", especificador.slice(2)) + ".ts"
      return { url: pathToFileURL(archivo).href, shortCircuit: true }
    }
    return siguiente(especificador, contexto)
  },
})

// ── .env.local ──────────────────────────────────────────────────────────────
// Las claves viven ahí y no en el ambiente del shell. Se lee a mano para no
// sumarle una dependencia al proyecto por dos variables.
for (const linea of (await readFile(resolve(RAIZ, ".env.local"), "utf8")).split("\n")) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
}

const { PORTADAS_LINKEDIN, promptPortada, MEDIDA_PORTADA, MENSAJE_PORTADA, ESCALA_PORTADA } =
  await import("@/lib/brand-portadas")
const { PALETA } = await import("@/lib/brand-kit")

/** Un color de la paleta por nombre, como en el módulo de portadas. */
const hex = (nombre) => PALETA.find((c) => c.nombre === nombre).hex

// ── Generadores ─────────────────────────────────────────────────────────────

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/images"
const OPENROUTER_MODEL = process.env.OPENROUTER_IMAGE_MODEL || "openai/gpt-image-2"

/**
 * Qué relación de aspecto pedir, en orden de preferencia.
 *
 * 4:1 es la medida real de la portada; si el modelo la acepta, la composición
 * sale pensada para la banda que se publica. Los otros dos son cada vez menos
 * anchos y hay que recortarles arriba y abajo, que es justamente donde el prompt
 * pide que no viva nada importante. Por eso el orden importa y por eso se
 * reintenta en vez de fijar uno: la lista de aspectos de estos modelos cambia.
 */
const ASPECTOS = ["4:1", "21:9", "16:9"]

async function generarConGemini(prompt, aspecto) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: "text", text: prompt }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: aspecto,
        image_size: "2K",
      },
    }),
  })

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const cuerpo = await res.json()
  for (const paso of cuerpo.steps ?? []) {
    for (const bloque of [...(paso.content ?? []), ...(paso.model_output ?? [])]) {
      if (bloque.type === "image" && bloque.data) return Buffer.from(bloque.data, "base64")
    }
  }
  if (cuerpo.output_image?.data) return Buffer.from(cuerpo.output_image.data, "base64")

  // Un 200 sin imagen casi siempre trae el motivo escrito. Tirarlo dejaba
  // "respondió sin imagen", que no se diagnostica.
  const texto = (cuerpo.steps ?? [])
    .flatMap((p) => [...(p.content ?? []), ...(p.model_output ?? [])])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .slice(0, 400)
  throw new Error(`Gemini devolvió 200 sin imagen${texto ? `: ${texto}` : ""}`)
}

async function generarConOpenRouter(prompt, aspecto) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, prompt, aspect_ratio: aspecto, n: 1 }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const cuerpo = await res.json()
  const b64 = cuerpo.data?.[0]?.b64_json
  if (!b64) throw new Error("OpenRouter devolvió 200 sin imagen")
  return Buffer.from(b64, "base64")
}

/** Prueba los aspectos de mayor a menor hasta que uno entre. */
async function generar(prompt, motor) {
  const fn = motor === "openrouter" ? generarConOpenRouter : generarConGemini
  let ultimo
  for (const aspecto of ASPECTOS) {
    try {
      const bytes = await fn(prompt, aspecto)
      return { bytes, aspecto }
    } catch (err) {
      ultimo = err
      // Un 400 es "ese aspecto no existe en este modelo" y se sigue probando.
      // Cualquier otra cosa —401, 402, 429— no mejora con un aspecto distinto.
      if (!/\b400\b/.test(String(err.message))) throw err
      console.log(`      ${aspecto} no aceptado, probando el siguiente`)
    }
  }
  throw ultimo
}

// ── Tipografías ─────────────────────────────────────────────────────────────
// El titular se compone con las fuentes reales de la marca, y para eso Pango
// necesita archivos .ttf: no alcanza con nombrarlas. No van al repo —son 300 KB
// cada una y ya viven en Google Fonts— así que se bajan la primera vez y quedan
// cacheadas en `scripts/.fuentes/`, que está en .gitignore.
//
// La URL de cada archivo no se escribe a mano porque es un hash que Google rota:
// se pide el CSS con un user-agent viejo, que es lo que hace que devuelva TTF en
// vez de WOFF2, y de ahí salen las cuatro URLs del día.

const DIR_FUENTES = resolve(AQUI, ".fuentes")

/**
 * `estilo` no es decorativo: Pango elige el peso por el NOMBRE que se le pasa,
 * no por el archivo. Pedirle "Space Grotesk 44" teniendo cargado el .ttf de la
 * Bold devuelve igual una grotesca regular cualquiera — hay que decirle "Space
 * Grotesk Bold 44". Es el error que sale silencioso: la portada se genera bien,
 * solo que con otra tipografía.
 */
const FUENTES = {
  titulo: {
    familia: "Space Grotesk",
    estilo: "Bold",
    peso: 700,
    archivo: "SpaceGrotesk-Bold.ttf",
  },
  cifras: { familia: "Inter", estilo: "Semibold", peso: 600, archivo: "Inter-SemiBold.ttf" },
}

async function asegurarFuentes() {
  await mkdir(DIR_FUENTES, { recursive: true })

  // fontconfig no viene configurado en macOS y sin esto sharp escupe un
  // "Cannot load default config file" por cada línea de texto. El archivo no
  // hace falta para encontrar las fuentes —cada render pasa su .ttf por ruta
  // absoluta— pero sí para que fontconfig arranque callado.
  const conf = resolve(DIR_FUENTES, "fonts.conf")
  await writeFile(
    conf,
    `<?xml version="1.0"?>\n<fontconfig><dir>${DIR_FUENTES}</dir><cachedir>${resolve(DIR_FUENTES, "cache")}</cachedir></fontconfig>\n`,
  )
  process.env.FONTCONFIG_FILE = conf

  const faltan = Object.values(FUENTES).filter(
    (f) => !existsSync(resolve(DIR_FUENTES, f.archivo)),
  )
  if (!faltan.length) return

  const familias = faltan
    .map((f) => `family=${f.familia.replace(/ /g, "+")}:wght@${f.peso}`)
    .join("&")
  const css = await fetch(`https://fonts.googleapis.com/css2?${familias}`, {
    headers: { "user-agent": "Mozilla/4.0" },
  }).then((r) => r.text())

  for (const f of faltan) {
    // El CSS trae un @font-face por peso; se busca el bloque de esta familia y
    // este peso, y de ahí la URL del .ttf.
    const bloque = css
      .split("@font-face")
      .find((b) => b.includes(`'${f.familia}'`) && b.includes(`font-weight: ${f.peso}`))
    const url = bloque?.match(/url\((https:[^)]+\.ttf)\)/)?.[1]
    if (!url) throw new Error(`No salió la URL de ${f.familia} ${f.peso} en Google Fonts`)
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
    await writeFile(resolve(DIR_FUENTES, f.archivo), bytes)
    console.log(`   bajada ${f.archivo} (${Math.round(bytes.length / 1024)} KB)`)
  }
}

/**
 * Un bloque de texto ya rasterizado, con su ancho y su alto.
 *
 * `dpi: 72` es lo que hace que el número de la fuente sea directamente el tamaño
 * en píxeles; con el default de Pango habría que multiplicar por 96/72 en cada
 * medida y ninguna cuenta de esta sección cerraría a ojo. El tracking va en
 * milésimos de punto, que es la unidad de Pango, así que se pasa en `em` —como
 * lo escribe el brand kit— y se convierte acá.
 */
async function texto({ markup, fuente, px, color, tracking = 0, interlinea = 0, extra = "" }) {
  const bytes = await sharp({
    text: {
      text: `<span foreground="${color}" letter_spacing="${Math.round(tracking * px * 1024)}" ${extra}>${markup}</span>`,
      font: `${fuente.familia} ${fuente.estilo} ${px}`,
      fontfile: resolve(DIR_FUENTES, fuente.archivo),
      rgba: true,
      dpi: 72,
      align: "left",
      spacing: interlinea,
    },
  })
    .png()
    .toBuffer()
  const { width, height } = await sharp(bytes).metadata()
  return { bytes, ancho: width, alto: height }
}

// ── Composición ─────────────────────────────────────────────────────────────

const LOGO = "public/brand/accedra-logo-blanco.svg"
const RATIO_LOGO = 1073 / 160

/**
 * El logotipo va abajo a la DERECHA, al revés que en las piezas del feed.
 *
 * En el feed vive abajo a la izquierda cerrando la columna de texto. Acá esa
 * esquina la tapa la foto de perfil de la persona, así que el logo se cruza a la
 * opuesta — que es, además, la única esquina que LinkedIn no toca nunca.
 */
const ANCHO_LOGO = 0.13 // del ancho de la portada: 206 px, muy por encima del mínimo de 120
const MARGEN_X = 0.055 // del ancho
const MARGEN_Y = 0.2 // del alto, para no caer en el 10% inferior que se recorta

/**
 * Dónde arranca el titular: 28,3% del ancho, o sea 448 px.
 *
 * Es el primer píxel después de la zona de la foto de perfil (26%) más un
 * respiro. Más a la izquierda, la cabeza de la persona le come la primera letra
 * a la palabra "Infraestructura".
 */
const X_TEXTO = 0.283

/**
 * Todo lo que se mide en píxeles va multiplicado por `ESCALA_PORTADA`.
 *
 * Es la mitad del trabajo de entregar a 2×: si sólo se agranda el lienzo, el
 * titular de 44 px queda ocupando la mitad del ancho relativo que ocupaba y la
 * portada sale con la letra chica. Los números de acá abajo son los de la
 * medida NOMINAL —lo que se diseñó sobre 1584 × 396— y `escalar()` los lleva
 * al archivo real. El tracking no aparece: va en `em`, así que escala solo.
 */
const escalar = (n) => Math.round(n * ESCALA_PORTADA)

const PX_TITULO = escalar(44) // dos líneas de 44 son ~100 de los 396: el máximo que entra sin ahogar
const PX_CIFRAS = escalar(15) // LinkedIn muestra la portada a ~1128, así que 15 acá se ven 11 allá
const AIRE = escalar(26) // entre el titular, la regla y las cifras
const ANCHO_REGLA = escalar(120)
const INTERLINEA = escalar(8)

/**
 * El velo oscuro sobre la mitad izquierda.
 *
 * El prompt ya pide que ese lado venga vacío, pero un generador de imágenes no
 * cumple una instrucción espacial las tres de tres veces, y una portada con el
 * titular ilegible es basura. Diez líneas de degradado hacen que el texto se lea
 * sí o sí, y de paso es exactamente el recurso del hero del sitio: foto entera,
 * velo, texto encima. Termina en 86% y no en 100% para que la foto no quede
 * lavada de punta a punta.
 */
function velo(ancho, alto) {
  const navy = hex("Navy fondo")
  return Buffer.from(
    `<svg width="${ancho}" height="${alto}"><defs><linearGradient id="v" x1="0" x2="1">` +
      `<stop offset="0" stop-color="${navy}" stop-opacity="0.95"/>` +
      `<stop offset="0.50" stop-color="${navy}" stop-opacity="0.90"/>` +
      `<stop offset="0.68" stop-color="${navy}" stop-opacity="0.55"/>` +
      `<stop offset="0.86" stop-color="${navy}" stop-opacity="0"/>` +
      `</linearGradient></defs><rect width="${ancho}" height="${alto}" fill="url(#v)"/></svg>`,
  )
}

/**
 * El mismo seguro, para la esquina del logotipo.
 *
 * El prompt le pide al modelo que deje esa esquina oscura y a veces igual apoya
 * ahí un piso iluminado o —el caso que se vio tres veces en la portada del
 * trazado— una placa blanca con letras inventadas. El logo es blanco: encima de
 * eso desaparece. Un radial suave anclado en el vértice lo cubre sin que se note
 * un recuadro, porque cae a cero mucho antes que el dibujo.
 */
function veloEsquina(ancho, alto) {
  const navy = hex("Navy fondo")
  const r = Math.round(ancho * 0.26)
  return Buffer.from(
    `<svg width="${ancho}" height="${alto}"><defs>` +
      `<radialGradient id="e" cx="${ancho}" cy="${alto}" r="${r}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${navy}" stop-opacity="0.97"/>` +
      `<stop offset="0.55" stop-color="${navy}" stop-opacity="0.80"/>` +
      `<stop offset="1" stop-color="${navy}" stop-opacity="0"/>` +
      `</radialGradient></defs><rect width="${ancho}" height="${alto}" fill="url(#e)"/></svg>`,
  )
}

/** Escapa lo que Pango lee como markup. El texto es nuestro, pero igual. */
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * El titular, con el destacado en degradado.
 *
 * Pango no sabe rellenar texto con un degradado: pinta de un color plano y
 * nada más. Así que se rasteriza dos veces el MISMO bloque —mismas líneas,
 * misma fuente, mismo tracking, con lo cual salen dos PNG idénticos en tamaño y
 * alineados al píxel— una en blanco y otra con todo invisible salvo el
 * destacado. La segunda es la máscara: se recorta el degradado con ella y se
 * apoya encima de la blanca, justo sobre las palabras que ya estaban ahí.
 *
 * El `alpha="1"` no es cero, es un 1 sobre 65535. Alcanza: la capa sólo se usa
 * como máscara y ese resto es invisible.
 */
async function titular(x, y) {
  const { lineas, destacada, degradado } = MENSAJE_PORTADA
  const comun = { fuente: FUENTES.titulo, px: PX_TITULO, tracking: -0.02, interlinea: INTERLINEA }

  const marcar = (attr) => (linea) =>
    esc(linea).split(esc(destacada)).join(`<span ${attr}>${esc(destacada)}</span>`)

  const blanco = await texto({
    ...comun,
    color: "#FFFFFF",
    markup: lineas.map(marcar('foreground="#FFFFFF"')).join("\n"),
  })
  const mascara = await texto({
    ...comun,
    color: "#FFFFFF",
    extra: 'alpha="1"',
    markup: lineas.map(marcar('alpha="65535"')).join("\n"),
  })

  // La rampa tiene que medir lo que miden las palabras destacadas, no lo que
  // mide el bloque entero: si se estira sobre los 560 px del titular, para
  // cuando llega a "para" ya va por la mitad del degradado y el blanco del
  // arranque no se ve nunca. Recortar la máscara da esa caja exacta y de paso
  // dónde apoyarla. En 8 bits el `alpha="1"` del resto es cero, así que lo que
  // queda después del recorte son sólo las palabras.
  const { data: recorte, info } = await sharp(mascara.bytes)
    .trim({ threshold: 0 })
    .toBuffer({ resolveWithObject: true })
  const dx = -(info.trimOffsetLeft ?? 0)
  const dy = -(info.trimOffsetTop ?? 0)

  // Horizontal, no a 120° como el CSS del sitio: acá la caja son dos palabras de
  // 40 px de alto, y con la inclinación la esquina de abajo a la izquierda —la
  // "p" de "para"— ya arranca a un cuarto de la rampa y no llega blanca nunca.
  const paradas = degradado
    .map((p) => `<stop offset="${p.en}" stop-color="${p.color}"/>`)
    .join("")
  const rampa = Buffer.from(
    `<svg width="${info.width}" height="${info.height}"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="0">${paradas}</linearGradient>` +
      `</defs><rect width="${info.width}" height="${info.height}" fill="url(#g)"/></svg>`,
  )
  const destacadoPintado = await sharp(rampa)
    .composite([{ input: recorte, blend: "dest-in" }])
    .png()
    .toBuffer()

  return {
    alto: blanco.alto,
    capas: [
      { input: blanco.bytes, top: y, left: x },
      { input: destacadoPintado, top: y + dy, left: x + dx },
    ],
  }
}

/**
 * La línea de cifras: el número en la display y la etiqueta en la de texto.
 *
 * Es como las arma el hero del sitio, donde el número va en `font-display` y el
 * label en Inter. Hay que rasterizar cada pedazo por separado porque el motor de
 * texto de sharp toma UN archivo de fuente por render: un `<span face="...">` en
 * el medio del markup no cambia nada, se dibuja todo con el .ttf que se le pasó.
 * Es el mismo error mudo de siempre —sale una imagen prolija, con la tipografía
 * equivocada— así que la única forma de mezclar dos familias es medir y ubicar.
 *
 * Se alinean por abajo y no por arriba: ni los números ni las etiquetas en
 * versalita tienen descendentes, así que el borde inferior de cada recorte ES la
 * línea de base. Por arriba no servía — la altura de mayúscula de las dos
 * familias no es la misma y quedaban montadas.
 */
async function cifras(x, y) {
  const AIRE_LABEL = escalar(7) // entre el número y su etiqueta
  const AIRE_GRUPO = escalar(26) // entre una cifra y la siguiente

  const piezas = []
  for (const c of MENSAJE_PORTADA.cifras) {
    piezas.push(
      await texto({
        markup: esc(c.valor),
        fuente: FUENTES.titulo,
        px: PX_CIFRAS,
        color: hex("Gris texto"),
      }),
      // De cada etiqueta se toma la primera palabra: "Años de experiencia"
      // cuatro veces no entra en una línea de esta portada, y "Años" dice lo
      // mismo.
      await texto({
        markup: esc(c.label.split(" ")[0].toUpperCase()),
        fuente: FUENTES.cifras,
        px: PX_CIFRAS,
        color: hex("Gris muted"),
        tracking: 0.09, // versalita con tracking amplio, como los eyebrow del kit
      }),
    )
  }

  const alto = Math.max(...piezas.map((p) => p.alto))
  const capas = []
  let cursor = x
  piezas.forEach((pieza, i) => {
    capas.push({ input: pieza.bytes, top: y + alto - pieza.alto, left: cursor })
    cursor += pieza.ancho + (i % 2 === 0 ? AIRE_LABEL : AIRE_GRUPO)
  })

  return { alto, capas }
}

/**
 * Las capas del mensaje —titular, regla y cifras— ya ubicadas.
 *
 * El bloque entero se centra vertical: es lo único que lo mantiene parejo entre
 * las tres portadas cuando alguna línea cambia de largo.
 */
async function mensaje(ancho, alto) {
  const x = Math.round(ancho * X_TEXTO)
  const altoRegla = escalar(2)

  // Se arman en (0,0) para medirlos y después se corren: el alto del bloque no
  // se sabe hasta que las dos piezas de texto están rasterizadas.
  const arriba = await titular(x, 0)
  const abajo = await cifras(x, 0)

  const total = arriba.alto + AIRE + altoRegla + AIRE + abajo.alto
  const y = Math.round((alto - total) / 2)
  const yRegla = y + arriba.alto + AIRE
  const yCifras = yRegla + altoRegla + AIRE

  const regla = Buffer.from(
    `<svg width="${ANCHO_REGLA}" height="${altoRegla}"><rect width="${ANCHO_REGLA}" height="${altoRegla}" fill="${hex("Azul Accedra")}"/></svg>`,
  )

  return [
    ...arriba.capas.map((c) => ({ ...c, top: c.top + y })),
    { input: regla, top: yRegla, left: x },
    ...abajo.capas.map((c) => ({ ...c, top: c.top + yCifras })),
  ]
}

async function terminar(bytes) {
  const ancho = MEDIDA_PORTADA.ancho * ESCALA_PORTADA
  const alto = MEDIDA_PORTADA.alto * ESCALA_PORTADA

  // `cover` centrado: si el generador devolvió 21:9 o 16:9, lo que se pierde es
  // arriba y abajo, que es exactamente lo que el prompt dejó vacío.
  const arte = await sharp(bytes)
    .resize({ width: ancho, height: alto, fit: "cover", position: "centre" })
    .toBuffer()

  const anchoLogo = Math.round(ancho * ANCHO_LOGO)
  const altoLogo = Math.round(anchoLogo / RATIO_LOGO)
  const svg = await readFile(resolve(RAIZ, LOGO))
  const logo = await sharp(svg, { density: 300 })
    .resize({ width: anchoLogo, height: altoLogo, fit: "contain" })
    .png()
    .toBuffer()

  return await sharp(arte)
    .composite([
      { input: velo(ancho, alto), top: 0, left: 0 },
      { input: veloEsquina(ancho, alto), top: 0, left: 0 },
      ...(await mensaje(ancho, alto)),
      {
        input: logo,
        left: ancho - Math.round(ancho * MARGEN_X) - anchoLogo,
        top: alto - Math.round(alto * MARGEN_Y) - altoLogo,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const soloModelo = args.find((a) => a.startsWith("--modelo="))?.split("=")[1]
const motor = args.find((a) => a.startsWith("--motor="))?.split("=")[1] ?? "gemini"

const clave = motor === "openrouter" ? "OPENROUTER_API_KEY" : "GEMINI_API_KEY"
if (!process.env[clave]) {
  console.error(`Falta ${clave} en .env.local`)
  process.exit(1)
}

const modelos = soloModelo
  ? PORTADAS_LINKEDIN.filter((p) => p.id === soloModelo)
  : PORTADAS_LINKEDIN

if (!modelos.length) {
  console.error(`No existe el modelo "${soloModelo}". Hay: ${PORTADAS_LINKEDIN.map((p) => p.id).join(", ")}`)
  process.exit(1)
}

await asegurarFuentes()

console.log(
  `\nPortadas LinkedIn · ${MEDIDA_PORTADA.ancho * ESCALA_PORTADA}×${MEDIDA_PORTADA.alto * ESCALA_PORTADA}` +
    ` (${ESCALA_PORTADA}× de ${MEDIDA_PORTADA.ancho}×${MEDIDA_PORTADA.alto}) · motor ${motor}\n`,
)

for (const modelo of modelos) {
  const t0 = Date.now()
  process.stdout.write(`   ${modelo.nombre} … `)
  try {
    const { bytes, aspecto } = await generar(promptPortada(modelo), motor)
    const final = await terminar(bytes)
    const destino = resolve(RAIZ, "public", modelo.archivo.replace(/^\//, ""))
    await writeFile(destino, final)
    const kb = Math.round(final.length / 1024)
    console.log(`ok · ${aspecto} · ${kb} KB · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } catch (err) {
    console.log(`FALLÓ\n      ${err.message}`)
  }
}

console.log("")
