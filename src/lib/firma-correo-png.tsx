/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// Las dos reglas de arriba hablan del DOM, y esto no es el DOM: Satori lee este
// JSX para dibujar un PNG. No existe `next/image` que valga —no hay navegador
// que optimice nada— y un `alt` no tendría a quién servirle, porque lo que sale
// del otro lado es una imagen plana. El `alt` de verdad está en el HTML de la
// firma, que es donde hay un lector que puede leerlo.

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ImageResponse } from "next/og"

import { EMPRESA } from "@/lib/brand-kit"
import { fuentes } from "@/lib/placa/fuentes"
import { FAMILIA } from "@/lib/placa/sistema"
import {
  GEOMETRIA as G,
  PALETA,
  type DatosFirma,
  type ModeloFirma,
  type Tono,
} from "@/lib/firma-correo"

/**
 * La firma como una sola imagen.
 *
 * Para qué, si la firma de correo ya existe en HTML: el HTML es lo que se
 * instala en Gmail y lo que conserva los links, y sigue siendo la vía principal.
 * El PNG es para los lugares donde no hay HTML que valga —WhatsApp, una
 * diapositiva, un PDF, el pie de una propuesta— y donde hoy la alternativa es
 * que alguien haga una captura de pantalla de la previa y la recorte a mano.
 *
 * NO es el reemplazo de la firma de mail. Una firma toda en imagen se cae
 * entera cuando el cliente bloquea las imágenes remotas —el default de Outlook
 * de escritorio, y lo que hace Gmail con un remitente desconocido—, no se puede
 * copiar el mail de adentro y pesa como señal de spam. Por eso el botón de
 * Copiar sigue dando el híbrido.
 *
 * Satori no entiende tablas y compone con flexbox, así que esto es
 * obligatoriamente una segunda escritura del mismo diseño. Las medidas salen de
 * `GEOMETRIA` y los colores de `PALETA`, las mismas que usa el HTML: es lo único
 * que evita que las dos versiones se separen con el tiempo.
 */

/** Satori no sale a la red: cada imagen entra como data URI. */
async function dataUri(archivo: string) {
  const bytes = await readFile(join(process.cwd(), "public", "logos", archivo))
  return `data:image/png;base64,${bytes.toString("base64")}`
}

/**
 * El alto de la columna de datos, que es la que manda en la clásica.
 *
 * Son las mismas siete líneas que arma `identidad()`, con sus mismos aires. Se
 * cuenta acá porque un PNG necesita su alto de antemano: Satori no tiene
 * "alto automático".
 */
const LINEAS = {
  nombre: 20,
  cargo: 3 + 15,
  email: 11 + 19,
  celular: 1 + 19,
  telefono: 1 + 19,
  domicilio: 8 + 17,
  pais: 1 + 17,
}

function altoDatos(d: DatosFirma) {
  let alto = LINEAS.domicilio + LINEAS.pais
  if (d.nombre.trim()) alto += LINEAS.nombre
  if (d.cargo.trim()) alto += LINEAS.cargo
  if (d.email.trim()) alto += LINEAS.email
  if (d.celular.trim()) alto += LINEAS.celular
  if (d.telefono.trim()) alto += LINEAS.telefono
  return alto
}

type Imagenes = { lockup: string; partners: string; banda: string; iconos: string[] }

/** El padding del bloque, el mismo que pone `envolver()` en el HTML. */
const PAD = 18
const PAD_LADO = 20

function Datos({ d, tono }: { d: DatosFirma; tono: Tono }) {
  const { fuerte, texto, suave, azul } = PALETA[tono]
  const base = { display: "flex", fontFamily: FAMILIA } as const

  const telefono = (etiqueta: string, valor: string, margen: number) => (
    <div style={{ ...base, marginTop: margen, fontSize: 13, lineHeight: "19px", color: texto }}>
      <span style={{ color: suave, marginRight: 4 }}>{etiqueta}</span>
      <span>{valor}</span>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {d.nombre.trim() ? (
        <div style={{ ...base, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: fuerte }}>
          {d.nombre}
        </div>
      ) : null}
      {d.cargo.trim() ? (
        <div
          style={{
            ...base,
            marginTop: 3,
            fontSize: 11,
            lineHeight: "15px",
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: suave,
          }}
        >
          {d.cargo}
        </div>
      ) : null}
      {d.email.trim() ? (
        <div style={{ ...base, marginTop: 11, fontSize: 13, lineHeight: "19px", color: azul }}>
          {d.email}
        </div>
      ) : null}
      {d.celular.trim() ? telefono("Cel.", d.celular, 1) : null}
      {d.telefono.trim() ? telefono("Tel.", d.telefono, 1) : null}
      <div style={{ ...base, marginTop: 8, fontSize: 12, lineHeight: "17px", color: suave }}>
        {EMPRESA.domicilio}
      </div>
      <div style={{ ...base, marginTop: 1, fontSize: 12, lineHeight: "17px", color: suave }}>
        Buenos Aires — Argentina
      </div>
    </div>
  )
}

function Iconos({ img }: { img: Imagenes }) {
  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      {img.iconos.map((src, i) => (
        <img
          key={src}
          src={src}
          width={G.icono}
          height={G.icono}
          style={{ marginLeft: i === 0 ? 0 : G.aireIconos }}
        />
      ))}
    </div>
  )
}

