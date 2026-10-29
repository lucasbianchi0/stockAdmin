/**
 * Agente de Google Ads — lunes.
 *
 * Mira la semana contra la anterior y los términos de búsqueda, y propone
 * cambios. Sólo propone: no toca la cuenta. Lo que se aprueba se aplica a mano
 * (o pidiéndoselo a Claude con el MCP) y se carga en Versiones de Ads, que es
 * donde queda el porqué de cada cambio.
 *
 * Si el token de Google está vencido —pasa cada siete días mientras la app de
 * OAuth siga en "Testing"— la corrida falla en rojo en el Calendario en vez de
 * entregar un análisis sin datos.
 */
import { supabase } from "@/lib/supabase"
import { campanasEnVivo, terminosDeBusqueda } from "@/lib/marketing/ads-server"
import { comoLineas, pedir, semanas, type Entrega } from "./comun"

type Cambio = { tipo: string; titulo: string; campana: string; detalle: string; dato: string }

const ESQUEMA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description: "Cómo anduvo la semana contra la anterior, en markdown corto: gasto, clics, conversiones y lo que llama la atención.",
    },
    cambios: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["negativas", "keywords", "presupuesto", "puja", "anuncio", "segmentacion", "estado", "medicion"],
          },
          titulo: { type: "string", description: "El cambio en una línea: \"Negativa de frase: gde\"." },
          campana: { type: "string", description: "La campaña a la que aplica, o \"Todas\"." },
          detalle: { type: "string", description: "Qué hacer exactamente (las palabras, los montos)." },
          dato: { type: "string", description: "El número que lo justifica: \"14 clics, $9.800, 0 conversiones\"." },
        },
        required: ["tipo", "titulo", "campana", "detalle", "dato"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "cambios"],
  additionalProperties: false,
}

export async function ads(): Promise<Entrega> {
  const { actual, anterior } = semanas()

  const [estaSemana, semanaPasada, terminos] = await Promise.all([
    campanasEnVivo(actual.desde, actual.hasta),
    campanasEnVivo(anterior.desde, anterior.hasta),
    terminosDeBusqueda(actual.desde, actual.hasta, 200),
  ])

  // Sin la API no hay términos de búsqueda, y sin ellos este agente no tiene
  // nada útil que decir: mejor fallar y que se vea.
  if (!estaSemana.ok) throw new Error(`Google Ads: ${estaSemana.detalle}`)
  if (!terminos.ok) throw new Error(`Google Ads: ${terminos.detalle}`)

  // Los últimos cambios aplicados, para no proponer de nuevo lo que ya se hizo
  // ni revertir algo que todavía está en prueba.
  const { data: versiones } = await supabase
    .from("ads_versiones")
    .select("numero, fecha, titulo, resumen, estado, revisar_el")
    .order("fecha", { ascending: false })
    .limit(6)

  const fila = (c: { nombre: string; estado: string; impresiones: number; clics: number; coste: number; conversiones: number }) => ({
    campana: c.nombre,
    estado: c.estado,
    impresiones: c.impresiones,
    clics: c.clics,
    coste: Math.round(c.coste),
    conv: c.conversiones,
  })

  const pedido = `Revisá la semana de Google Ads de Accedra y proponé hasta 6 cambios concretos. Importes en ARS.

Prioridades, en este orden:
1. Términos de búsqueda que gastan sin convertir y no son de empresas que compran firma biométrica → negativas (decí si de frase o exacta).
2. Términos buenos que convierten y no son keyword → sumarlos.
3. Presupuesto o pujas sólo si los números lo piden claramente.
No propongas nada que contradiga una versión que todavía está en prueba (estado en_curso con revisar_el en el futuro). Si la semana no da para cambiar nada, devolvé la lista vacía y decilo en el resumen.

CAMPAÑAS ${actual.desde} a ${actual.hasta}:
${comoLineas(estaSemana.campanas.map(fila))}

CAMPAÑAS SEMANA ANTERIOR ${anterior.desde} a ${anterior.hasta}:
${comoLineas(semanaPasada.campanas.map(fila))}

TÉRMINOS DE BÚSQUEDA DE LA SEMANA (por gasto):
${comoLineas(terminos.terminos.map((t) => ({ ...t, coste: Math.round(t.coste) })), 200)}

ÚLTIMAS VERSIONES APLICADAS:
${comoLineas(versiones ?? [])}`

  const r = await pedir<{ resumen: string; cambios: Cambio[] }>(pedido, ESQUEMA)

  return {
    titulo: `Google Ads · semana del ${actual.desde}`,
    resumen: r.resumen,
    propuestas: r.cambios.map((c) => ({
      titulo: c.titulo,
      detalle: c.detalle,
      tipo: c.tipo,
      campana: c.campana,
      dato: c.dato,
    })),
    fuentes: {
      Campañas: `${estaSemana.campanas.length} campañas`,
      "Términos de búsqueda": `${terminos.terminos.length} términos`,
    },
    detalle: r.cambios.length ? `${r.cambios.length} cambios propuestos` : "Sin cambios para proponer",
  }
}
