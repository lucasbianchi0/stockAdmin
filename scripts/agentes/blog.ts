/**
 * Agente del blog — domingos.
 *
 * No redacta: trae tres notas para elegir (una guía, una nota y un caso), cada
 * una con su keyword, para quién es y el índice. La que se aprueba en Agentes
 * nace como borrador en Marketing → Notas. Redactar sin que alguien haya
 * elegido el tema es la forma más rápida de llenar /recursos de contenido flojo,
 * que es justo lo que Google castiga a nivel sitio.
 */
import { supabase } from "@/lib/supabase"
import { CATEGORIAS, TIPOS } from "@/lib/marketing/notas"
import { terminosDeBusqueda } from "@/lib/marketing/ads-server"
import { comoLineas, diaArgentina, pedir, type Entrega } from "./comun"

type Idea = {
  tipo: string
  titulo: string
  categoria: string
  keyword: string
  intencion: string
  resumen: string
  puntos: string[]
  porQue: string
}

const ESQUEMA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description: "Dos o tres oraciones: qué falta hoy en /recursos y por qué estas tres notas.",
    },
    notas: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: [...TIPOS], description: "Una de cada: guia, nota y caso." },
          titulo: { type: "string", description: "Título de la nota, 60 caracteres o menos." },
          categoria: { type: "string", enum: [...CATEGORIAS] },
          keyword: { type: "string", description: "La búsqueda principal que tiene que ganar." },
          intencion: { type: "string", description: "Quién la busca y qué quiere resolver, en una oración." },
          resumen: { type: "string", description: "Meta description, 155 caracteres o menos." },
          puntos: {
            type: "array",
            items: { type: "string" },
            description: "Los subtítulos (##) de la nota, en orden. Entre 4 y 7.",
          },
          porQue: {
            type: "string",
            description: "Por qué esta y no otra: el dato que la respalda (un término de Ads, un hueco en lo publicado).",
          },
        },
        required: ["tipo", "titulo", "categoria", "keyword", "intencion", "resumen", "puntos", "porQue"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "notas"],
  additionalProperties: false,
}

export async function blog(): Promise<Entrega> {
  const fuentes: Record<string, string> = {}

  const { data: notas, error } = await supabase
    .from("notas")
    .select("titulo, tipo, categoria, publicado")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron leer las notas: ${error.message}`)
  fuentes["Notas"] = `${notas?.length ?? 0} leídas`

  // Lo que ya propuso en las últimas ocho semanas, aprobado o no: proponer lo
  // mismo cada domingo es la forma de que dejen de mirarlo.
  const { data: previos } = await supabase
    .from("agentes_trabajos")
    .select("propuestas")
    .eq("clave", "agente-blog")
    .gte("created_at", new Date(Date.now() - 56 * 86_400_000).toISOString())
  const yaPropuestas = (previos ?? []).flatMap((t) =>
    (Array.isArray(t.propuestas) ? t.propuestas : []).map(
      (p: { titulo?: string; estado?: string }) => `${p.titulo} (${p.estado})`
    )
  )

  // Un mes de búsquedas reales. Si Ads no contesta, se propone igual: las
  // notas existentes alcanzan para ver los huecos.
  const ads = await terminosDeBusqueda(diaArgentina(30), diaArgentina(1), 120)
  fuentes["Ads"] = ads.ok ? `${ads.terminos.length} términos de búsqueda` : ads.detalle

  const pedido = `Proponé las tres próximas notas para /recursos, el blog de Accedra: exactamente una "guia" (larga, de referencia), una "nota" (un tema puntual) y un "caso" (cómo lo resuelve un tipo de empresa).

Criterios:
- Que una empresa que la lea pueda terminar pidiendo una demo de firma biométrica. Al menos dos de las tres tienen que ser de firma biométrica / firma electrónica para empresas.
- Que no se pise con nada de lo ya publicado ni con lo ya propuesto (canibalización).
- Apoyate en los términos de búsqueda reales de Ads cuando haya: un término con clics o conversiones es un tema que la gente busca. Ignorá los de trámites personales.

NOTAS QUE YA EXISTEN (título · tipo · categoría · publicada):
${(notas ?? []).map((n) => `- ${n.titulo} · ${n.tipo} · ${n.categoria ?? "-"} · ${n.publicado ? "sí" : "borrador"}`).join("\n") || "(ninguna todavía)"}

YA PROPUESTAS EN LAS ÚLTIMAS SEMANAS:
${yaPropuestas.map((t) => `- ${t}`).join("\n") || "(ninguna)"}

TÉRMINOS DE BÚSQUEDA DE ADS, ÚLTIMOS 30 DÍAS (coste en ARS):
${ads.ok ? comoLineas(ads.terminos.map((t) => ({ termino: t.termino, clics: t.clics, coste: Math.round(t.coste), conv: t.conversiones })), 120) : "(no disponibles esta semana)"}`

  const r = await pedir<{ resumen: string; notas: Idea[] }>(pedido, ESQUEMA)

  return {
    titulo: `Tres notas para la semana del ${diaArgentina(-1)}`,
    resumen: r.resumen,
    propuestas: r.notas.map((n) => ({
      titulo: n.titulo,
      detalle: n.resumen,
      tipo: n.tipo,
      categoria: n.categoria,
      keyword: n.keyword,
      intencion: n.intencion,
      puntos: n.puntos,
      porQue: n.porQue,
    })),
    fuentes,
    detalle: `${r.notas.length} notas propuestas`,
  }
}
