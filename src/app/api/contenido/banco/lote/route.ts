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
  doctrinaHeadlineClaro,
  HEADLINE_MAX_CARACTERES,
  HEADLINE_MAX_PALABRAS,
  PATRONES_HEADLINE,
  TEST_RECHAZO,
  claveTitular,
  esPatron,
  limpiarTitular,
} from "@/lib/copy-headline"
import { repararTitulares, repararTitularesClaro } from "@/lib/titular-reparacion"
import {
  LINEA_MAX_CLARO,
  LINEA_MAX_CLARO_TOLERADA,
  esTema,
  type Tema,
} from "@/lib/placa/sistema"
import {
  anotarEnHistorial,
  clavesUsadas,
  historialDelOtroCanal,
  historialReciente,
  type EntradaHistorial,
} from "@/lib/historial-server"
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
type Tanda = { objetivos: string[]; lineas: string[]; ejes: string[] }

/**
 * Una idea recién salida del modelo: la pieza más de dónde salió.
 *
 * `linea` y `eje` NO son de la pieza —no se imprimen, no se publican, no los
 * lee el calendario— así que no van en `Opcion`, que es el tipo que comparten
 * las dos pantallas. Viven el tiempo que tardan en anotarse en el historial y
 * ahí se separan.
 */
type IdeaCruda = Opcion & { linea: string; eje: string }

const LINEAS = SERVICIOS.map((s) => s.nombre)

/**
 * DESDE DÓNDE se mira el tema. El otro eje del contenido.
 *
 * La línea de servicio dice DE QUÉ habla la pieza; esto dice desde dónde. Sin
 * este segundo eje, ocho piezas sobre Networking son ocho formas de decir
 * "vendemos redes", y el banco se agota en dos lotes: el modelo vuelve sobre el
 * mismo problema —el multiproveedor, la caída, el costo oculto— porque es lo
 * único que el catálogo, solo, sugiere.
 *
 * Ninguno de estos ángulos habla de lo que Accedra vende. Hablan del PROBLEMA,
 * de la tecnología, del oficio, del error que comete el mercado. La marca entra
 * igual —el catálogo sigue siendo la única fuente de cifras, servicios y
 * clientes—, pero entra como quien sabe del tema y no como quien tiene algo que
 * ofrecer. Es lo que separa una cuenta que vale la pena seguir de un folleto.
 *
 * Línea × eje es el espacio real de temas: cinco por nueve son cuarenta y cinco
 * combinaciones antes de que ninguna se repita.
 */
const EJES = [
  {
    id: "error-del-mercado",
    nombre: "El error que comete el mercado",
    brief:
      "La decisión equivocada que toma la mayoría de las empresas en este tema, y por qué parece razonable hasta que falla. No es un ataque a nadie: es la trampa en la que cae cualquiera que no hace esto todos los días.",
  },
  {
    id: "como-se-decide",
    nombre: "Cómo se decide bien",
    brief:
      "Qué hay que preguntar ANTES de contratar o comprar en este rubro. Las dos o tres preguntas que separan una decisión informada de una compra por catálogo. Útil incluso para el que termina eligiendo a otro.",
  },
  {
    id: "distincion-tecnica",
    nombre: "La distinción técnica que nadie explica",
    brief:
      "Dos cosas que el mercado usa como sinónimos y no lo son. Se explica la diferencia real y qué consecuencia práctica tiene. Es la pieza que hace que alguien del rubro diga 'estos saben'.",
  },
  {
    id: "que-cambio",
    nombre: "Qué cambió",
    brief:
      "Algo que era cierto hace unos años y ya no lo es en este tema: una tecnología que se volvió estándar, un supuesto que caducó, una práctica que dejó de alcanzar. Sin declarar tendencias vagas ni hablar de 'la transformación digital'.",
  },
  {
    id: "costo-invisible",
    nombre: "El costo que nadie mide",
    brief:
      "El gasto real que no aparece en ninguna factura ni en ningún reporte: horas perdidas, retrabajo, decisiones tomadas tarde, riesgo asumido sin saberlo. Se nombra el costo, no el remedio.",
  },
  {
    id: "como-se-ve-bien-hecho",
    nombre: "Cómo se ve cuando está bien hecho",
    brief:
      "El estándar. Qué se siente, qué se mide y qué NO pasa cuando este tema está resuelto de verdad. Da un patrón contra el cual el lector puede comparar lo que tiene hoy.",
  },
  {
    id: "el-oficio",
    nombre: "El oficio por dentro",
    brief:
      "Cómo se hace el trabajo de verdad: el relevamiento, la etapa que nadie ve, lo que se decide en obra, por qué un proyecto tarda lo que tarda. Marca empleadora y autoridad técnica a la vez.",
  },
  {
    id: "requisito-real",
    nombre: "El requisito que sí importa",
    brief:
      "La exigencia concreta —legal, normativa, de auditoría o de continuidad— que este tema tiene que cumplir, y qué implica de verdad cumplirla. Nada de miedo genérico: el requisito con nombre.",
  },
  {
    id: "caso-como-historia",
    nombre: "El caso, contado como historia",
    brief:
      "Un cliente real del catálogo, contado por lo que le pasaba antes y qué cambió. La cifra publicada es el cierre, no el titular. Solo con casos y números que estén en el catálogo.",
  },
] as const

