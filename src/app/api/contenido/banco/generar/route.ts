import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { aPiezasBanco, columnasPieza, planDelBanco } from "@/lib/banco-server"
import {
  ACCEDRA_BRAND_CONTEXT,
  AUDIENCIA_LABEL,
  CANAL_BRIEF,
  CANAL_LABEL,
  FORMATO_UNICO,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  esAudiencia,
  esCanal,
  esObjetivo,
  hoyISO,
  type Audiencia,
  type Objetivo,
  type Opcion,
} from "@/lib/calendario-context"
import {
  DOCTRINA_HEADLINE,
  doctrinaHeadlineClaro,
  HEADLINE_MAX_CARACTERES,
  HEADLINE_MAX_PALABRAS,
  PATRONES_HEADLINE,
  TEST_RECHAZO,
  esPatron,
  limpiarTitular,
} from "@/lib/copy-headline"
import { repararTitulares, repararTitularesClaro } from "@/lib/titular-reparacion"
import { LINEA_MAX_CLARO, LINEA_MAX_CLARO_TOLERADA, esTema, type Tema } from "@/lib/placa/sistema"
import {
  anotarEnHistorial,
  historialReciente,
  type EntradaHistorial,
} from "@/lib/historial-server"
import { secuenciaRecomendada } from "@/lib/secuencia"
import { TEMPLATES_FEED } from "@/lib/templates-feed"

/**
 * UNA pieza, escrita sobre un pedido concreto.
 *
 * POR QUÉ ESTÁ EN `generar` Y NO EN `pieza`. Porque `banco/pieza` ya existe y es
 * otra cosa: el PATCH que guarda el copy editado y el DELETE que descarta. Esto
 * se escribió primero ahí y se llevó puesto ese archivo entero —el tacho de la
 * grilla dejó de andar y el síntoma fue un "Unexpected end of JSON input", que
 * es lo que devuelve un 405 sin cuerpo—. Una ruta propia hace que no vuelva a
 * pasar: acá no hay nada más que compartir el archivo.
 *
 * POR QUÉ NO ES UN LOTE DE UNO. El lote existe para llenar el banco sin que
 * nadie piense el tema: reparte ángulos, líneas de servicio y objetivos por su
 * cuenta, y su trabajo más difícil es que ocho piezas no se parezcan entre sí.
 * Acá no hay nada de eso — el tema lo trae la persona, y lo único que el modelo
 * tiene que hacer es escribirlo bien.
 *
 * POR QUÉ NO SE TOCÓ `banco/lote`. Hubiera sido un branch adentro de 665 líneas
 * con dos tandas disjuntas, rotación de ángulos y un caché de prompt que se
 * invalida si cambia un byte del prefijo. Todo eso es exactamente lo que esta
 * ruta NO necesita, y romperlo dejaría sin generador al flujo que sí se usa todos
 * los días. Lo que vale la pena compartir ya está afuera, en módulos: la doctrina
 * del titular, el historial, la reparación y el armado de la fila.
 *
 * LO QUE SÍ COMPARTE, y es deliberado:
 * - El historial: la pieza queda anotada igual, así el próximo lote no reescribe
 *   este titular sin saberlo.
 * - La reparación del titular contra la medida de SU tema.
 * - La fila de `content_slots` con `origen: "banco"`, o sea que la pieza cae en
 *   el mismo banco y se programa por el mismo camino que las del lote.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** El pedido es texto libre y viaja al prompt: tope para que no entre un libro. */
const BRIEF_MAX = 1200
const IMAGEN_MAX = 600

export const maxDuration = 60

type IdeaCruda = Opcion & { linea: string; eje: string }