/** El lockup más, colgando, la fila de íconos: la columna de marca del HTML. */
function Marca({ ancho, img, conIconos }: { ancho: number; img: Imagenes; conIconos: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <img src={img.lockup} width={ancho} height={Math.round(ancho * G.lockupRatio)} />
      {conIconos ? (
        <div style={{ display: "flex", marginTop: G.aireEnlaces }}>
          <Iconos img={img} />
        </div>
      ) : null}
    </div>
  )
}

/** Las tres columnas —marca, regla, datos— que comparten la clásica y la banda. */
function FilaClasica({ d, tono, img }: { d: DatosFirma; tono: Tono; img: Imagenes }) {
  const regla = Math.max(altoDatos(d), 149)
  const colDatos = G.ancho - G.lockupAncho - G.gutter * 2 - 1

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", width: G.ancho }}>
      <div style={{ display: "flex", width: G.lockupAncho, marginRight: G.gutter }}>
        <Marca ancho={G.lockupAncho} img={img} conIconos />
      </div>
      <div style={{ width: 1, height: regla, backgroundColor: PALETA[tono].regla }} />
      <div style={{ display: "flex", width: colDatos, marginLeft: G.gutter }}>
        <Datos d={d} tono={tono} />
      </div>
    </div>
  )
}

function Clasica({ d, tono, img }: { d: DatosFirma; tono: Tono; img: Imagenes }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 600,
        padding: `${PAD}px ${PAD_LADO}px`,
        backgroundColor: PALETA[tono].fondo,
      }}
    >
      <FilaClasica d={d} tono={tono} img={img} />
      <img
        src={img.partners}
        width={G.ancho}
        height={G.altoPartners}
        style={{ marginTop: G.airePartners }}
      />
    </div>
  )
}

/**
 * La banda va afuera del bloque y sin padding: es de borde a borde.
 *
 * Por eso el contenedor de afuera no lleva ni fondo ni padding —los pone el
 * bloque de arriba, que es el único que los necesita— y la imagen de la banda
 * cuelga abajo con su propio ancho de 600.
 */
function Banda({ d, tono, img }: { d: DatosFirma; tono: Tono; img: Imagenes }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 600,
          padding: `${PAD}px ${PAD_LADO}px`,
          backgroundColor: PALETA[tono].fondo,
        }}
      >
        <FilaClasica d={d} tono={tono} img={img} />
      </div>
      <img src={img.banda} width={G.bandaAncho} height={G.bandaAlto} />
    </div>
  )
}

/**
 * En la completa los datos van sobre el fondo del mail, no adentro del bloque,
 * y por eso siempre se dibujan en tono claro. El PNG necesita un piso concreto
 * ahí donde el mail pone el suyo: va blanco, que es lo que ve la enorme mayoría.
 */
function Completa({ d, tono, img }: { d: DatosFirma; tono: Tono; img: Imagenes }) {
  const anchoMarca = 200

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 600,
        padding: `${PAD}px ${PAD_LADO}px 0 0`,
        backgroundColor: PALETA.claro.fondo,
      }}
    >
      <Datos d={d} tono="claro" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 16,
          width: 600,
          padding: `${PAD}px ${PAD_LADO}px`,
          backgroundColor: PALETA[tono].fondo,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: G.ancho,
          }}
        >
          <Marca ancho={anchoMarca} img={img} conIconos={false} />
          <Iconos img={img} />
        </div>
        <img
          src={img.partners}
          width={G.ancho}
          height={G.altoPartners}
          style={{ marginTop: G.airePartners }}
        />
      </div>
    </div>
  )
}

/** El alto sale de la composición, porque Satori lo exige de antemano. */
function medidas(d: DatosFirma, modelo: ModeloFirma) {
  const bloqueMarca = (anchoMarca: number, conIconos: boolean) => {
    const lock = Math.round(anchoMarca * G.lockupRatio)
    return conIconos ? lock + G.aireEnlaces + G.icono : Math.max(lock, G.icono)
  }

  const filaClasica = () => Math.max(bloqueMarca(G.lockupAncho, true), altoDatos(d), 149)

  if (modelo === "clasica") {
    return { ancho: 600, alto: PAD * 2 + filaClasica() + G.airePartners + G.altoPartners }
  }

  // La banda no suma `airePartners`: va pegada al bloque, sin aire en el medio.
  if (modelo === "banda") {
    return { ancho: 600, alto: PAD * 2 + filaClasica() + G.bandaAlto }
  }

  const bloque = PAD * 2 + bloqueMarca(200, false) + G.airePartners + G.altoPartners
  return { ancho: 600, alto: PAD + altoDatos(d) + 16 + bloque }
}

export async function firmaPng(d: DatosFirma, modelo: ModeloFirma, tono: Tono): Promise<Buffer> {
  const p = PALETA[tono]
  const img: Imagenes = {
    lockup: await dataUri(p.lockup),
    partners: await dataUri(p.partners),
    banda: await dataUri(G.banda),
    iconos: await Promise.all(
      ["web", "linkedin", "instagram"].map((n) => dataUri(`firma-icono-${n}-${p.iconos}.png`))
    ),
  }

  const { ancho, alto } = medidas(d, modelo)
  const cuerpo =
    modelo === "clasica" ? (
      <Clasica d={d} tono={tono} img={img} />
    ) : modelo === "banda" ? (
      <Banda d={d} tono={tono} img={img} />
    ) : (
      <Completa d={d} tono={tono} img={img} />
    )

  const respuesta = new ImageResponse(cuerpo, { width: ancho, height: alto, fonts: await fuentes() })
  return Buffer.from(await respuesta.arrayBuffer())
}
