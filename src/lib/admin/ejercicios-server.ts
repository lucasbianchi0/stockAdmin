import { supabase } from "@/lib/supabase"

/**
 * El número de cada asiento dentro de su ejercicio (1/9 al 31/8), leído de la
 * vista `asientos_por_ejercicio`.
 *
 * En prueba: la numeración que guarda `asientos` sigue siendo la del año
 * calendario y no se toca. Esta es la que se muestra, y la que se fijaría en la
 * tabla si se aprueba. Si la vista no responde, se cae a la numeración de
 * siempre en vez de dejar la pantalla sin números.
 */
export async function numeracionPorEjercicio(
  ids: string[]
): Promise<Map<string, { numero: number; ejercicio: string }>> {
  const mapa = new Map<string, { numero: number; ejercicio: string }>()
  const unicos = [...new Set(ids)]
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await supabase
      .from("asientos_por_ejercicio")
      .select("asiento_id, numero, ejercicio")
      .in("asiento_id", unicos.slice(i, i + 300))
    if (error) {
      console.error("[numeración por ejercicio]", error)
      return mapa
    }
    for (const f of data ?? []) {
      mapa.set(f.asiento_id as string, { numero: Number(f.numero), ejercicio: f.ejercicio as string })
    }
  }
  return mapa
}