function texto(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = (body ?? {}) as Record<string, unknown>
  if (!esCanal(raw.canal)) return NextResponse.json({ error: "Canal inválido" }, { status: 400 })
  const canal = raw.canal

  const brief = texto(raw.brief, BRIEF_MAX)
  if (!brief) {
    return NextResponse.json({ error: "Falta describir qué se quiere publicar" }, { status: 400 })
  }

  /* El tema decide las reglas del titular, no cómo se ve: el claro son dos
     líneas de hasta ${LINEA_MAX_CLARO}, el oscuro una columna. Ver `banco/lote`. */
  const tema: Tema = esTema(raw.tema) ? raw.tema : "oscuro"

  /*
   * Objetivo y audiencia son OPCIONALES a propósito.
   *
   * Quien escribe el pedido muchas veces sabe qué quiere contar pero no si eso
   * es awareness o educación, y obligarlo a elegir lo hace tildar una opción al
   * azar que después le tuerce la pieza. Sin elegir, lo decide el modelo a
   * partir del pedido, que es quien mejor puede.
   */
  const objetivo: Objetivo | null = esObjetivo(raw.objetivo) ? raw.objetivo : null
  const audiencia: Audiencia | null =
    esAudiencia(raw.audiencia) && raw.audiencia !== "todos" ? raw.audiencia : null
  const imagen = texto(raw.imagen, IMAGEN_MAX)

  try {
    const planId = await planDelBanco(canal)

    /*
     * El `orden` sale del MÁXIMO y no de un conteo.
     *
     * Contar las filas parece lo mismo y no lo es: descartar una pieza baja el
     * conteo pero no el máximo, así que el número que salía ya estaba usado y la
     * pieza nueva caía empatada con otra en la grilla. Pasó en la primera prueba
     * real —quedaron dos en el orden 23—.
     */
    const { data: ultima } = await supabase
      .from("content_slots")
      .select("orden")
      .eq("plan_id", planId)
      .eq("origen", "banco")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle()

    const desde = ((ultima?.orden as number | null | undefined) ?? -1) + 1

    // Solo `reciente`, y no el filtro de claves usadas del lote: acá el tema lo
    // pidió una persona. Si quiere insistir sobre algo ya escrito está en su
    // derecho, y descartarle la pieza en silencio sería lo peor posible. El
    // historial va igual, para que el modelo no calque un titular existente.
    const reciente = await historialReciente(canal)

    const idea = await pedirIdea({ canal, tema, objetivo, audiencia, brief, imagen, reciente })
    if (!idea) throw new Error("El modelo no devolvió ninguna pieza")

    const ideas = [idea]
    if (tema === "claro") await repararTitularesClaro(ideas)
    else await repararTitulares(ideas)

    // Igual que en el lote: se anota antes de insertar, porque el historial
    // registra titulares escritos y no piezas que sobrevivieron.
    await anotarEnHistorial(canal, ideas, new Map(), tema)

    const { data, error } = await supabase
      .from("content_slots")
      .insert([
        {
          plan_id: planId,
          origen: "banco",
          fecha: hoyISO(),
          canal,
          orden: desde,
          opciones: [sinContexto(ideas[0])],
          elegida: ideas[0].id,
          tema,
          template_slug: templateDe(canal, desde),
        },
      ])
      .select(columnasPieza)

    if (error) throw error

    return NextResponse.json({ piezas: await aPiezasBanco(data ?? []) })
  } catch (err) {
    console.error("[banco/pieza]", err)
    return NextResponse.json({ error: "No se pudo generar la pieza" }, { status: 500 })
  }
}

/**
 * Con qué composición se imprime la pieza. SIN ESTO NO HAY IMAGEN.
 *
 * `generarImagen` en el cliente arranca con `if (!pieza.templateSlug) throw`: una
 * pieza sin template se guarda igual, sale con su copy, y la placa nunca se
 * compone. Queda en el banco a medias y el único síntoma es el cartel "Sin
 * imagen todavía", que se confunde con "todavía no terminó".
 *
 * Se usa el mismo repartidor que el lote —el del calendario, que equilibra
 * densidades— con el orden de generación de semilla, así dos piezas seguidas no
 * salen con la misma composición.
 */
