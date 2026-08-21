import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { PIEZAS_POR_LOTE } from "@/lib/banco-context"
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
  type Canal,
  type Opcion,
} from "@/lib/calendario-context"
import {
  DOCTRINA_HEADLINE,
  HEADLINE_MAX_CARACTERES,
  HEADLINE_MAX_PALABRAS,
  PATRONES_HEADLINE,
  TEST_RECHAZO,
  esPatron,
  limpiarTitular,
  plano,
} from "@/lib/copy-headline"
import { repararTitulares } from "@/lib/titular-reparacion"
import { SERVICIOS } from "@/lib/brand-kit"
import { secuenciaRecomendada } from "@/lib/secuencia"
import { TEMPLATES_FEED } from "@/lib/templates-feed"

/**
 * Un lote de ocho ideas para el banco de un canal.
 *
 * EL PROMPT ES CORTO A PROPÓSITO, y es la diferencia de fondo con la ruta del
 * plan. Allá el modelo tiene que resolver además el arco de quince días, el
 * reparto entre dos canales, una fecha por pieza, el rol de cada una dentro de
 * la historia y un análisis de marketer que explique el conjunto. Todo eso es
 * trabajo real cuando se planifica un mes; acá no existe: el lote son ocho
 * piezas independientes que después se programan de a una.
 *
 * Lo que SÍ queda entero es la doctrina del titular y el test de rechazo. Son lo
 * que decide si la pieza se puede firmar o la puede postear cualquier integrador
 * del país, y recortar eso para "achicar el prompt" es recortar justo lo único
 * que no se puede recuperar después editando el copy.
 *
 * Genera las IDEAS y nada más. El copy y la imagen los hace el cliente pieza por
 * pieza, con las mismas rutas que ya usa el calendario — que es lo que hace que
 * la imagen salga idéntica a la que ya funciona.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60

/**
 * El lote se pide en DOS TANDAS PARALELAS de cuatro, no en una de ocho.
 *
 * Es por el reloj. Medido: las ocho en una sola llamada tardan 69 segundos, y
 * `maxDuration` son 60 —el techo del plan hobby de Vercel, que no se puede
 * declarar más alto—. O sea que la versión de una llamada anda en local y corta
 * por timeout en producción, que es la peor forma de romperse: la que no se ve
 * hasta que está desplegada.
 *
 * Dos tandas de cuatro corren a la vez y cada una tarda la mitad. Y el reparto no
 * es al azar: cada tanda se lleva objetivos distintos y líneas de servicio
 * distintas, así que dos llamadas que no se ven entre sí igual no pueden escribir
 * las mismas ocho piezas.
 *
 * El reparto de objetivos —3 awareness, 3 educación, 2 conversión— está escrito y
 * no librado al modelo: pedirle "variá los objetivos" devuelve ocho de awareness
 * con dos etiquetas distintas. Es el mismo equilibrio que el plan de quince días
 * propone en su análisis, escalado a ocho.
 */
type Tanda = { objetivos: string[]; lineas: string[] }

const LINEAS = SERVICIOS.map((s) => s.nombre)

function tandasDelLote(desde: number): Tanda[] {
  // La rotación arranca en el tamaño del banco: dos lotes seguidos del mismo
  // canal no salen sobre las mismas líneas de servicio.
  const linea = (i: number) => LINEAS[(i + desde) % LINEAS.length]

  /*
   * LAS DOS LISTAS SON DISJUNTAS. No es un detalle de reparto: es lo único que
   * impide que las tandas escriban la misma pieza.
   *
   * Se probó con Networking en las dos —parecía razonable, es la línea más
   * grande— y el lote volvió con "Tres proveedores, ningún responsable" y
   * "Cuatro proveedores de red. Ninguno se hace cargo.": la misma idea dos
   * veces. Las tandas corren en paralelo y no se ven, así que la única forma de
   * que no colisionen es que no tengan de qué hablar en común.
   */
  return [
    {
      objetivos: ["awareness", "awareness", "educacion", "educacion"],
      lineas: [linea(0), linea(1), linea(2)],
    },
    {
      objetivos: ["awareness", "educacion", "conversion", "conversion"],
      lineas: [linea(3), linea(4)],
    },
  ]
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

  try {
    const planId = await planDelBanco(canal)

    // El banco entero del canal, programadas incluidas: el `orden` tiene que
    // seguir creciendo aunque las piezas viejas ya se hayan ido al calendario, o
    // dos lotes distintos compartirían números y la grilla saltaría de lugar.
    const { count } = await supabase
      .from("content_slots")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId)
      .eq("origen", "banco")

    const desde = count ?? 0
    const ideas = await generarIdeas(canal, desde)
    if (ideas.length === 0) throw new Error("El modelo no devolvió ninguna idea")

    // El mismo control de calidad del titular que el plan. No es opcional: es lo
    // que evita que se imprima una frase cortada dentro del JPG.
    await repararTitulares(ideas)

    const templates = repartirTemplates(ideas.length, canal, desde)
    const hoy = hoyISO()

    const filas = ideas.map((idea, i) => ({
      plan_id: planId,
      origen: "banco",
      // `fecha` es not null y en el banco no significa nada todavía: guarda el
      // día de generación, que es lo único cierto. La fecha de publicación vive
      // en `programada` y se decide al exportar.
      fecha: hoy,
      canal,
      orden: desde + i,
      // La idea va en `opciones` con un solo elemento y ya elegida: es el mismo
      // estado al que llega un slot del calendario apenas se genera el plan.
      opciones: [idea],
      elegida: idea.id,
      template_slug: templates[i] ?? null,
    }))

    const { data, error } = await supabase
      .from("content_slots")
      .insert(filas)
      .select(columnasPieza)

    if (error) throw error

    return NextResponse.json({ piezas: await aPiezasBanco(data ?? []) })
  } catch (err) {
    console.error("[banco/lote]", err)
    return NextResponse.json({ error: "No se pudo generar el lote" }, { status: 500 })
  }
}

