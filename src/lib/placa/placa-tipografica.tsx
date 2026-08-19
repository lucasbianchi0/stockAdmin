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

import { soloLogo } from "@/lib/logo-pieza"
import { fuentes } from "@/lib/placa/fuentes"
import {
  AZUL_SOBRE_OSCURO,
  BANDAS,
  EYEBROW,
  FAMILIA,
  FONDO,
  INTERLINEADO,
  ITEM,
  MEDIDAS,
  TEXTO,
  TITULAR,
  TRACKING_TITULAR,
  armarTitular,
  BAJADA,
  CUERPO_TITULAR,
  zonaDeTexto,
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
 * Parte una línea en tramos de color.
 *
 * Compara sin acentos ni mayúsculas porque el destacado lo escribe un modelo a
 * partir del titular y vuelve con "Minimo" donde el titular dice "Mínimo". En el
 * prompt eso se resolvía pidiéndole al generador que copiara "exactamente"; acá
 * el texto que se imprime es el del titular siempre, y el destacado solo decide
 * dónde cae el color. Si no coincide, la línea entera queda blanca — nunca se
 * pierde ni se deforma una palabra.
 */
/**
 * Sin tildes y en minúscula, SIN cambiar el largo.
 *
 * El `normalize("NFD")` de antes descomponía "á" en dos caracteres, así que las
 * posiciones que devolvía `indexOf` no servían para cortar el texto original.
 * Mientras la comparación era dentro de una sola línea el error no se veía;
 * midiendo contra el titular entero, corre el corte del color.
 */
const SIN_TILDE: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", à: "a", è: "e", ì: "i", ò: "o", ù: "u",
}
const plano = (s: string) => s.toLowerCase().replace(/[áéíóúüñàèìòù]/g, (c) => SIN_TILDE[c] ?? c)

/**
 * Parte el titular ENTERO en tramos de color, línea por línea.
 *
 * Antes se buscaba el destacado dentro de cada línea por separado, y por eso el
 * azul desaparecía sin aviso: `armarTitular` reparte el titular en las líneas que
 * mejor entran, que casi nunca son las que mandó el modelo. Un destacado como
 * "al que ya está adentro." quedaba partido entre la línea 2 y la 3, no coincidía
 * entero en ninguna, y la placa salía toda blanca — que es exactamente lo que
 * pasó con las tres muestras.
 *
 * Ahora la posición se calcula una vez sobre el titular unido y después se
 * reparte por línea. Si el destacado no está, todo queda blanco: nunca se
 * deforma ni se pierde una palabra del titular.
 */
export function tramosDeLineas(lineas: string[], destacado?: string): Tramo[][] {
  const blanco = () => lineas.map((l) => [{ texto: l, azul: false }])

  const buscado = (destacado ?? "").trim()
  if (!buscado) return blanco()

  const desde = plano(lineas.join(" ")).indexOf(plano(buscado))
  if (desde === -1) return blanco()
  const hasta = desde + buscado.length

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
  const margen = Math.round(ancho * BANDAS.margen)
  // El aire entre los tres componentes del grupo. Juntos acá y no como números
  // sueltos en cada bloque: la separación es una decisión sola, y con los valores
  // desperdigados subir una y olvidar las otras deja el grupo desparejo. Además
  // `altoBloque` los usa para reservar el espacio, así que tienen que ser los
  // mismos números en los dos lados o el titular calcula mal cuánto le queda.
  const SEP_EYEBROW = 1.45 // × el cuerpo del rótulo
  const SEP_BLOQUE = 0.78 // × el cuerpo del titular
  const SEP_ITEM = 0.8 // × el cuerpo del ítem
  // El texto NO usa todo el ancho: se queda dentro de la columna que el prompt
  // del fondo dejó tranquila, para que la foto se siga viendo a la derecha.
  const centrado = layout === "centrado"
  const zona = zonaDeTexto(placa.familia ?? "tecnologia", layout)
  const util = centrado
    ? Math.round(ancho * zona.ancho)
    : Math.round(ancho * zona.ancho) - margen
  const items = placa.items ?? []

  // La banda donde vive TODO el texto. En centrado es una franja superior a todo
  // el ancho; en los otros tres, la columna izquierda de siempre.
  const bandaDesde = Math.round(alto * (centrado ? BANDAS.centradoDesde : BANDAS.titularDesde))
  const bandaAlto = centrado
    ? Math.round(alto * zona.alto)
    : Math.round(alto * (BANDAS.bloqueHasta - BANDAS.titularDesde))

  /*
   * Cuánto alto puede ocupar el titular.
   *
   * Se le descuenta lo que va a pedir el bloque de abajo, porque comparten la
   * banda: sin esto, un titular largo se queda con todo y los ítems terminan
   * sobre el logo.
   */
  const separacionBloque = Math.round(CUERPO_TITULAR * SEP_BLOQUE)
  const altoBloque =
    layout === "bullets" && items.length > 0
      ? separacionBloque +
        items.length * ITEM.cuerpo +
        (items.length - 1) * Math.round(ITEM.cuerpo * SEP_ITEM)
      : layout === "bajada" && placa.bajada
        ? separacionBloque + Math.round(alto * 0.22)
        : 0

  const { lineas, escalas, cuerpo } = armarTitular({
    texto: placa.titular,
    anchoDisponible: util,
    altoDisponible:
      bandaAlto - altoBloque - (placa.eyebrow ? Math.round(EYEBROW.cuerpo * (1 + SEP_EYEBROW)) : 0),
    enfasisPrimera: placa.enfasis === "primera",
    // El mismo para todas: dos piezas del feed no pueden salir con la letra de
    // dos tamaños distintos solo porque una escribió más caracteres que la otra.
    cuerpoObjetivo: CUERPO_TITULAR,
  })

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
              marginBottom: Math.round(EYEBROW.cuerpo * SEP_EYEBROW),
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

        {layout === "bullets" && items.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: separacionBloque,
            }}
          >
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: i === 0 ? 0 : Math.round(ITEM.cuerpo * SEP_ITEM),
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