function templateDe(canal: "linkedin" | "meta", desde: number): string {
  const uno = [{ id: "0", fecha: "2000-01-01", canal }]
  const asignacion = secuenciaRecomendada(
    uno,
    TEMPLATES_FEED.map((t) => ({
      id: t.id,
      densidad: t.densidad,
      fotoColor: t.familia === "foto-real",
    })),
    { semilla: desde }
  )
  return asignacion.get("0") ?? TEMPLATES_FEED[0].id
}

/** `linea` y `eje` ya viajaron al historial; la pieza guardada no los usa. */
function sinContexto(idea: IdeaCruda): Opcion {
  const { linea: _linea, eje: _eje, ...pieza } = idea
  void _linea
  void _eje
  return pieza
}

async function pedirIdea(args: {
  canal: "linkedin" | "meta"
  tema: Tema
  objetivo: Objetivo | null
  audiencia: Audiencia | null
  brief: string
  imagen: string
  reciente: EntradaHistorial[]
}): Promise<IdeaCruda | null> {
  const { canal, tema, objetivo, audiencia, brief, imagen, reciente } = args

  const etiquetasAudiencia = Object.entries(AUDIENCIA_LABEL)
    .filter(([k]) => k !== "todos")
    .map(([k, v]) => `"${k}" (${v})`)
    .join(", ")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          /* El brand kit primero y cacheado, por lo mismo que en `banco/lote`:
             es el prefijo, y tiene que ser idéntico byte a byte entre llamadas
             para que el caché sirva. Nada de esta ruta se interpola acá. */
          {
            type: "text" as const,
            text: ACCEDRA_BRAND_CONTEXT,
            cache_control: { type: "ephemeral" as const },
          },
          {
            type: "text" as const,
            text: `Sos el director de marketing de Accedra. Escribí UNA pieza de publicación sobre un pedido concreto.

CANAL: ${CANAL_LABEL[canal]}
${CANAL_BRIEF[canal]}

EL PEDIDO — esto es lo que hay que publicar, y manda sobre cualquier otra cosa:
${brief}
${imagen ? `\nQUÉ QUIERE QUE SE VEA EN LA IMAGEN:\n${imagen}\n` : ""}
${
  objetivo
    ? `OBJETIVO, ya decidido: "${objetivo}" (${OBJETIVO_LABEL[objetivo]} — ${OBJETIVO_DESC[objetivo]}). Devolvelo tal cual en el campo "objetivo".`
    : `OBJETIVO: elegilo vos, el que mejor le calce al pedido, entre "awareness", "educacion" y "conversion".`
}
${
  audiencia
    ? `AUDIENCIA, ya decidida: "${audiencia}" (${AUDIENCIA_LABEL[audiencia]}). Devolvela tal cual en el campo "audiencia".`
    : `AUDIENCIA: elegila vos según el pedido. Las etiquetas válidas son ${etiquetasAudiencia}.`
}
${
  tema === "claro"
    ? `\nLA IMAGEN DE ESTA PIEZA ES UN OBJETO SOLO, centrado sobre un fondo claro de estudio. En el campo "imagen" nombrás QUÉ objeto y nada más — ni el encuadre, ni el fondo, ni los colores, ni la tipografía, que los pone el sistema. Nunca personas ni manos.\n`
    : ""
}
NO ESCRIBAS FOLLETO. La pieza habla del problema, de la tecnología y del oficio, para alguien que decide sobre eso. El catálogo de arriba es la ÚNICA fuente de cifras, clientes, servicios y tecnologías —de ahí no se sale— pero la pieza no tiene por qué mencionar a Accedra ni a lo que vende. Se nota que sabemos por lo que decimos del tema, no por lo que decimos de nosotros.

${tema === "claro" ? doctrinaHeadlineClaro(LINEA_MAX_CLARO, LINEA_MAX_CLARO_TOLERADA) : DOCTRINA_HEADLINE}

${TEST_RECHAZO}

Titulares de ejemplo, que muestran la FORMA de cada patrón y no el contenido. No los copies:
${PATRONES_HEADLINE.map((p) => `· "${p.ejemplo}"`).join("\n")}
${
  reciente.length > 0
    ? `\nLO ÚLTIMO PUBLICADO EN ESTE CANAL. El pedido manda, así que si pisa alguno de estos temas está bien — lo que no se repite es el TITULAR literal:\n${reciente
        .map((o) => `· ${o.titulo} — "${o.headline}"`)
        .join("\n")}`
    : ""
}

ANTES DEL TITULAR, LA TESIS. La pieza defiende una afirmación concreta, en una frase que alguien podría discutir. "La importancia de la ciberseguridad" NO es una tesis: nadie la discute y no se puede desarrollar. "El firewall perimetral no ve al atacante que ya entró con credenciales válidas" sí lo es. El titular es la versión impresa de la tesis.

Devolvé SOLO un JSON válido, sin markdown ni texto fuera del objeto:
{
  "tesis": "La afirmación que defiende la pieza, en 1 frase discutible",
  ${
    tema === "claro"
      ? `"linea1": "la PRIMERA línea del titular impreso, hasta ${LINEA_MAX_CLARO} caracteres",
  "linea2": "la SEGUNDA línea, la que va en azul, hasta ${LINEA_MAX_CLARO} caracteres"`
      : `"headline": "EL TEXTO IMPRESO EN LA PIEZA. Máx ${HEADLINE_MAX_PALABRAS} palabras Y máx ${HEADLINE_MAX_CARACTERES} caracteres con espacios"`
  },
  "patron": ${PATRONES_HEADLINE.map((p) => `"${p.id}"`).join(" | ")},
  "titulo": "Nombre interno de la pieza para la grilla, máx 8 palabras. NO es el titular impreso",
  "hook": "Primera línea del caption, la que frena el scroll, máx 15 palabras",
  "objetivo": "awareness | educacion | conversion",
  "audiencia": "decisores | negocio | corporativo",
  "angulo": "De qué trata el posteo: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas",
  ${
    tema === "claro"
      ? `"imagen": "EL SUJETO Y NADA MÁS. Un solo objeto físico, concreto y fotografiable. Una frase. Sin personas, sin manos, sin pantallas encendidas."`
      : `"imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto propia o placa. 2 frases"`
  },
  "porQue": "Por qué esta idea, en 1 frase: qué busca y a quién le habla"
}`,
          },
        ],
      },
    ],
  })

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const inicio = text.indexOf("{")
  const fin = text.lastIndexOf("}")
  if (inicio === -1 || fin <= inicio) throw new Error("Sin JSON en la respuesta")

  const o = JSON.parse(text.slice(inicio, fin + 1)) as Record<string, unknown>
  const titulo = texto(o.titulo, 200)
  if (!titulo) return null

  return {
    id: "a",
    titulo,
    headline: limpiarTitular(
      tema === "claro"
        ? [o.linea1, o.linea2].filter((x) => typeof x === "string").join(" ")
        : typeof o.headline === "string"
          ? o.headline
          : ""
    ).slice(0, 200),
    patron: esPatron(o.patron) ? o.patron : "",
    tesis: texto(o.tesis, 400),
    hook: texto(o.hook, 300),
    // Lo elegido en el formulario gana sobre lo que devuelva el modelo: si la
    // persona pidió "conversión", la pieza es de conversión aunque el modelo
    // haya escrito otra cosa en el campo.
    objetivo: objetivo ?? (esObjetivo(o.objetivo) ? o.objetivo : "awareness"),
    audiencia:
      audiencia ?? (esAudiencia(o.audiencia) && o.audiencia !== "todos" ? o.audiencia : "decisores"),
    angulo: texto(o.angulo, 400),
    imagen: texto(o.imagen, 400),
    formato: FORMATO_UNICO,
    recomendada: true,
    porQue: texto(o.porQue, 300),
    // Para el historial: de qué habló. Acá el "eje" es el pedido mismo.
    linea: "",
    eje: "pedido",
  }
}
