/**
 * Las placas tipográficas del feed, renderizadas por código.
 *
 * Es la Fase 1 de sacarle al generador de imágenes el trabajo en el que es malo.
 * Un modelo de imágenes no compone: dibuja píxeles que se parecen a lo pedido.
 * Acá el titular se compone con el archivo de la fuente, en la coordenada exacta,
 * y sale idéntico todas las veces.
 *
 * "Idéntico" NO quiere decir que todas las piezas se vean iguales. Lo que se fija
 * es el esqueleto —la fuente, el peso, los márgenes, el rincón del logo—, que es
 * justamente lo que una marca necesita repetir. Lo que varía es el LAYOUT, y
 * varía por decisión y no por suerte: cada composición de acá abajo ubica el
 * texto en otro lado, y `secuencia.ts` ya sabe repartirlas para que dos vecinas
 * en la grilla de Instagram nunca compartan la misma.
 *
 * Cubre las piezas que NO llevan foto (la familia editorial). Las que llevan foto
 * son la Fase 2: el modelo genera solo la fotografía y este mismo módulo le
 * compone el texto encima, con estas mismas composiciones.
 */

import { ImageResponse } from "next/og"

import { plano, tramoAzul } from "@/lib/copy-headline"
import { soloLogo } from "@/lib/logo-pieza"
import { fuentes } from "@/lib/placa/fuentes"
import {
  AZUL_SOBRE_OSCURO,
  EYEBROW,
  FAMILIA,
  FONDO,
  INTERLINEADO,
  ITEM,
  MEDIDAS,
  SEPARACION,
  TEXTO,
  TITULAR,
  TRACKING_TITULAR,
  BAJADA,
  composicionDeTexto,
  type Formato,
} from "@/lib/placa/sistema"

/**
 * Dónde se para el texto.
 *
 * No son variantes decorativas: cada una sirve a un tipo de contenido distinto,
 * igual que los quince templates del prompt sirven a quince situaciones.
 */
/**
 * Las tres variantes. Cambia SOLO qué va debajo del titular.
 *
 * La columna, la banda y el cuerpo del titular son los mismos en las tres: eso
 * es lo que hace que el feed se lea como una marca y no como tres plantillas.
 *
 * Había una cuarta, "cifra", que dibujaba el número a 260px. Se sacó el 18/8: a
 * ese tamaño la cifra se desbordaba de la columna y se metía en la mitad
 * derecha, encima del sujeto de la foto. Era un layout distinto disfrazado de
 * variante. Los números ahora se dicen DENTRO del titular —los patrones
 * "escala-como-prueba" y "antes-despues" de `copy-headline.ts` existen para
 * eso— y de paso desaparece para siempre la clase de defecto del "<1" gigante:
 * lo que no se dibuja aparte no se puede descontrolar.
 */
export type Layout =
  /** Titular y nada más. */
  | "solo"
  /** Titular + una o dos frases que lo desarrollan. */
  | "bajada"
  /** Titular + una lista de hasta cuatro ítems. */
  | "bullets"
  /**
   * Titular centrado arriba, a todo el ancho, con la foto abajo.
   *
   * Es el único que NO usa la columna izquierda: acá el sujeto vive en la mitad
   * inferior y el texto le deja el cuadro entero. Por eso el velo va vertical
   * —de arriba hacia abajo— y no de izquierda a derecha como en los otros tres.
   */
  | "centrado"

