import { supabase } from "@/lib/supabase"
import { normalizarCabecera } from "@/lib/admin/importar-csv"
import { ArchivoInvalido } from "@/lib/admin/xlsx"
import type { Hoja } from "@/lib/admin/xls"
import {
  TIPOS_CARGA,
  type Carga,
  type DiaLinkedin,
  type Demografia,
  type Publicacion,
  type ResultadosLinkedin,
  type TipoCarga,
  type TotalesLinkedin,
} from "@/lib/marketing/linkedin"

/* ══════════════════════════════════════════════════════════════════════════
   Importar
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Las columnas, por su encabezado normalizado, en castellano y en inglés.
 *
 * El idioma del export es el de la cuenta de quien lo baja, no el de la
 * página: si alguien con LinkedIn en inglés exporta, los encabezados cambian y
 * la importación no puede romperse por eso.
 */
const COL = {
  fecha: ["fecha", "date"],
  impresiones: ["impresiones totales", "impressions total"],
  impresiones_pagas: ["impresiones patrocinadas", "impressions sponsored"],
  impresiones_unicas: ["impresiones unicas organicas", "unique impressions organic"],
  clics: ["clics totales", "clicks total"],
  reacciones: ["reacciones total", "reactions total"],
  comentarios: ["comentarios totales", "comments total"],
  compartidos: ["veces compartido total", "reposts total", "shares total"],
  seguidores_pagos: ["seguidores patrocinados", "sponsored followers"],
  seguidores_nuevos: ["total de seguidores", "total followers"],
  vistas_pagina: ["visualizaciones de la pagina en total total", "total page views total"],
  visitantes_unicos: ["visitantes unicos en total total", "total unique visitors total"],
  // Hoja de publicaciones
  titulo: ["titulo de la publicacion", "post title"],
  url: ["enlace de la publicacion", "post link"],
  tipo: ["tipo de publicacion", "post type"],
  autor: ["anunciado por", "posted by"],
  creada: ["fecha de creacion", "created date"],
  p_impresiones: ["impresiones", "impressions"],
  p_vistas: ["visualizaciones", "views"],
  p_clics: ["clics", "clicks"],
  p_reacciones: ["recomendaciones", "reacciones", "likes", "reactions"],
  p_comentarios: ["comentarios", "comments"],
  p_compartidos: ["veces compartido", "reposts", "shares"],
  p_seguidores: ["seguidores", "follows"],
  p_tasa: ["tasa de interaccion", "engagement rate"],
  p_contenido: ["tipo de contenido", "content type"],
} as const

type Columna = keyof typeof COL

/** Encabezados → índice, buscando la fila de encabezados entre las primeras. */
function tabla(hoja: Hoja, ancla: Columna): { idx: Partial<Record<Columna, number>>; datos: string[][] } | null {
  // El export de Contenido trae una fila de título arriba de los encabezados.
  for (let f = 0; f < Math.min(5, hoja.filas.length); f++) {
    const cabeceras = hoja.filas[f].map(normalizarCabecera)
    if (!cabeceras.some((c) => (COL[ancla] as readonly string[]).includes(c))) continue

    const idx: Partial<Record<Columna, number>> = {}
    for (const clave of Object.keys(COL) as Columna[]) {
      const i = cabeceras.findIndex((c) => (COL[clave] as readonly string[]).includes(c))
      if (i >= 0) idx[clave] = i
    }
    return { idx, datos: hoja.filas.slice(f + 1).filter((r) => r.some((c) => c.trim() !== "")) }
  }
  return null
}

/** LinkedIn escribe las fechas como texto "MM/DD/YYYY", en UTC. */
function fechaIso(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim())
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
}

function entero(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === "") return null
  const n = Number(texto)
  return Number.isFinite(n) ? Math.round(n) : null
}

function decimal(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === "") return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

/** Qué export es, por las hojas que trae y no por el nombre del archivo, que el navegador puede cambiar. */
function tipoDe(hojas: Hoja[]): TipoCarga {
  const primera = hojas[0] ? tabla(hojas[0], "fecha") : null
  if (primera?.idx.impresiones !== undefined) return "contenido"
  if (primera?.idx.vistas_pagina !== undefined) return "visitantes"
  if (primera?.idx.seguidores_nuevos !== undefined) return "seguidores"
  throw new ArchivoInvalido(
    "No parece un export de la analítica de LinkedIn (Contenido, Seguidores o Visitantes)"
  )
}

type FilaDia = Record<string, string | number | null>

/**
 * Guarda un export. Cada tipo escribe sólo sus columnas de `linkedin_dias`: el
 * upsert de PostgREST actualiza las columnas que recibe y deja las demás, así
 * que cargar Seguidores no borra las impresiones que ya había puesto Contenido.
 */
