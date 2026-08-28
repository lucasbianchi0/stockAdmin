/**
 * Genera las portadas de LinkedIn del equipo desde `src/lib/brand-portadas.ts`.
 *
 *   node scripts/portadas-linkedin.mjs                    los tres modelos
 *   node scripts/portadas-linkedin.mjs --modelo=trazado   uno solo
 *   node scripts/portadas-linkedin.mjs --motor=openrouter  por OpenRouter
 *
 * Escribe en `public/brand/portada-linkedin-<id>.jpg`, ya en 1584 × 396 y con el
 * logotipo oficial compuesto.
 *
 * Es un script y no una ruta de la app a propósito: estas tres imágenes se
 * generan una vez, se miran, y recién ahí se congelan en el repo. Una portada de
 * perfil no se regenera por pieza como un post — la sube una persona a su perfil
 * y queda ahí durante años, así que tiene que ser un archivo versionado y no
 * algo que salga distinto cada vez que alguien abre el Brand Kit.
 *
 * El logotipo NO lo dibuja el generador, por lo mismo que en el resto del
 * sistema: un modelo dibuja de memoria una marca que no conoce y sale distinta
 * cada vez. Se compone acá, desde el SVG oficial, y por eso el prompt le reserva
 * la esquina.
 */

import { readFile, writeFile } from "node:fs/promises"
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

const { PORTADAS_LINKEDIN, promptPortada, MEDIDA_PORTADA } = await import(
  "@/lib/brand-portadas"
)

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

async function terminar(bytes) {
  const { ancho, alto } = MEDIDA_PORTADA

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

console.log(`\nPortadas LinkedIn · ${MEDIDA_PORTADA.ancho}×${MEDIDA_PORTADA.alto} · motor ${motor}\n`)

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