export type PlacaTipografica = {
  layout?: Layout
  /**
   * El fondo, como data URI: la fotografía o el gráfico que generó el modelo.
   *
   * No es opcional en la práctica. Se dejó opcional en el tipo porque el
   * renderizador tiene que poder devolver algo si la generación falla, pero una
   * placa sin fondo sale con el campo plano, que es exactamente el defecto que la
   * referencia de marca prohíbe.
   */
  fondo?: string
  /**
   * De qué familia salió el fondo. Decide cuánto ancho puede usar el texto: con
   * foto hay un sujeto que no se tapa, en editorial no.
   */
  familia?: string
  /** El rótulo chico de arriba. Vacío o ausente: la placa no lleva ninguno. */
  eyebrow?: string
  /** El titular, ya cortado en las líneas con las que se imprime. */
  titular: string[]
  /** Las palabras del titular que van en azul. Tienen que estar en el titular. */
  destacado?: string
  /** El bloque secundario. Una línea por ítem. Solo lo usa el layout "alto". */
  items?: string[]
  /**
   * La bajada: desarrolla el titular en una o dos frases.
   *
   * Ocupa la MISMA banda que los ítems (0.56 → 0.76), no un lugar propio: son dos
   * formas de llenar el mismo hueco y nunca conviven. La pieza que no tiene qué
   * enumerar tiene igual algo que decir.
   */
  bajada?: string
  /**
   * El llamado a la acción, debajo del titular.
   *
   * No es un adorno: en la referencia de marca es lo que ocupa el hueco entre el
   * titular y el gráfico en las piezas editoriales. Sin él la pieza queda con un
   * tercio del cuadro vacío, que es el defecto que el propio sistema llama
   * "dead zone".
   */
  cta?: string
  formato?: Formato
  /**
   * Qué línea manda.
   *
   * "primera" agranda la primera línea del titular. Existe porque una placa de
   * principios —"Nunca confiar / Siempre verificar / Mínimo privilegio"— tiene
   * una jerarquía real entre sus líneas, y el sistema del prompt no la podía
   * expresar: allá el titular es un bloque de un solo cuerpo.
   */
  enfasis?: "ninguno" | "primera"
}

/* ── El destacado ─────────────────────────────────────────────────────────── */

type Tramo = { texto: string; azul: boolean }

/**
 * Parte el titular ENTERO en tramos de color, línea por línea.
 *
 * Dos cosas pasan acá, y ninguna es evidente.
 *
 * La primera: la posición del azul se calcula UNA vez sobre el titular unido y
 * después se reparte por línea. Buscándolo línea por línea el azul desaparecía
 * sin aviso, porque `armarTitular` reparte el titular en las líneas que mejor
 * entran y casi nunca son las que mandó el modelo: un destacado como "al que ya
 * está adentro." quedaba partido entre la línea 2 y la 3 y no coincidía entero
 * en ninguna.
 *
 * La segunda: el texto que se imprime es SIEMPRE el del titular. El destacado
 * solo decide dónde cae el color, así que un azul mal ubicado no puede deformar
 * ni perder una palabra.
 */
export function tramosDeLineas(lineas: string[], destacado?: string): Tramo[][] {
  const unido = lineas.join(" ")

  // `tramoAzul` es la garantía: devuelve el tramo que propuso el modelo si se
  // puede ubicar en el titular —tolerando tildes perdidas y recortes— y el
  // remate calculado si no. Antes acá se devolvía todo blanco cuando el
  // destacado no coincidía, que es como salían las piezas sin una sola palabra
  // en azul.
  const azul = tramoAzul(unido, destacado)
  if (!azul) return lineas.map((l) => [{ texto: l, azul: false }])

  const desde = plano(unido).indexOf(plano(azul))
  if (desde === -1) return lineas.map((l) => [{ texto: l, azul: false }])
  const hasta = desde + azul.length

  let cursor = 0
  return lineas.map((linea) => {
    const ini = cursor
    const fin = ini + linea.length
    cursor = fin + 1 // el espacio con el que se unieron las líneas

    const a = Math.max(desde, ini)
    const b = Math.min(hasta, fin)
    if (b <= a) return [{ texto: linea, azul: false }]

    const tramos: Tramo[] = []
    if (a > ini) tramos.push({ texto: linea.slice(0, a - ini), azul: false })
    tramos.push({ texto: linea.slice(a - ini, b - ini), azul: true })
    if (b < fin) tramos.push({ texto: linea.slice(b - ini), azul: false })
    return tramos
  })
}