export async function importarExport(
  hojas: Hoja[],
  archivo: string,
  cargadoPor: string | null
): Promise<{ tipo: TipoCarga; desde: string | null; hasta: string | null; filas: number }> {
  const tipo = tipoDe(hojas)
  const diaria = tabla(hojas[0], "fecha")!

  const campos: Columna[] =
    tipo === "contenido"
      ? ["impresiones", "impresiones_pagas", "impresiones_unicas", "clics", "reacciones", "comentarios", "compartidos"]
      : tipo === "seguidores"
        ? ["seguidores_nuevos", "seguidores_pagos"]
        : ["vistas_pagina", "visitantes_unicos"]

  const ahora = new Date().toISOString()
  const dias: FilaDia[] = []
  for (const r of diaria.datos) {
    const fecha = fechaIso(r[diaria.idx.fecha!] ?? "")
    if (!fecha) continue
    const fila: FilaDia = { fecha, actualizado_en: ahora }
    for (const c of campos) fila[c] = diaria.idx[c] === undefined ? null : entero(r[diaria.idx[c]!])
    dias.push(fila)
  }
  if (dias.length === 0) throw new ArchivoInvalido(`El export de ${tipo} no trae ningún día`)

  const { error: e1 } = await supabase.from("linkedin_dias").upsert(dias, { onConflict: "fecha" })
  if (e1) throw e1

  if (tipo === "contenido") await guardarPublicaciones(hojas, ahora)
  else await guardarDemografia(tipo, hojas.slice(1))

  const fechas = dias.map((d) => d.fecha as string).sort()
  const carga = {
    tipo,
    archivo,
    cargado_por: cargadoPor,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
    filas: dias.length,
  }
  const { error: e2 } = await supabase.from("linkedin_cargas").insert(carga)
  if (e2) throw e2

  return { tipo, desde: carga.desde, hasta: carga.hasta, filas: carga.filas }
}

/**
 * Las métricas de cada publicación son acumuladas a la fecha del export, así
 * que se pisan: la última carga es la que vale.
 */
async function guardarPublicaciones(hojas: Hoja[], ahora: string) {
  const hoja = hojas.find((h) => tabla(h, "url")?.idx.url !== undefined)
  if (!hoja) return
  const { idx, datos } = tabla(hoja, "url")!
  const celda = (r: string[], c: Columna) => (idx[c] === undefined ? undefined : r[idx[c]!])

  const filas = datos
    .map((r) => ({
      url: (celda(r, "url") ?? "").trim(),
      titulo: celda(r, "titulo")?.trim() || null,
      fecha: fechaIso(celda(r, "creada") ?? ""),
      tipo: celda(r, "tipo")?.trim() || null,
      autor: celda(r, "autor")?.trim() || null,
      contenido: celda(r, "p_contenido")?.trim() || null,
      impresiones: entero(celda(r, "p_impresiones")),
      vistas: entero(celda(r, "p_vistas")),
      clics: entero(celda(r, "p_clics")),
      reacciones: entero(celda(r, "p_reacciones")),
      comentarios: entero(celda(r, "p_comentarios")),
      compartidos: entero(celda(r, "p_compartidos")),
      seguidores: entero(celda(r, "p_seguidores")),
      tasa_interaccion: decimal(celda(r, "p_tasa")),
      actualizado_en: ahora,
    }))
    .filter((f) => f.url.startsWith("http"))

  if (filas.length === 0) return
  const { error } = await supabase.from("linkedin_publicaciones").upsert(filas, { onConflict: "url" })
  if (error) throw error
}

/** Cada hoja de dos columnas (Ubicación, Sector…) es una dimensión. Reemplaza la foto anterior. */
async function guardarDemografia(fuente: "seguidores" | "visitantes", hojas: Hoja[]) {
  const filas: { fuente: string; dimension: string; valor: string; total: number }[] = []
  for (const h of hojas) {
    for (const r of h.filas.slice(1)) {
      const valor = (r[0] ?? "").trim()
      const total = entero(r[1])
      if (valor && total !== null) filas.push({ fuente, dimension: h.nombre, valor, total })
    }
  }
  if (filas.length === 0) return

  const { error: e1 } = await supabase.from("linkedin_demografia").delete().eq("fuente", fuente)
  if (e1) throw e1
  const { error: e2 } = await supabase.from("linkedin_demografia").insert(filas)
  if (e2) throw e2
}

/* ══════════════════════════════════════════════════════════════════════════
   Leer
   ══════════════════════════════════════════════════════════════════════════ */

const COLUMNAS_TOTALES = [
  "impresiones",
  "impresiones_pagas",
  "clics",
  "reacciones",
  "comentarios",
  "compartidos",
  "seguidores_nuevos",
  "vistas_pagina",
  "visitantes_unicos",
] as const

type FilaLeida = { fecha: string } & Record<(typeof COLUMNAS_TOTALES)[number], number | null>

