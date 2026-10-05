import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { aEntradas } from "@/lib/generador-server"

const POR_PAGINA = 36

/**
 * El historial completo, paginado hacia atrás por fecha.
 *
 *   ?tipo=imagen|texto   obligatorio: son dos listas distintas en pantalla
 *   ?q=                  busca en el pedido (y en el resultado, si es texto)
 *   ?filtro=             operación de imagen, o tipo de contenido de texto
 *   ?antes=<ISO>         cursor: la fecha de la última fila que ya se tiene
 */
export const GET = ruta("generador historial GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const p = new URL(req.url).searchParams
  const tipo = p.get("tipo") === "texto" ? "texto" : "imagen"
  // PostgREST arma el `or` con comas y paréntesis: se sacan del término para que
  // una búsqueda con una coma no rompa la consulta.
  const q = (p.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 100)
  const filtro = (p.get("filtro") ?? "").trim()
  const antes = p.get("antes")

  let query = supabase
    .from("generador_historial")
    .select("*")
    .eq("tipo", tipo)
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA + 1)

  if (q) query = tipo === "texto" ? query.or(`prompt.ilike.%${q}%,texto.ilike.%${q}%`) : query.ilike("prompt", `%${q}%`)
  if (filtro) query = query.eq(tipo === "texto" ? "parametros->>tipo" : "parametros->>operacion", filtro)
  if (antes && !Number.isNaN(Date.parse(antes))) query = query.lt("created_at", antes)

  const { data, error } = await query
  if (error) {
    console.error("[generador historial GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 })
  }

  const filas = data ?? []
  return NextResponse.json({
    entradas: await aEntradas(filas.slice(0, POR_PAGINA)),
    hayMas: filas.length > POR_PAGINA,
  })
})
