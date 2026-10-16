import { supabase } from "@/lib/supabase"

/**
 * Versiones de Google Ads — el changelog de la cuenta (tabla `ads_versiones`).
 *
 * Una versión es una tanda de cambios hecha el mismo día con el mismo motivo.
 * Cada cambio dice qué se tocó, por qué y con qué dato se decidió: el historial
 * de Google ya dice QUÉ cambió, lo que se pierde es el porqué.
 */

export type TipoCambio =
  | "presupuesto"
  | "puja"
  | "keywords"
  | "negativas"
  | "anuncio"
  | "segmentacion"
  | "medicion"
  | "estado"

export type Cambio = {
  tipo: TipoCambio
  /** La campaña, o "Cuenta" para lo que no es de una sola. */
  campana: string
  que: string
  antes?: string
  despues?: string
  porque: string
  /** El número o la observación que respaldó la decisión. */
  dato?: string
}

export type EstadoVersion = "en_curso" | "verificada" | "revertida"

export type Version = {
  id: string
  numero: string
  fecha: string
  titulo: string
  resumen: string
  autor: string
  cambios: Cambio[]
  esperado: string | null
  revisar_el: string | null
  estado: EstadoVersion
  resultado: string | null
}

export async function versionesDeAds(): Promise<{ ok: true; versiones: Version[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("ads_versiones")
    .select("id, numero, fecha, titulo, resumen, autor, cambios, esperado, revisar_el, estado, resultado")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, versiones: (data ?? []) as Version[] }
}
