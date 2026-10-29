/**
 * Informe semanal de marketing — lunes.
 *
 * Todas las fuentes de la semana en un solo texto, comparadas con la anterior,
 * y tres acciones. No reemplaza al informe mensual en PDF: es la lectura de los
 * lunes, para que nada se descubra recién a fin de mes.
 *
 * Cada fuente que falla se anota y se sigue: un informe sin Ads sigue sirviendo,
 * uno que no sale porque Google venció el token no.
 */
import { supabase } from "@/lib/supabase"
import { campanasEnVivo } from "@/lib/marketing/ads-server"
import { pedir, semanas, sumar, type Entrega } from "./comun"

type Accion = { titulo: string; detalle: string }

const ESQUEMA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description:
        "El informe en markdown: una sección (###) por fuente con los números de las dos semanas y la variación, y al final \"Lo importante\" en dos o tres oraciones. Si una fuente no tiene datos, decirlo en una línea.",
    },
    acciones: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "La acción en una línea, empezando con un verbo." },
          detalle: { type: "string", description: "Por qué, con el dato, y cómo saber si funcionó." },
        },
        required: ["titulo", "detalle"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "acciones"],
  additionalProperties: false,
}

type Semana = { desde: string; hasta: string }

async function leads(s: Semana) {
  const { data, error } = await supabase
    .from("leads")
    .select("created_at, status, utm_source, gclid")
    .gte("created_at", `${s.desde}T03:00:00Z`)
    .lt("created_at", `${s.hasta}T23:59:59-03:00`)
  if (error) return { error: error.message }
  const filas = data ?? []
  const porOrigen: Record<string, number> = {}
  for (const l of filas) {
    const origen = l.gclid ? "google-ads" : String(l.utm_source || "directo")
    porOrigen[origen] = (porOrigen[origen] ?? 0) + 1
  }
  const porEstado: Record<string, number> = {}
  for (const l of filas) porEstado[String(l.status ?? "-")] = (porEstado[String(l.status ?? "-")] ?? 0) + 1
  return { total: filas.length, porOrigen, porEstado }
}

async function linkedin(s: Semana) {
  const { data, error } = await supabase
    .from("linkedin_dias")
    .select("impresiones, clics, reacciones, seguidores_nuevos, vistas_pagina")
    .gte("fecha", s.desde)
    .lte("fecha", s.hasta)
  if (error) return { error: error.message }
  const f = data ?? []
  if (f.length === 0) return { sinDatos: true }
  return {
    impresiones: sumar(f, "impresiones"),
    clics: sumar(f, "clics"),
    reacciones: sumar(f, "reacciones"),
    seguidores_nuevos: sumar(f, "seguidores_nuevos"),
    vistas_pagina: sumar(f, "vistas_pagina"),
  }
}

async function meta(s: Semana) {
  const { data, error } = await supabase
    .from("redes_dias")
    .select("red, alcance, vistas, interacciones, seguidores_nuevos")
    .gte("fecha", s.desde)
    .lte("fecha", s.hasta)
  if (error) return { error: error.message }
  const salida: Record<string, unknown> = {}
  for (const red of ["instagram", "facebook"]) {
    const f = (data ?? []).filter((d) => d.red === red)
    salida[red] = f.length
      ? { alcance: sumar(f, "alcance"), vistas: sumar(f, "vistas"), interacciones: sumar(f, "interacciones"), seguidores_nuevos: sumar(f, "seguidores_nuevos") }
      : { sinDatos: true }
  }
  return salida
}

async function blog(s: Semana) {
  const { data, error } = await supabase
    .from("notas")
    .select("titulo")
    .eq("publicado", true)
    .gte("publicado_en", `${s.desde}T03:00:00Z`)
    .lt("publicado_en", `${s.hasta}T23:59:59-03:00`)
  if (error) return { error: error.message }
  return { publicadas: (data ?? []).map((n) => n.titulo) }
}

async function googleAds(s: Semana) {
  const r = await campanasEnVivo(s.desde, s.hasta)
  if (!r.ok) return { error: r.detalle }
  return {
    coste: Math.round(sumar(r.campanas, "coste")),
    clics: sumar(r.campanas, "clics"),
    impresiones: sumar(r.campanas, "impresiones"),
    conversiones: sumar(r.campanas, "conversiones"),
    campanas: r.campanas.map((c) => ({ campana: c.nombre, coste: Math.round(c.coste), clics: c.clics, conv: c.conversiones })),
  }
}

export async function informe(): Promise<Entrega> {
  const { actual, anterior } = semanas()

  const datos = Object.fromEntries(
    await Promise.all(
      (
        [
          ["Google Ads", googleAds],
          ["Leads", leads],
          ["LinkedIn", linkedin],
          ["Instagram y Facebook", meta],
          ["Blog", blog],
        ] as const
      ).map(async ([nombre, leer]) => [nombre, { actual: await leer(actual), anterior: await leer(anterior) }] as const)
    )
  )

  const fuentes: Record<string, string> = {}
  for (const [nombre, d] of Object.entries(datos)) {
    const error = (d.actual as { error?: string }).error
    fuentes[nombre] = error ? error : "ok"
  }

  const pedido = `Armá el informe semanal de marketing de Accedra: semana actual ${actual.desde} a ${actual.hasta} contra la anterior ${anterior.desde} a ${anterior.hasta}. Importes en ARS. Después, las tres acciones más importantes para esta semana, ordenadas por impacto en leads de firma biométrica.

DATOS (por fuente: actual y anterior; "error" = no se pudo leer, "sinDatos" = la fuente no tiene números para ese período):
${JSON.stringify(datos, null, 1)}`

  const r = await pedir<{ resumen: string; acciones: Accion[] }>(pedido, ESQUEMA)

  return {
    titulo: `Semana del ${actual.desde} al ${actual.hasta}`,
    resumen: r.resumen,
    propuestas: r.acciones.map((a) => ({ titulo: a.titulo, detalle: a.detalle })),
    fuentes,
    detalle: `Informe listo · ${Object.values(fuentes).filter((v) => v === "ok").length}/${Object.keys(fuentes).length} fuentes`,
  }
}
