/**
 * Agente de redes — miércoles.
 *
 * LinkedIn, Instagram y Facebook juntas: qué funcionó en el último mes y tres
 * posts para esta semana, apoyados en las notas recientes del blog. Los posts
 * quedan en Agentes para copiar; la imagen de Instagram se arma aparte, con el
 * sistema del feed, porque un texto no alcanza para respetar el damero.
 */
import { supabase } from "@/lib/supabase"
import { comoLineas, diaArgentina, pedir, semanas, sumar, type Entrega } from "./comun"

type Post = { red: string; titulo: string; texto: string; ideaVisual: string; porQue: string }

const ESQUEMA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description: "Cómo anduvo cada red la última semana contra la anterior y qué tipo de publicación funcionó, en markdown corto.",
    },
    posts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          red: { type: "string", enum: ["linkedin", "instagram", "facebook"] },
          titulo: { type: "string", description: "De qué trata, en pocas palabras." },
          texto: { type: "string", description: "El texto completo del post, listo para pegar, con hashtags si van." },
          ideaVisual: { type: "string", description: "Qué imagen o carrusel lo acompaña, en una o dos oraciones." },
          porQue: { type: "string", description: "Qué dato de las métricas lo respalda." },
        },
        required: ["red", "titulo", "texto", "ideaVisual", "porQue"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "posts"],
  additionalProperties: false,
}

export async function redes(): Promise<Entrega> {
  const { actual, anterior } = semanas()
  const desdeMes = diaArgentina(30)
  const fuentes: Record<string, string> = {}

  const [liDias, liPosts, metaDias, metaPosts, notas] = await Promise.all([
    supabase
      .from("linkedin_dias")
      .select("fecha, impresiones, clics, reacciones, comentarios, compartidos, seguidores_nuevos, vistas_pagina")
      .gte("fecha", anterior.desde)
      .lte("fecha", actual.hasta),
    supabase
      .from("linkedin_publicaciones")
      .select("fecha, titulo, tipo, impresiones, clics, reacciones, comentarios, tasa_interaccion")
      .gte("fecha", desdeMes)
      .order("fecha", { ascending: false }),
    supabase
      .from("redes_dias")
      .select("red, fecha, alcance, vistas, interacciones, seguidores_nuevos")
      .gte("fecha", anterior.desde)
      .lte("fecha", actual.hasta),
    supabase
      .from("redes_publicaciones")
      .select("red, fecha, tipo, texto, alcance, vistas, interacciones, guardados")
      .gte("fecha", desdeMes)
      .order("fecha", { ascending: false }),
    supabase
      .from("notas")
      .select("titulo, slug, resumen, publicado_en")
      .eq("publicado", true)
      .order("publicado_en", { ascending: false })
      .limit(6),
  ])

  // Cada red puede faltar (Instagram todavía no está vinculado): se anota y
  // se sigue con las que haya.
  const enSemana = <T extends { fecha: string }>(filas: T[], s: { desde: string; hasta: string }) =>
    filas.filter((f) => f.fecha >= s.desde && f.fecha <= s.hasta)

  const li = liDias.data ?? []
  fuentes["LinkedIn"] = liDias.error ? liDias.error.message : `${li.length} días, ${liPosts.data?.length ?? 0} publicaciones`
  const meta = metaDias.data ?? []
  fuentes["Instagram y Facebook"] = metaDias.error
    ? metaDias.error.message
    : `${meta.length} días, ${metaPosts.data?.length ?? 0} publicaciones`

  const resumenLi = (s: { desde: string; hasta: string }) => {
    const f = enSemana(li, s)
    return { impresiones: sumar(f, "impresiones"), clics: sumar(f, "clics"), reacciones: sumar(f, "reacciones"), seguidores_nuevos: sumar(f, "seguidores_nuevos") }
  }
  const resumenMeta = (red: string, s: { desde: string; hasta: string }) => {
    const f = enSemana(meta.filter((m) => m.red === red), s)
    return { alcance: sumar(f, "alcance"), vistas: sumar(f, "vistas"), interacciones: sumar(f, "interacciones"), seguidores_nuevos: sumar(f, "seguidores_nuevos") }
  }

  const pedido = `Analizá las redes de Accedra y proponé tres posts para esta semana: uno para LinkedIn seguro (es la red B2B que más importa), los otros dos donde rindan más según los datos. Si hay notas recientes del blog, al menos uno tiene que llevar a una (link a https://www.accedra.com.ar/recursos/<slug>).

TOTALES POR SEMANA (actual ${actual.desde} a ${actual.hasta} / anterior ${anterior.desde} a ${anterior.hasta}):
LinkedIn: ${JSON.stringify(resumenLi(actual))} / ${JSON.stringify(resumenLi(anterior))}
Instagram: ${JSON.stringify(resumenMeta("instagram", actual))} / ${JSON.stringify(resumenMeta("instagram", anterior))}
Facebook: ${JSON.stringify(resumenMeta("facebook", actual))} / ${JSON.stringify(resumenMeta("facebook", anterior))}

PUBLICACIONES DE LINKEDIN DEL ÚLTIMO MES:
${comoLineas((liPosts.data ?? []).map((p) => ({ ...p, titulo: String(p.titulo ?? "").slice(0, 120) })), 30)}

PUBLICACIONES DE INSTAGRAM Y FACEBOOK DEL ÚLTIMO MES:
${comoLineas((metaPosts.data ?? []).map((p) => ({ ...p, texto: String(p.texto ?? "").slice(0, 120) })), 30)}

NOTAS RECIENTES DEL BLOG:
${comoLineas(notas.data ?? [], 6)}`

  const r = await pedir<{ resumen: string; posts: Post[] }>(pedido, ESQUEMA)

  return {
    titulo: `Redes · semana del ${actual.desde}`,
    resumen: r.resumen,
    propuestas: r.posts.map((p) => ({
      titulo: p.titulo,
      detalle: p.porQue,
      red: p.red,
      texto: p.texto,
      ideaVisual: p.ideaVisual,
    })),
    fuentes,
    detalle: `${r.posts.length} posts propuestos`,
  }
}