function Titular({
  lineas,
  destacado,
  cuerpo,
  escalas,
  centrado,
}: {
  lineas: string[]
  destacado?: string
  cuerpo: number
  escalas: number[]
  centrado?: boolean
}) {
  // El reparto del color se calcula una sola vez sobre el titular entero: es lo
  // que permite que el azul cruce un salto de línea.
  const porLinea = tramosDeLineas(lineas, destacado)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: centrado ? "center" : "flex-start",
      }}
    >
      {lineas.map((linea, i) => {
        const px = Math.round(cuerpo * escalas[i])
        return (
          <div
            key={i}
            style={{
              display: "flex",
              // El cálculo de encaje garantiza que entra en una línea; nowrap
              // convierte cualquier error residual en un desborde visible en vez
              // de un salto de línea silencioso que se come el rincón del logo.
              whiteSpace: "nowrap",
              fontFamily: FAMILIA,
              fontSize: px,
              fontWeight: 700,
              letterSpacing: TRACKING_TITULAR * px,
              lineHeight: INTERLINEADO,
              color: TITULAR,
            }}
          >
            {porLinea[i].map((t, j) => (
              // `pre` y no el default: Satori recorta los espacios al borde de
              // cada span, y el titular partido en tramos de color perdía el
              // espacio entre ellos — "sostiene tu" salía "sostienetu".
              <span
                key={j}
                style={{ whiteSpace: "pre", color: t.azul ? AZUL_SOBRE_OSCURO : TITULAR }}
              >
                {t.texto}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ── El layout ────────────────────────────────────────────────────────────── */

function Placa({ placa, ancho, alto }: { placa: PlacaTipografica; ancho: number; alto: number }) {
  const layout = placa.layout ?? "solo"
  const centrado = layout === "centrado"
  const familia = placa.familia ?? "tecnologia"
  const items = placa.items ?? []

  // Cuántos ítems entran y a qué cuerpo sale el titular: la cuenta vive en
  // `sistema.ts` porque la comparte con la revisión de la pieza. Ver ahí por qué
  // el titular puede quedarse con el lugar del cuarto ítem.
  const { visibles, geometria, lineas, escalas, cuerpo } = composicionDeTexto({
    formato: placa.formato ?? "square",
    titular: placa.titular,
    layout,
    familia,
    items: items.length,
    bajada: Boolean(placa.bajada),
    eyebrow: Boolean(placa.eyebrow),
    enfasisPrimera: placa.enfasis === "primera",
    avisar: true,
  })

  const itemsVisibles = layout === "bullets" ? items.slice(0, visibles) : items
  const { margen, util, bandaDesde, bandaAlto, separacionBloque } = geometria

  return (
    <div
      style={{
        width: ancho,
        height: alto,
        display: "flex",
        position: "relative",
        backgroundColor: FONDO,
      }}
    >
      {placa.fondo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori no usa next/image */}
          <img
            src={placa.fondo}
            width={ancho}
            height={alto}
            style={{ position: "absolute", left: 0, top: 0 }}
            alt=""
          />
          {/*
            El velo sobre la zona de tipografía. El fondo ya viene con su propio
            degradé pedido en el prompt, pero el generador lo cumple con holgura
            variable y el titular es blanco: esta capa es la garantía, no el
            efecto.
          */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              // 180deg en centrado: el texto está ARRIBA y el sujeto abajo, así
              // que el velo tiene que caer de arriba hacia abajo. Con el de 100
              // grados —pensado para la columna izquierda— la mitad derecha del
              // titular quedaba sobre la foto sin protección.
              backgroundImage: centrado
                ? "linear-gradient(180deg, rgba(10,20,36,0.94) 0%, rgba(10,20,36,0.86) 26%, rgba(10,20,36,0.44) 44%, rgba(10,20,36,0.08) 60%, rgba(10,20,36,0) 72%)"
                : placa.familia === "editorial"
                  ? "linear-gradient(100deg, rgba(10,20,36,0.72) 0%, rgba(10,20,36,0.42) 40%, rgba(10,20,36,0.10) 70%, rgba(10,20,36,0) 88%)"
                  : "linear-gradient(100deg, rgba(10,20,36,0.90) 0%, rgba(10,20,36,0.74) 30%, rgba(10,20,36,0.34) 52%, rgba(10,20,36,0.06) 72%, rgba(10,20,36,0) 84%)",
            }}
          />
          {/* Y la banda del logo, que va oscura sí o sí. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              backgroundImage:
                "linear-gradient(0deg, rgba(10,20,36,0.80) 0%, rgba(10,20,36,0.32) 16%, rgba(10,20,36,0) 30%)",
            }}
          />
        </>
      ) : null}

      {/*
        UN SOLO GRUPO: rótulo, titular y bloque viajan juntos y se centran en la
        banda.

        Antes cada pieza tenía su coordenada fija —el rótulo al 6%, el titular al
        13%, el bloque al 56%— y el aire sobrante se acumulaba entero en el medio:
        con un titular de tres líneas quedaba un agujero del 19% entre el titular
        y la bajada. Agrupados y centrados, ese aire se reparte arriba y abajo y
        se lee como respiro en vez de como una pieza a medio armar.
      */}
      <div
        style={{
          position: "absolute",
          left: margen,
          top: bandaDesde,
          width: util,
          height: bandaAlto,
          display: "flex",
          flexDirection: "column",
          // Centrado arranca pegado arriba —la foto necesita la mitad de abajo
          // entera— y los otros tres reparten el aire en la columna.
          justifyContent: centrado ? "flex-start" : "center",
          alignItems: centrado ? "center" : "flex-start",
          textAlign: centrado ? "center" : "left",
        }}
      >
        {placa.eyebrow ? (
          <div
            style={{
              display: "flex",
              marginBottom: Math.round(EYEBROW.cuerpo * SEPARACION.eyebrow),
              fontFamily: FAMILIA,
              fontSize: EYEBROW.cuerpo,
              fontWeight: EYEBROW.peso,
              letterSpacing: EYEBROW.tracking * EYEBROW.cuerpo,
              textTransform: "uppercase",
              color: AZUL_SOBRE_OSCURO,
            }}
          >
            {placa.eyebrow}
          </div>
        ) : null}

        <div style={{ display: "flex" }}>
          <Titular
            lineas={lineas}
            destacado={placa.destacado}
            cuerpo={cuerpo}
            escalas={escalas}
            centrado={centrado}
          />
        </div>

        {layout === "bajada" && placa.bajada ? (
          <div
            style={{
              display: "flex",
              marginTop: separacionBloque,
              fontFamily: FAMILIA,
              fontSize: BAJADA.cuerpo,
              fontWeight: BAJADA.peso,
              lineHeight: BAJADA.interlineado,
              color: TEXTO,
            }}
          >
            {placa.bajada}
          </div>
        ) : null}

        {layout === "bullets" && itemsVisibles.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: separacionBloque,
            }}
          >
            {itemsVisibles.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: i === 0 ? 0 : Math.round(ITEM.cuerpo * SEPARACION.item),
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 2,
                    marginRight: 22,
                    display: "flex",
                    backgroundColor: AZUL_SOBRE_OSCURO,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontFamily: FAMILIA,
                    fontSize: ITEM.cuerpo,
                    fontWeight: ITEM.peso,
                    color: TEXTO,
                  }}
                >
                  {item}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )

}

/* ── El render ────────────────────────────────────────────────────────────── */

/**
 * Devuelve el JPEG final, con el logotipo oficial ya compuesto.
 *
 * No pasa por `conLogo` sino por `soloLogo`: la detección de marco solo puede
 * equivocarse sobre una placa que sabemos que salió a medida y sin marco, y un
 * titular blanco sobre fondo plano es exactamente la forma que esa detección lee
 * como escalón.
 */
export async function renderizarPlaca(placa: PlacaTipografica): Promise<Buffer> {
  const { ancho, alto } = MEDIDAS[placa.formato ?? "square"]

  const respuesta = new ImageResponse(<Placa placa={placa} ancho={ancho} alto={alto} />, {
    width: ancho,
    height: alto,
    fonts: await fuentes(),
  })

  return await soloLogo(Buffer.from(await respuesta.arrayBuffer()))
}
