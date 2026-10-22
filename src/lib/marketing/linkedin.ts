/**
 * LinkedIn en Resultados — el vocabulario compartido entre la pantalla y la API.
 *
 * Sin imports de servidor, como `resultados.ts`: lo usan el cliente y los
 * handlers.
 *
 * DE DÓNDE SALEN LOS NÚMEROS
 *
 * De los tres .xls que exporta la analítica de la página de Accedra (Contenido,
 * Seguidores, Visitantes), hasta que LinkedIn apruebe la Community Management
 * API. Por eso la pantalla siempre dice cuándo se cargó por última vez y hasta
 * qué día llegan los datos: un panel que no lo dice parece en vivo, y uno
 * desactualizado una semana se lee como "LinkedIn no anduvo esta semana".
 */

/** La página de Accedra en LinkedIn (la URL pública `accedra-s` no resuelve). */
export const ANALITICA_LINKEDIN = "https://www.linkedin.com/company/1420716/admin/analytics/updates/"

export const TIPOS_CARGA = ["contenido", "seguidores", "visitantes"] as const
export type TipoCarga = (typeof TIPOS_CARGA)[number]

export const TIPO_CARGA_LABEL: Record<TipoCarga, string> = {
  contenido: "Contenido",
  seguidores: "Seguidores",
  visitantes: "Visitantes",
}

/** Pasados estos días sin cargar, la pantalla avisa que los números quedaron viejos. */
export const DIAS_PARA_AVISAR = 7

export type Carga = {
  tipo: TipoCarga
  archivo: string
  cargado_en: string
  cargado_por: string | null
  desde: string | null
  hasta: string | null
  filas: number
}

export type TotalesLinkedin = {
  impresiones: number
  impresiones_pagas: number
  clics: number
  reacciones: number
  comentarios: number
  compartidos: number
  seguidores_nuevos: number
  vistas_pagina: number
  visitantes_unicos: number
}

export type DiaLinkedin = { dia: string; impresiones: number; seguidores: number }

export type Publicacion = {
  url: string
  titulo: string | null
  fecha: string | null
  tipo: string | null
  autor: string | null
  contenido: string | null
  impresiones: number
  vistas: number | null
  clics: number
  reacciones: number
  comentarios: number
  compartidos: number
  tasa_interaccion: number | null
}

export type Demografia = { dimension: string; filas: { clave: string; valor: number }[]; total: number }

export type ResultadosLinkedin = {
  desde: string
  hasta: string
  /** La última importación de cada archivo; falta la clave si nunca se cargó. */
  cargas: Partial<Record<TipoCarga, Carga>>
  /** El último día con datos de cada archivo. */
  datosHasta: Partial<Record<TipoCarga, string>>
  totales: TotalesLinkedin
  anterior: TotalesLinkedin
  serie: DiaLinkedin[]
  publicaciones: Publicacion[]
  demografia: Demografia[]
}

export type ResumenImportacion = {
  archivos: { archivo: string; tipo: TipoCarga; desde: string | null; hasta: string | null; filas: number }[]
}

/** Las interacciones que LinkedIn suma en su tasa: reacciones, comentarios y compartidos. */
export function interacciones(t: TotalesLinkedin): number {
  return t.reacciones + t.comentarios + t.compartidos
}

/** Variación contra el período anterior, o null si antes no había nada con qué comparar. */
export function variacion(ahora: number, antes: number): number | null {
  if (!antes) return null
  return (ahora - antes) / antes
}

/** "21/10/2026 22:40" a partir de un timestamp, en hora de Argentina. */
export function momento(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "20/10/2026" a partir de "2026-10-20", sin pasar por `Date` (que lo correría un día). */
export function diaCorto(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

/** Días enteros entre un timestamp y ahora. */
export function diasDesde(iso: string, ahora = Date.now()): number {
  return Math.floor((ahora - new Date(iso).getTime()) / 86_400_000)
}