/* ── Los templates del lote ───────────────────────────────────────────────── */

/**
 * Qué composición le toca a cada pieza nueva.
 *
 * Reusa el repartidor del calendario —el que equilibra densidades y no repite la
 * misma composición en piezas vecinas— en vez de sortear al azar. Ese repartidor
 * ordena por fecha porque en un plan la fecha ES el orden; acá se le pasa el
 * orden de generación disfrazado de fecha, que es lo único para lo que lo usa.
 *
 * La semilla es el tamaño del banco: dos lotes seguidos del mismo canal salen
 * con repartos distintos en vez de repetir la misma secuencia de ocho.
 */
function repartirTemplates(cantidad: number, canal: Canal, desde: number): string[] {
  const sinteticos = Array.from({ length: cantidad }, (_, i) => ({
    id: String(i),
    fecha: `2000-01-${String((i % 28) + 1).padStart(2, "0")}`,
    canal,
  }))

  const asignacion = secuenciaRecomendada(
    sinteticos,
    TEMPLATES_FEED.map((t) => ({
      id: t.id,
      densidad: t.densidad,
      fotoColor: t.familia === "foto-real",
    })),
    { semilla: desde }
  )

  return sinteticos.map((s) => asignacion.get(s.id) ?? TEMPLATES_FEED[0].id)
}

/* ── Generación ───────────────────────────────────────────────────────────── */

/**
 * Las ocho ideas: las dos tandas a la vez, unidas y sin repetidas.
 *
 * `allSettled` y no `all`: si una tanda falla, las cuatro de la otra son mejor
 * que ninguna. Un lote de cuatro se completa apretando el botón otra vez; un
 * lote de cero es un minuto perdido.
 *
 * El dedupe por titular es una red barata. Las tandas no se ven entre sí, así
 * que aunque tengan objetivos y líneas distintas nada les impide llegar por dos
 * caminos al mismo titular — y dos piezas idénticas en el banco se descubren
 * recién al leerlas.
 */