/**
 * Qué combinación de línea, eje y objetivo le toca a cada tanda.
 *
 * La rotación arranca en el tamaño del banco, así que dos lotes seguidos del
 * mismo canal no salen ni sobre las mismas líneas ni desde los mismos ángulos.
 * Como las dos listas avanzan a distinto ritmo —cinco líneas, nueve ejes— el par
 * (línea, eje) tarda cuarenta y cinco lotes en repetirse.
 */
function tandasDelLote(desde: number): Tanda[] {
  const linea = (i: number) => LINEAS[(i + desde) % LINEAS.length]
  const eje = (i: number) => {
    const e = EJES[(i + desde) % EJES.length]
    return `${e.nombre}: ${e.brief}`
  }

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
      ejes: [eje(0), eje(1), eje(2), eje(3)],
    },
    {
      objetivos: ["awareness", "educacion", "conversion", "conversion"],
      lineas: [linea(3), linea(4)],
      ejes: [eje(4), eje(5), eje(6), eje(7)],
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

  /*
   * El tema se elige AL GENERAR, no al componer, y por eso llega hasta acá.
   *
   * No es una decisión de presentación: decide con qué reglas se escribe el
   * copy. El titular claro son dos líneas de hasta ${LINEA_MAX_CLARO}
   * caracteres cada una; el oscuro es una columna de hasta 50 en total. Escribir
   * uno y componerlo con el otro da una pieza que no entra o que sobra.
   */
  const tema: Tema = esTema(raw.tema) ? raw.tema : "oscuro"

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

    /*
     * La memoria del canal, en dos formas y por dos motivos distintos.
     *
     * `reciente` va al PROMPT: es lo que hace que el modelo escriba otra idea en
     * vez de una variante de una que ya existe. `usadas` es el FILTRO: TODAS las
     * huellas del canal, para que si el modelo igual repite, no entre.
     *
     * Las dos salen del historial y no de las piezas vivas del banco. Antes se
     * leían de `content_slots`, y ahí descartar una pieza liberaba su titular:
     * la idea que ya se había mirado y rechazado podía volver en el lote
     * siguiente. Y la consulta traía cuarenta: al sexto lote, el banco ya no se
     * acordaba de lo que había escrito en el primero.
     */
    const [reciente, otroCanal, usadas] = await Promise.all([
      historialReciente(canal),
      historialDelOtroCanal(canal),
      clavesUsadas(),
    ])

    const ideas = await generarIdeas(canal, desde, reciente, otroCanal, usadas, tema)
    if (ideas.length === 0) throw new Error("El modelo no devolvió ninguna idea")

    /*
     * El control de calidad del titular, contra la medida de SU composición.
     *
     * Son dos problemas distintos y por eso son dos funciones. En oscuro lo que
     * se agota es el área de una columna y la medida es el total de caracteres.
     * En claro el titular va centrado en dos líneas y el cuerpo lo decide la
     * línea más larga: medido sobre los 67 titulares del banco, solo el 45%
     * entra al cuerpo grande, y hay uno de treinta y dos caracteres que no entra
     * porque parte en 23 + 9.
     */
    if (tema === "claro") await repararTitularesClaro(ideas)
    else await repararTitulares(ideas)

    /*
     * Se anota ANTES de insertar las piezas y no después.
     *
     * El historial no registra piezas, registra titulares escritos: si la
     * inserción falla o el usuario descarta la pieza a los dos minutos, ese
     * titular igual ya existió y no tiene que volver. Anotarlo después ataría la
     * memoria a que la pieza sobreviva, que es justamente el agujero que esta
     * tabla vino a tapar.
     */
    await anotarEnHistorial(canal, ideas, contextoDeIdeas(ideas), tema)

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
      // `linea` y `eje` quedan afuera: ya se anotaron en el historial y la pieza
      // no los usa para nada.
      opciones: [sinContexto(idea)],
      elegida: idea.id,
      tema,
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

/**
 * De qué línea y con qué ángulo salió cada idea, según lo que declaró el modelo.
 *
 * Se probó reconstruirlo del reparto con el que se pidió —`tandasDelLote` es
 * pura, así que emparejar por índice parecía gratis— y salió mal: el modelo no
 * devuelve las piezas en el orden en que se le pidieron los ángulos, así que
 * "Tu SIEM registra. ¿Alguien lo lee?" quedó anotada como Firma Biométrica. Una
 * metadata que parece cierta y no lo es es peor que no tenerla: el próximo lote
 * lee esa lista para saber qué está gastado.
 *
 * Dos campos más en el JSON son unos diez tokens de salida por pieza. Sale más
 * barato que adivinar.
 */
/** La pieza sola, sin los dos campos que solo sirven para el historial. */
function sinContexto(idea: IdeaCruda): Opcion {
  const { linea: _linea, eje: _eje, ...pieza } = idea
  void _linea
  void _eje
  return pieza
}

function contextoDeIdeas(ideas: IdeaCruda[]): Map<string, { linea?: string; eje?: string }> {
  return new Map(
    ideas.map((idea) => [idea.headline, { linea: idea.linea || undefined, eje: idea.eje || undefined }])
  )
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
async function generarIdeas(
  canal: Canal,
  desde: number,
  /** Lo último escrito en el canal. Va al prompt, para que no salga una variante. */
  reciente: EntradaHistorial[],
  /** Los titulares del otro canal, para no repetirlos literalmente. */
  otroCanal: string[],
  /** TODAS las huellas, de los dos canales. Es el filtro: lo literal no vuelve. */
  usadas: Set<string>,
  /** Con qué composición se va a imprimir. Decide las reglas del titular. */
  tema: Tema
): Promise<IdeaCruda[]> {
  const resultados = await Promise.allSettled(
    tandasDelLote(desde).map((tanda) => pedirIdeas(canal, tanda, reciente, otroCanal, tema))
  )

  for (const r of resultados) {
    if (r.status === "rejected") console.error("[banco/lote tanda]", r.reason)
  }

  /*
   * Arranca con el historial ENTERO —los dos canales— más los titulares de
   * ejemplo de los patrones.
   *
   * Los ejemplos están en el prompt para mostrar la FORMA de cada patrón, y el
   * texto dice que no se copien; aun así volvieron tal cual más de una vez ("El
   * papel es opcional. La validez legal, no."). Una instrucción se puede
   * desobedecer, un `Set.has` no.
   *
   * Se copia el Set para no mutar el de quien llama.
   */
  const vistos = new Set([...usadas, ...PATRONES_HEADLINE.map((p) => claveTitular(p.ejemplo))])
  return resultados
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((idea) => {
      const clave = claveTitular(idea.headline)
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
    // El tamaño del lote lo define `PIEZAS_POR_LOTE` y no la suma de las tandas:
    // si algún día se reparten distinto, el banco no crece de a nueve sin que
    // nadie lo haya decidido.
    .slice(0, PIEZAS_POR_LOTE)
}

async function pedirIdeas(
  canal: Canal,
  tanda: Tanda,
  reciente: EntradaHistorial[],
  otroCanal: string[],
  tema: Tema
): Promise<IdeaCruda[]> {
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
        content: [
          /*
           * El brand kit va en su propio bloque y CACHEADO.
           *
           * Son 4.448 tokens que viajaban diez veces por lote —dos veces acá y
           * ocho en la redacción del copy— o sea 44.000 de los 77.000 tokens de
           * entrada: el 57% del gasto era el mismo texto una y otra vez.
           *
           * El caché es un prefijo: el bloque tiene que ir PRIMERO y no puede
           * cambiar un byte entre llamadas. Por eso está partido en dos bloques
           * y no interpolado en el texto de abajo — con el brief de la tanda
           * pegado adelante, cada llamada tendría un prefijo distinto y no
           * cachearía nunca. La primera escritura cuesta 1,25× y cada lectura
           * 0,1×; con las llamadas cayendo cada pocos segundos, el TTL de cinco
           * minutos se renueva solo.
           */
          {
            type: "text" as const,
            text: ACCEDRA_BRAND_CONTEXT,
            cache_control: { type: "ephemeral" as const },
          },
          {
            type: "text" as const,
            text: `Sos el director de marketing de Accedra. Generá ${cantidad} ideas de publicación para el banco de contenido.

CANAL: ${CANAL_LABEL[canal]}
${CANAL_BRIEF[canal]}

CÓMO ES ESTE LOTE — no es un calendario:
- Las ${cantidad} piezas son INDEPENDIENTES entre sí. Cada una se publica sola, sin depender de las otras, y no hay un orden. No escribas una serie ni una historia en capítulos.
- LAS LÍNEAS DE SERVICIO DE ESTA TANDA, y ninguna otra: ${tanda.lineas.join(" · ")}. Como máximo DOS piezas por línea.
- LOS ÁNGULOS DE ESTA TANDA. Una pieza por ángulo, en este orden, y desde ese ángulo y no otro:
${tanda.ejes.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}
  El ángulo NO es el tema: es desde dónde se lo mira. Una pieza de "Networking" con el ángulo "El error que comete el mercado" habla del error, no de que vendemos redes.
${
    tema === "claro"
      ? `- LA IMAGEN DE ESTAS PIEZAS ES UN OBJETO SOLO, centrado sobre un fondo claro de estudio. En el campo "imagen" nombrás QUÉ objeto y nada más — ni el encuadre, ni el fondo, ni los colores, ni la tipografía, que los pone el sistema. Nunca personas ni manos.\n`
      : ""
  }- NO ESCRIBAS FOLLETO. Estas piezas no anuncian lo que Accedra hace: hablan del problema, de la tecnología y del oficio, para alguien que decide sobre eso. El catálogo de arriba es la ÚNICA fuente de cifras, clientes, servicios y tecnologías —de ahí no se sale— pero la pieza no tiene por qué mencionar a Accedra ni a lo que vende. Se nota que sabemos por lo que decimos del tema, no por lo que decimos de nosotros.
- Reparto de objetivos, exacto: ${objetivos}.
- Audiencias: la mayoría a decisores técnicos o de negocio, y una o dos a corporativo/RH. Las etiquetas válidas son ${Object.entries(AUDIENCIA_LABEL).filter(([k]) => k !== "todos").map(([k, v]) => `"${k}" (${v})`).join(", ")}.
- Como máximo DOS piezas pueden usar el mismo "patron" de titular. Ocho titulares con la misma fórmula se leen como ocho veces el mismo posteo.

${tema === "claro" ? doctrinaHeadlineClaro(LINEA_MAX_CLARO, LINEA_MAX_CLARO_TOLERADA) : DOCTRINA_HEADLINE}

${TEST_RECHAZO}

LO QUE YA ESTÁ ESCRITO — no se repite NINGUNO, y no alcanza con cambiar las palabras.

Titulares de ejemplo, que muestran la FORMA de cada patrón y no el contenido:
${PATRONES_HEADLINE.map((p) => `· "${p.ejemplo}"`).join("\n")}
${
    reciente.length > 0
      ? `\nLO QUE YA SE PUBLICÓ EN ESTE CANAL. Cada línea es un tema AGOTADO — elegí otros:\n${reciente
          .map((o) => `· ${o.titulo}${o.eje ? ` [${o.eje}]` : ""} — "${o.headline}"`)
          .join("\n")}`
      : ""
  }

${
    otroCanal.length > 0
      ? `\nTITULARES QUE YA SALIERON EN LA OTRA RED. El TEMA se puede tocar —son públicos distintos— pero el titular literal no: si escribís sobre lo mismo, tiene que ser otra frase y desde otro ángulo.\n${otroCanal
          .map((h) => `· "${h}"`)
          .join("\n")}`
      : ""
  }

Se pide el TEMA distinto, no el titular distinto. "Tres proveedores, cero responsables" y "Más proveedores, menos responsables" son dos redacciones de la misma pieza: si el tema ya está en la lista de arriba, no lo escribas de nuevo con otras palabras — buscá otro problema, otro servicio, otra audiencia. Lo mismo con la puntuación: cambiarle un punto por una coma no hace un titular nuevo.

ANTES DEL TITULAR, LA TESIS. Cada pieza defiende una afirmación concreta, en una frase que alguien podría discutir. "La importancia de la ciberseguridad" NO es una tesis: nadie la discute y no se puede desarrollar. "El firewall perimetral no ve al atacante que ya entró con credenciales válidas" sí lo es. El titular es la versión impresa de la tesis.

Devolvé SOLO un JSON válido, sin markdown ni texto fuera del objeto:
{
  "piezas": [
    {
      "tesis": "La afirmación que defiende la pieza, en 1 frase discutible",
      ${
        tema === "claro"
          ? `"linea1": "la PRIMERA línea del titular impreso, hasta ${LINEA_MAX_CLARO} caracteres",
      "linea2": "la SEGUNDA línea, la que va en azul, hasta ${LINEA_MAX_CLARO} caracteres",
      "caracteres1": "cuántos caracteres tiene linea1. Si pasa de ${LINEA_MAX_CLARO_TOLERADA}, reescribí las dos",
      "caracteres2": "cuántos caracteres tiene linea2. Si pasa de ${LINEA_MAX_CLARO_TOLERADA}, reescribí las dos"`
          : `"headline": "EL TEXTO IMPRESO EN LA PIEZA. Máx ${HEADLINE_MAX_PALABRAS} palabras Y máx ${HEADLINE_MAX_CARACTERES} caracteres con espacios. Ver las reglas del titular más arriba",
      "caracteres": "cuántos caracteres tiene el titular que acabás de escribir, contando espacios y puntuación. Si te da más de ${HEADLINE_MAX_CARACTERES}, reescribilo antes de seguir"`
      },
      "patron": ${PATRONES_HEADLINE.map((p) => `"${p.id}"`).join(" | ")},
      "titulo": "Nombre interno de la pieza para la grilla, máx 8 palabras. NO es el titular impreso",
      "linea": "la línea de servicio de esta pieza, copiada de la lista de la tanda",
      "eje": "el nombre del ángulo con el que la escribiste, copiado tal cual del que te tocó (solo el nombre, sin los dos puntos ni la explicación)",
      "hook": "Primera línea del caption, la que frena el scroll, máx 15 palabras",
      "objetivo": "awareness | educacion | conversion",
      "audiencia": "decisores | negocio | corporativo",
      "angulo": "De qué trata el posteo: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas",
      ${
        tema === "claro"
          ? `"imagen": "EL SUJETO Y NADA MÁS. Un solo objeto físico, concreto y fotografiable, con el que se ilustra esta pieza: un switch con sus cables, una tableta de firma con su lápiz, un patchera de fibra, una notebook cerrada. Una frase.\n        NO describas la composición, ni el encuadre, ni dónde va ubicado, ni el fondo, ni los colores, ni la tipografía: de eso se encarga el sistema, que lo va a poner centrado sobre un barrido claro. Vos elegís QUÉ se fotografía.\n        SIN PERSONAS y sin manos: el objeto solo. Sin pantallas encendidas ni nada que muestre texto."`
          : `"imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto propia o placa. 2 frases"`
      },
      "porQue": "Por qué esta idea, en 1 frase: qué busca y a quién le habla"
    }
  ]
}

Exactamente ${cantidad} piezas.`,
          },
        ],
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
    .flatMap((p): IdeaCruda[] => {
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
          /* En claro el titular llega partido en dos y se guarda UNIDO: el
             titular es uno solo, y `armarTitularClaro` lo vuelve a partir al
             componer. Guardarlo en dos campos lo ataría a esta composición. */
          headline: limpiarTitular(
            tema === "claro"
              ? [o.linea1, o.linea2].filter((x) => typeof x === "string").join(" ")
              : typeof o.headline === "string"
                ? o.headline
                : ""
          ).slice(0, 200),
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
          // De qué habló y desde dónde. No es contenido de la pieza: es lo que
          // el historial le va a decir al próximo lote que ya está gastado.
          linea: typeof o.linea === "string" ? o.linea.slice(0, 60) : "",
          eje: typeof o.eje === "string" ? o.eje.slice(0, 60) : "",
        },
      ]
    })
}
