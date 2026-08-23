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
  EYEBROW,
  FAMILIA,
  INTERLINEADO,
  ITEM,
  MEDIDAS,
  SEPARACION,
  TRACKING_TITULAR,
  BAJADA,
  CLARO,
  PALETAS,
  armarTitularClaro,
  composicionDeTexto,
  type Formato,
  type PaletaTema,
  type Tema,
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
  /**
   * Cuánto se corre la foto hacia abajo, solo en el tema claro.
   *
   * Existe porque el generador reserva la banda de arriba con margen variable, y
   * cuando la deja justa el sujeto queda pegado a la bajada. Ver `PlacaClara`.
   */
  bajarFoto?: number
  /**
   * Claro u oscuro. Es el MISMO sistema dado vuelta —mismas bandas, mismos
   * cuerpos, mismo rincón del logo—: lo único que cambia son los colores, el
   * color del velo y qué archivo de logo se compone.
   */
  tema?: Tema
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
  paleta,
}: {
  lineas: string[]
  destacado?: string
  cuerpo: number
  escalas: number[]
  centrado?: boolean
  paleta: PaletaTema
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
              color: paleta.titular,
            }}
          >
            {porLinea[i].map((t, j) => (
              // `pre` y no el default: Satori recorta los espacios al borde de
              // cada span, y el titular partido en tramos de color perdía el
              // espacio entre ellos — "sostiene tu" salía "sostienetu".
              <span
                key={j}
                style={{ whiteSpace: "pre", color: t.azul ? paleta.azul : paleta.titular }}
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
  const paleta = PALETAS[placa.tema ?? "oscuro"]
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
        backgroundColor: paleta.fondo,
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
              // Los mismos stops en los dos temas: lo único que cambia es de
              // qué color es la niebla que protege al texto.
              backgroundImage: centrado
                ? `linear-gradient(180deg, rgba(${paleta.velo},0.94) 0%, rgba(${paleta.velo},0.86) 26%, rgba(${paleta.velo},0.44) 44%, rgba(${paleta.velo},0.08) 60%, rgba(${paleta.velo},0) 72%)`
                : placa.familia === "editorial"
                  ? `linear-gradient(100deg, rgba(${paleta.velo},0.72) 0%, rgba(${paleta.velo},0.42) 40%, rgba(${paleta.velo},0.10) 70%, rgba(${paleta.velo},0) 88%)`
                  : `linear-gradient(100deg, rgba(${paleta.velo},0.90) 0%, rgba(${paleta.velo},0.74) 30%, rgba(${paleta.velo},0.34) 52%, rgba(${paleta.velo},0.06) 72%, rgba(${paleta.velo},0) 84%)`,
            }}
          />
          {/* Y la banda del logo, que va oscura sí o sí. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              backgroundImage: `linear-gradient(0deg, rgba(${paleta.velo},0.80) 0%, rgba(${paleta.velo},0.32) 16%, rgba(${paleta.velo},0) 30%)`,
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
              color: paleta.azul,
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
            paleta={paleta}
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
              color: paleta.texto,
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
                    backgroundColor: paleta.azul,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontFamily: FAMILIA,
                    fontSize: ITEM.cuerpo,
                    fontWeight: ITEM.peso,
                    color: paleta.texto,
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

/* ── El layout claro ──────────────────────────────────────────────────────── */

/**
 * La pieza del tema claro: apilada, no superpuesta.
 *
 * Es OTRA composición, no el mismo layout con otros colores, y esa es la
 * decisión de fondo. Los cuatro layouts de arriba apoyan el texto SOBRE la foto
 * y se defienden con un velo negro, que tapa cualquier cosa. En claro el velo
 * tiene que ser sutil para no borrar la imagen, y con un sujeto a la derecha el
 * texto y la foto pelean por el mismo lugar: se probó, y era ilegible.
 *
 * Acá nada se superpone. El logo, el titular, la bajada, el sujeto y el botón
 * viven cada uno en su franja. La foto ES la pieza —a sangre contra los cuatro
 * bordes— y viene con la banda de arriba vacía desde el propio pedido de la
 * imagen, así que el texto se apoya sobre superficie tranquila sin necesidad de
 * un panel que la corte.
 *
 * El logo NO se dibuja acá: lo compone `soloLogo` después, con el archivo navy,
 * igual que en el tema oscuro. Por eso la franja de arriba reserva su lugar.
 */
function PlacaClara({ placa, ancho, alto }: { placa: PlacaTipografica; ancho: number; alto: number }) {
  const paleta = PALETAS.claro
  const { lineas, cuerpo } = armarTitularClaro(placa.titular.join(" "))

  /*
   * Cuánto se corre la foto hacia abajo.
   *
   * El generador reserva la banda de arriba pero no siempre con el mismo margen,
   * y cuando la deja justa el sujeto queda pegado a la bajada. La franja que
   * queda descubierta muestra el fondo del contenedor, que es el MISMO hueso con
   * el que arranca la foto: no aparece ninguna juntura, y el velo de arriba —que
   * va sobre las dos— termina de igualarlas. Lo que se recorta abajo es piso.
   */
  const bajar = placa.bajarFoto ?? 0

  return (
    <div
      style={{
        width: ancho,
        height: alto,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        // Respaldo: si la foto fallara, la pieza sale sobre el hueso en vez de
        // sobre un rectángulo vacío. Con la foto puesta no se ve nunca.
        backgroundColor: paleta.fondo,
      }}
    >
      {placa.fondo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori no usa next/image */}
          <img
            src={placa.fondo}
            width={ancho}
            height={alto}
            style={{ position: "absolute", left: 0, top: bajar, objectFit: "cover" }}
            alt=""
          />

          {/*
            EL VELO DE LA BANDA DE ARRIBA. La red, no el efecto.

            El prompt reserva el 40% superior vacío y el generador lo cumple casi
            siempre. "Casi" no alcanza para un texto que se publica: en una de
            las pruebas el sujeto subió a la banda y la bajada quedó ilegible
            sobre la pantalla de un laptop.

            Es el mismo razonamiento que el velo del tema oscuro —allá el fondo
            trae su propio degradado pedido en el prompt y el velo del código es
            la garantía— traído al lado de la luz. Muy suave y desvanecido antes
            de la mitad: donde el generador cumplió no se nota, y donde no
            cumplió salva la pieza.
          */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: CLARO.velo.alto,
              display: "flex",
              backgroundImage: `linear-gradient(180deg, rgba(245,242,236,0.92) 0%, rgba(245,242,236,0.86) 42%, rgba(245,242,236,0.55) 72%, rgba(245,242,236,0) 100%)`,
            }}
          />
        </>
      ) : null}

      {/* El lugar del logo, que compone `soloLogo` después. */}
      <div style={{ display: "flex", height: CLARO.logo.desdeArriba + CLARO.logo.alto }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: CLARO.titular.desdeLogo,
          paddingLeft: CLARO.titular.margen,
          paddingRight: CLARO.titular.margen,
          textAlign: "center",
        }}
      >
        {/*
          La SEGUNDA línea va en azul, siempre.

          En el tema oscuro el tramo azul se busca dentro del titular con
          `tramoAzul`, porque ahí el reparto en líneas lo decide el encaje y el
          acento puede caer en cualquier lado. Acá el corte es de dos y lo
          escribió el propio modelo sabiendo que la segunda línea se resalta: el
          acento ES el corte, así que no hay nada que buscar.
        */}
        {lineas.map((linea, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontFamily: FAMILIA,
              fontSize: cuerpo,
              fontWeight: 700,
              letterSpacing: TRACKING_TITULAR * cuerpo,
              lineHeight: CLARO.titular.interlineado,
              color: i === lineas.length - 1 && lineas.length > 1 ? paleta.azul : paleta.titular,
            }}
          >
            {linea}
          </div>
        ))}

        {placa.bajada ? (
          <div
            style={{
              display: "flex",
              marginTop: CLARO.bajada.desdeTitular,
              fontFamily: FAMILIA,
              fontSize: CLARO.bajada.cuerpo,
              fontWeight: 400,
              lineHeight: CLARO.bajada.interlineado,
              color: paleta.texto,
            }}
          >
            {placa.bajada}
          </div>
        ) : null}
      </div>

      {placa.cta ? (
        <div
          style={{
            position: "absolute",
            bottom: CLARO.pie.desdeAbajo,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/*
            EL BOTÓN, sin borde.

            Se probó con un filo blanco y después con uno celeste, y las dos
            veces pasó lo mismo: un aro claro alrededor de una pieza que ya es
            clara le saca peso en vez de dárselo.

            Todo el trabajo lo hacen las sombras, y las tres van HACIA ATRÁS y
            hacia abajo, nunca alrededor: una oscura y corta para que apoye, una
            azul desplazada que es el brillo, y una amplia y tenue que tiñe el
            aire debajo. El halo es del mismo azul del ambiente, así que se lee
            como que el botón ilumina lo que tiene alrededor y no como un efecto
            pegado encima.
          */}
          <div
            style={{
              display: "flex",
              paddingLeft: CLARO.cta.padeoX,
              paddingRight: CLARO.cta.padeoX,
              paddingTop: CLARO.cta.padeoY,
              paddingBottom: CLARO.cta.padeoY,
              borderRadius: 999,
              backgroundImage: "linear-gradient(180deg, #2F5CD8 0%, #234BC4 48%, #15318F 100%)",
              boxShadow: [
                "0 9px 20px rgba(12,28,84,0.46)",
                "0 6px 30px rgba(43,86,212,0.62)",
                "0 2px 52px rgba(43,86,212,0.34)",
              ].join(", "),
              fontFamily: FAMILIA,
              fontSize: CLARO.cta.cuerpo,
              fontWeight: 700,
              letterSpacing: 0.07 * CLARO.cta.cuerpo,
              color: "#FFFFFF",
            }}
          >
            {placa.cta.toUpperCase()}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: CLARO.pie.separacion,
              fontFamily: FAMILIA,
              fontSize: CLARO.pie.cuerpo,
              fontWeight: 500,
              color: "#FFFFFF",
              /* La sombra hace el trabajo que haría una repisa oscura.
                 El pie cae sobre lo que el generador haya puesto ahí abajo —a
                 veces cables azules saturados, a veces un piso casi blanco— y
                 ningún color fijo funciona sobre los dos. Con el halo detrás, el
                 blanco se lee sobre cualquiera sin tener que oscurecer la obra. */
              textShadow: "0 1px 10px rgba(10,24,64,0.75), 0 0 3px rgba(10,24,64,0.5)",
            }}
          >
            accedra.com.ar
          </div>
        </div>
      ) : null}
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

  // Cada tema tiene su composición. No es el mismo layout con otros colores:
  // ver el comentario de `PlacaClara`.
  const cuerpo =
    placa.tema === "claro" ? (
      <PlacaClara placa={placa} ancho={ancho} alto={alto} />
    ) : (
      <Placa placa={placa} ancho={ancho} alto={alto} />
    )

  const respuesta = new ImageResponse(cuerpo, {
    width: ancho,
    height: alto,
    fonts: await fuentes(),
  })

  /*
   * El logo, con la ubicación que pide cada composición.
   *
   * Los números salen de `CLARO.logo` y de ningún otro lado: son los MISMOS con
   * los que `PlacaClara` le reserva el lugar arriba, así que el hueco y la marca
   * no se pueden desacomodar. Antes el margen superior estaba escrito a mano
   * dentro de `logo-pieza` y el ancho salía del 22% del tema oscuro: el logo se
   * componía un 40% más grande que el espacio reservado.
   *
   * El tema oscuro no pasa nada y cae a los valores de siempre.
   */
  const tema = placa.tema ?? "oscuro"

  return await soloLogo(
    Buffer.from(await respuesta.arrayBuffer()),
    tema === "claro"
      ? {
          archivo: PALETAS.claro.logo,
          anchoRelativo: CLARO.logo.ancho / MEDIDAS.square.ancho,
          arribaCentrado: CLARO.logo.desdeArriba,
        }
      : { archivo: PALETAS.oscuro.logo }
  )
}