async function generarIdeas(canal: Canal, desde: number): Promise<Opcion[]> {
  const resultados = await Promise.allSettled(
    tandasDelLote(desde).map((tanda) => pedirIdeas(canal, tanda))
  )

  for (const r of resultados) {
    if (r.status === "rejected") console.error("[banco/lote tanda]", r.reason)
  }

  const vistos = new Set<string>()
  return resultados
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((idea) => {
      const clave = plano(idea.headline)
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
    // El tamaño del lote lo define `PIEZAS_POR_LOTE` y no la suma de las tandas:
    // si algún día se reparten distinto, el banco no crece de a nueve sin que
    // nadie lo haya decidido.
    .slice(0, PIEZAS_POR_LOTE)
}

async function pedirIdeas(canal: Canal, tanda: Tanda): Promise<Opcion[]> {
  const cantidad = tanda.objetivos.length

  const objetivos = [...new Set(tanda.objetivos)]
    .map((o) => {
      const n = tanda.objetivos.filter((x) => x === o).length
      const k = o as keyof typeof OBJETIVO_LABEL
      return `${n} de "${o}" (${OBJETIVO_LABEL[k]} — ${OBJETIVO_DESC[k]})`
    })
    .join(", ")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `${ACCEDRA_BRAND_CONTEXT}

Sos el director de marketing de Accedra. Generá ${cantidad} ideas de publicación para el banco de contenido.

CANAL: ${CANAL_LABEL[canal]}
${CANAL_BRIEF[canal]}

CÓMO ES ESTE LOTE — no es un calendario:
- Las ${cantidad} piezas son INDEPENDIENTES entre sí. Cada una se publica sola, sin depender de las otras, y no hay un orden. No escribas una serie ni una historia en capítulos.
- LAS LÍNEAS DE SERVICIO DE ESTA TANDA, y ninguna otra: ${tanda.lineas.join(" · ")}. Como máximo DOS piezas por línea.
- Reparto de objetivos, exacto: ${objetivos}.
- Audiencias: la mayoría a decisores técnicos o de negocio, y una o dos a corporativo/RH. Las etiquetas válidas son ${Object.entries(AUDIENCIA_LABEL).filter(([k]) => k !== "todos").map(([k, v]) => `"${k}" (${v})`).join(", ")}.
- Como máximo DOS piezas pueden usar el mismo "patron" de titular. Ocho titulares con la misma fórmula se leen como ocho veces el mismo posteo.

${DOCTRINA_HEADLINE}

${TEST_RECHAZO}

TITULARES YA PUBLICADOS — ninguno de estos puede volver a salir, ni tal cual, ni reescrito, ni con los mismos sustantivos en otro orden:
${PATRONES_HEADLINE.map((p) => `· "${p.ejemplo}"`).join("\n")}

Son los ejemplos de los patrones de arriba y están ahí para mostrar la FORMA, no el contenido. Copiar uno es postear dos veces lo mismo. Si tu titular se parece a alguno en algo más que la estructura, cambiá el tema.

ANTES DEL TITULAR, LA TESIS. Cada pieza defiende una afirmación concreta, en una frase que alguien podría discutir. "La importancia de la ciberseguridad" NO es una tesis: nadie la discute y no se puede desarrollar. "El firewall perimetral no ve al atacante que ya entró con credenciales válidas" sí lo es. El titular es la versión impresa de la tesis.

Devolvé SOLO un JSON válido, sin markdown ni texto fuera del objeto:
{
  "piezas": [
    {
      "tesis": "La afirmación que defiende la pieza, en 1 frase discutible",
      "headline": "EL TEXTO IMPRESO EN LA PIEZA. Máx ${HEADLINE_MAX_PALABRAS} palabras Y máx ${HEADLINE_MAX_CARACTERES} caracteres con espacios. Ver las reglas del titular más arriba",
      "caracteres": "cuántos caracteres tiene el titular que acabás de escribir, contando espacios y puntuación. Si te da más de ${HEADLINE_MAX_CARACTERES}, reescribilo antes de seguir",
      "patron": ${PATRONES_HEADLINE.map((p) => `"${p.id}"`).join(" | ")},
      "titulo": "Nombre interno de la pieza para la grilla, máx 8 palabras. NO es el titular impreso",
      "hook": "Primera línea del caption, la que frena el scroll, máx 15 palabras",
      "objetivo": "awareness | educacion | conversion",
      "audiencia": "decisores | negocio | corporativo",
      "angulo": "De qué trata el posteo: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas",
      "imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto propia o placa. 2 frases",
      "porQue": "Por qué esta idea, en 1 frase: qué busca y a quién le habla"
    }
  ]
}

Exactamente ${cantidad} piezas.`,
      },
    ],
  })

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const inicio = text.indexOf("{")
  const fin = text.lastIndexOf("}")
  if (inicio === -1 || fin <= inicio) throw new Error("Sin JSON en la respuesta")

  const parsed = JSON.parse(text.slice(inicio, fin + 1)) as { piezas?: unknown }
  if (!Array.isArray(parsed.piezas)) throw new Error("El JSON no trae piezas")

  // Una tanda que devuelve tres cuando se le pidieron cuatro deja el lote corto
  // sin ningún error. Se registra: el botón dice "lote de 8" y si salen 7 hay
  // que poder saber por qué.
  if (parsed.piezas.length < cantidad) {
    console.warn(
      `[banco/lote] la tanda de ${tanda.lineas.join("/")} devolvió ` +
        `${parsed.piezas.length} de ${cantidad} piezas`
    )
  }

  return parsed.piezas
    .slice(0, cantidad)
    .flatMap((p): Opcion[] => {
      if (!p || typeof p !== "object") return []
      const o = p as Record<string, unknown>

      const titulo = typeof o.titulo === "string" ? o.titulo.slice(0, 200) : ""
      if (!titulo) return []

      const audiencia: Audiencia =
        esAudiencia(o.audiencia) && o.audiencia !== "todos" ? o.audiencia : "decisores"

      return [
        {
          // El id es interno del slot, no del lote: identifica a la idea dentro
          // de `opciones`, que en el banco siempre tiene una sola.
          id: "a",
          titulo,
          // Entero y sin recortar: el techo lo hace cumplir `repararTitulares`,
          // pidiéndoselo de vuelta al modelo. El tope de 200 es un freno contra
          // un párrafo en el campo del titular, no el presupuesto.
          headline: typeof o.headline === "string" ? limpiarTitular(o.headline).slice(0, 200) : "",
          patron: esPatron(o.patron) ? o.patron : "",
          tesis: typeof o.tesis === "string" ? o.tesis.slice(0, 400) : "",
          hook: typeof o.hook === "string" ? o.hook.slice(0, 300) : "",
          objetivo: esObjetivo(o.objetivo) ? o.objetivo : "awareness",
          audiencia,
          angulo: typeof o.angulo === "string" ? o.angulo.slice(0, 400) : "",
          imagen: typeof o.imagen === "string" ? o.imagen.slice(0, 400) : "",
          formato: FORMATO_UNICO,
          recomendada: true,
          porQue: typeof o.porQue === "string" ? o.porQue.slice(0, 300) : "",
        },
      ]
    })
}
