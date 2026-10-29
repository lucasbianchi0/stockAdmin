/**
 * Instagram y Facebook en Resultados — el vocabulario compartido entre la
 * pantalla y la API. Sin imports de servidor.
 *
 * A diferencia de LinkedIn, que entra a mano por .xls, estas dos redes las trae
 * un cron diario desde la API de Meta. Igual la pantalla dice cuándo corrió por
 * última vez y si salió bien: un token vencido o un permiso quitado dejan de
 * traer datos en silencio, y un panel que no lo dice parece una semana mala.
 */

export const REDES = ["instagram", "facebook"] as const
export type Red = (typeof REDES)[number]

export const RED_LABEL: Record<Red, string> = { instagram: "Instagram", facebook: "Facebook" }

/** Pasadas estas horas sin una sincronización buena, la pantalla avisa. */
export const HORAS_PARA_AVISAR = 48

export type Sincronizacion = {
  corrido_en: string
  origen: "cron" | "manual"
  ok: boolean
  dias: number
  publicaciones: number
  detalle: string | null
}

export type TotalesRed = {
  alcance: number
  vistas: number
  interacciones: number
  me_gusta: number
  comentarios: number
  compartidos: number
  guardados: number
  clics_enlace: number
  visitas_perfil: number
  seguidores_nuevos: number
  seguidores_perdidos: number
}

export type DiaRed = { dia: string; vistas: number; seguidores: number }

export type PublicacionRed = {
  id: string
  fecha: string | null
  tipo: string | null
  texto: string | null
  url: string | null
  miniatura: string | null
  alcance: number | null
  vistas: number | null
  me_gusta: number | null
  comentarios: number | null
  compartidos: number | null
  guardados: number | null
  interacciones: number | null
}

export type ResultadosRed = {
  red: Red
  /** La cuenta conectada; null si todavía no se conectó. */
  cuenta: { nombre: string | null; id: string } | null
  desde: string
  hasta: string
  ultima: Sincronizacion | null
  ultimaBuena: Sincronizacion | null
  seguidores: number | null
  datosHasta: string | null
  totales: TotalesRed
  anterior: TotalesRed
  serie: DiaRed[]
  publicaciones: PublicacionRed[]
}

export type ResumenSincronizacion = {
  resultados: { red: Red; ok: boolean; dias: number; publicaciones: number; detalle: string | null }[]
}
