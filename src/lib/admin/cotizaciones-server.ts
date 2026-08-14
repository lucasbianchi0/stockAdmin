import { supabase } from "@/lib/supabase"

/**
 * El dólar de cada día, guardado.
 *
 * `/api/dolar` da la cotización de hoy y sirve para sugerir un TC mientras
 * alguien carga. No alcanza para el resto: una factura del 6 de agosto se valúa
 * con el dólar del 6 de agosto, y ese número, si no se guardó ese día, no está
 * en ningún lado. Sin histórico, todo comprobante en pesos cargado con fecha
 * anterior queda sin valuar en dólares para siempre.
 *
 * De ahí la tabla `cotizaciones`: cada vez que alguien pide la cotización del
 * día, se archiva. El histórico se arma solo con el uso normal del sistema.
 */

/** El TC de una fecha, o `null` si nunca se guardó. */
export async function cotizacionDe(fecha: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("venta")
    .eq("fecha", fecha)
    .maybeSingle()

  if (error) {
    // Sin cotización el documento se guarda igual, con `tc` en null: es un dato
    // de valuación, no un requisito. Frenar un alta porque no se pudo leer una
    // tabla auxiliar sería peor que no tener el dato.
    console.error("[cotizacionDe]", error)
    return null
  }
  return data ? Number(data.venta) : null
}

/**
 * La última cotización conocida hasta una fecha.
 *
 * Un sábado no hay dólar oficial y una factura fechada un sábado igual se valúa
 * — con el viernes, que es lo que hace cualquier contador. Buscar la exacta y
 * rendirse dejaría sin valuar todos los fines de semana y feriados.
 */
export async function cotizacionHasta(fecha: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("venta")
    .lte("fecha", fecha)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[cotizacionHasta]", error)
    return null
  }
  return data ? Number(data.venta) : null
}

/** Archiva la cotización del día. Idempotente: pisar la de hoy con la de hoy no
 *  cambia nada, y si la fuente corrigió el valor gana el último. */
export async function guardarCotizacion(
  fecha: string,
  venta: number,
  compra?: number | null
): Promise<void> {
  if (!Number.isFinite(venta) || venta <= 0) return

  const { error } = await supabase
    .from("cotizaciones")
    .upsert(
      {
        fecha,
        venta,
        compra: Number.isFinite(compra) && (compra as number) > 0 ? compra : null,
        fuente: "dolarapi",
      },
      { onConflict: "fecha" }
    )

  if (error) console.error("[guardarCotizacion]", error)
}