function sumar(filas: FilaLeida[]): TotalesLinkedin {
  const t = Object.fromEntries(COLUMNAS_TOTALES.map((c) => [c, 0])) as TotalesLinkedin
  for (const f of filas) for (const c of COLUMNAS_TOTALES) t[c] += f[c] ?? 0
  return t
}

async function diasEntre(desde: string, hasta: string): Promise<FilaLeida[]> {
  const { data, error } = await supabase
    .from("linkedin_dias")
    .select(`fecha, ${COLUMNAS_TOTALES.join(", ")}`)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
  if (error) throw error
  return (data ?? []) as unknown as FilaLeida[]
}

export async function linkedinDelPeriodo(
  rango: { desde: string; hasta: string },
  previo: { desde: string; hasta: string }
): Promise<ResultadosLinkedin> {
  const [dias, diasPrevios, publicaciones, demografia, cargas, hasta] = await Promise.all([
    diasEntre(rango.desde, rango.hasta),
    diasEntre(previo.desde, previo.hasta),
    supabase
      .from("linkedin_publicaciones")
      .select(
        "url, titulo, fecha, tipo, autor, contenido, impresiones, vistas, clics, reacciones, comentarios, compartidos, tasa_interaccion"
      )
      .gte("fecha", rango.desde)
      .lte("fecha", rango.hasta)
      .order("fecha", { ascending: false }),
    supabase.from("linkedin_demografia").select("dimension, valor, total").eq("fuente", "seguidores"),
    supabase
      .from("linkedin_cargas")
      .select("tipo, archivo, cargado_en, cargado_por, desde, hasta, filas")
      .order("cargado_en", { ascending: false })
      .limit(30),
    ultimosDias(),
  ])
  for (const r of [publicaciones, demografia, cargas]) if (r.error) throw r.error

  const ultimas: ResultadosLinkedin["cargas"] = {}
  for (const c of (cargas.data ?? []) as Carga[]) ultimas[c.tipo] ??= c

  const serie: DiaLinkedin[] = dias
    .filter((d) => d.impresiones !== null || d.seguidores_nuevos !== null)
    .map((d) => ({ dia: d.fecha, impresiones: d.impresiones ?? 0, seguidores: d.seguidores_nuevos ?? 0 }))

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    cargas: ultimas,
    datosHasta: hasta,
    totales: sumar(dias),
    anterior: sumar(diasPrevios),
    serie,
    publicaciones: ((publicaciones.data ?? []) as Publicacion[]).map((p) => ({
      ...p,
      impresiones: p.impresiones ?? 0,
      clics: p.clics ?? 0,
      reacciones: p.reacciones ?? 0,
      comentarios: p.comentarios ?? 0,
      compartidos: p.compartidos ?? 0,
      tasa_interaccion: p.tasa_interaccion === null ? null : Number(p.tasa_interaccion),
    })),
    demografia: agrupar((demografia.data ?? []) as { dimension: string; valor: string; total: number }[]),
  }
}

/** El último día con datos de cada export: una columna de cada uno alcanza para saberlo. */
async function ultimosDias(): Promise<ResultadosLinkedin["datosHasta"]> {
  const testigo: Record<TipoCarga, string> = {
    contenido: "impresiones",
    seguidores: "seguidores_nuevos",
    visitantes: "vistas_pagina",
  }
  const res = await Promise.all(
    TIPOS_CARGA.map((t) =>
      supabase
        .from("linkedin_dias")
        .select("fecha")
        .not(testigo[t], "is", null)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  )
  const salida: ResultadosLinkedin["datosHasta"] = {}
  TIPOS_CARGA.forEach((t, i) => {
    if (res[i].error) throw res[i].error
    const fecha = (res[i].data as { fecha: string } | null)?.fecha
    if (fecha) salida[t] = fecha
  })
  return salida
}

/** Las dimensiones en un orden fijo —las que dicen a quién le habla la página primero— y el resto detrás. */
const ORDEN_DIMENSIONES = ["Sector", "Función laboral", "Nivel de responsabilidad", "Tamaño de la empresa", "Ubicación"]

function agrupar(filas: { dimension: string; valor: string; total: number }[]): Demografia[] {
  const mapa = new Map<string, { clave: string; valor: number }[]>()
  for (const f of filas) {
    const lista = mapa.get(f.dimension) ?? []
    lista.push({ clave: f.valor, valor: f.total })
    mapa.set(f.dimension, lista)
  }
  const pos = (d: string) => {
    const i = ORDEN_DIMENSIONES.indexOf(d)
    return i < 0 ? ORDEN_DIMENSIONES.length : i
  }
  return [...mapa.entries()]
    .sort((a, b) => pos(a[0]) - pos(b[0]))
    .map(([dimension, lista]) => ({
      dimension,
      total: lista.reduce((s, f) => s + f.valor, 0),
      filas: lista.sort((a, b) => b.valor - a.valor),
    }))
}
