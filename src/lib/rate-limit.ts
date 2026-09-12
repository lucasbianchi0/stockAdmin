import { supabase } from "@/lib/supabase"

/**
 * Límite de uso contra Postgres (ver `20260912_01_rate_limit.sql`).
 *
 * Tres resultados y no un booleano: "te pasaste" y "no hay contador" se le
 * contestan distinto a la persona. Mezclarlos le diría a alguien que usó el
 * asistente dos veces que llegó al límite, cuando lo que se cayó es la base.
 *
 * `fallaCerrado` decide qué pasa sin contador. En un checkout conviene dejar
 * pasar —frenar una compra es peor que no contarla—; en algo que se paga por
 * token, sin contador no hay techo, así que el default es cerrar.
 */
export type ResultadoLimite = "ok" | "excedido" | "sin-contador"

export async function contarUso(
  bucket: string,
  limite: number,
  ventanaSegundos: number,
  { fallaCerrado = true }: { fallaCerrado?: boolean } = {}
): Promise<ResultadoLimite> {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limite,
      p_window_seconds: ventanaSegundos,
    })
    if (error) throw error
    return data === true ? "ok" : "excedido"
  } catch (e) {
    console.error("[rate-limit]", { bucket, error: (e as Error).message })
    return fallaCerrado ? "sin-contador" : "ok"
  }
}
