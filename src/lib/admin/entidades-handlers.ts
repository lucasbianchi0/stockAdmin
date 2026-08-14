import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { RESUMEN_VACIO } from "@/lib/admin/detalle"
import { resumenPorEntidad } from "@/lib/admin/detalle-server"
import type { TipoEntidad } from "@/lib/admin/entidades"
import {
  POR_PAGINA_MAX,
  aCliente,
  aProveedor,
  respuestaDeErrorDeBase,
  terminosDeBusqueda,
  validarEntidad,
  type TablaEntidad,
} from "@/lib/admin/entidades-server"

/**
 * Los handlers de clientes y proveedores, parametrizados por tabla.
 *
 * Las dos fichas son la misma pantalla con un campo de diferencia, y las dos
 * rutas serían el mismo archivo copiado. Copiarlo significa que el día que se
 * arregle un borde en una —el escape del buscador, el mensaje de CUIT
 * duplicado— la otra se queda con el bug. Acá la lógica es una sola y las rutas
 * son cuatro líneas cada una.
 */

/** Contra qué columna se cuelga cada ficha en `comprobantes`. */
const CAMPO_ENTIDAD: Record<TipoEntidad, string> = {
  cliente: "cliente_id",
  proveedor: "proveedor_id",
}

/** Techo del filtro "con deuda". Con más comprobantes pendientes que esto en
 *  total, el filtro se quedaría corto — es un escenario que hoy no existe y que
 *  igual daría una lista incompleta antes que un error. */
const TOPE_CON_DEUDA = 5000

type Config = {
  tabla: TablaEntidad
  /** De qué lado del mostrador está: define contra qué comprobantes se calcula
   *  lo que debe. */
  tipo: TipoEntidad
  /** Cómo se llama en los mensajes de error. */
  singular: string
  plural: string
  select: string
  mapear: (fila: Record<string, unknown>) => ReturnType<typeof aCliente>
  clave: string
}

export const CONFIG_CLIENTES: Config = {
  tabla: "clientes",
  tipo: "cliente",
  singular: "el cliente",
  plural: "los clientes",
  select: "*, vendedor:vendedores (id, nombre), categoria:categorias_entidad (id, nombre)",
  mapear: aCliente,
  clave: "clientes",
}

export const CONFIG_PROVEEDORES: Config = {
  tabla: "proveedores",
  tipo: "proveedor",
  singular: "el proveedor",
  plural: "los proveedores",
  select: "*, categoria:categorias_entidad (id, nombre)",
  mapear: aProveedor,
  clave: "proveedores",
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

export async function listarEntidades(cfg: Config, req: Request) {
  const url = new URL(req.url)
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1)
  const porPagina = Math.min(
    POR_PAGINA_MAX,
    Math.max(1, Number(url.searchParams.get("porPagina")) || 25)
  )
  const q = url.searchParams.get("q")?.trim() ?? ""
  const estado = url.searchParams.get("estado") ?? "activos"
  const categoriaId = url.searchParams.get("categoriaId") ?? ""
  const provincia = url.searchParams.get("provincia") ?? ""
  const conDeuda = url.searchParams.get("conDeuda") === "1"

  let query = supabase.from(cfg.tabla).select(cfg.select, { count: "exact" })

  if (estado === "activos") query = query.eq("activo", true)
  else if (estado === "inactivos") query = query.eq("activo", false)

  // `sin` es su propio filtro: "los que todavía no clasifiqué" es la pregunta
  // que aparece apenas se empieza a usar la categoría, y sin esto hay que
  // recorrer la lista a ojo para encontrarlos.
  if (categoriaId === "sin") query = query.is("categoria_id", null)
  else if (categoriaId) query = query.eq("categoria_id", categoriaId)

  if (provincia) query = query.eq("provincia", provincia)

  /**
   * "Mostrame solo los que me deben."
   *
   * El saldo no es una columna de `clientes` —se calcula contra los
   * comprobantes—, así que no se puede filtrar directo. Se resuelve al revés:
   * primero se pregunta qué fichas tienen algún comprobante con saldo y después
   * se filtra la lista por esos ids.
   *
   * Va antes de la paginación a propósito. Filtrar después de traer la página
   * daría "3 de 25" en pantalla pero seguiría diciendo que hay 200 en total, y
   * las páginas siguientes quedarían medio vacías.
   */
  if (conDeuda) {
    const { data: conSaldo } = await supabase
      .from("comprobantes_vigentes")
      .select(CAMPO_ENTIDAD[cfg.tipo])
      .eq("tipo", cfg.tipo === "cliente" ? "venta" : "compra")
      .gt("saldo", 0)
      .limit(TOPE_CON_DEUDA)

    const ids = [
      ...new Set(
        (conSaldo ?? [])
          .map((f) => (f as unknown as Record<string, unknown>)[CAMPO_ENTIDAD[cfg.tipo]])
          .filter((v): v is string => typeof v === "string")
      ),
    ]

    // Sin deudores, `in` con lista vacía devuelve todo en PostgREST. Un id
    // imposible es la forma de decir "ninguno" sin un caso especial.
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
  }

  if (q) query = query.or(terminosDeBusqueda(q))

  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order("razon_social", { ascending: true })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error(`[${cfg.tabla} GET]`, error)
    return NextResponse.json({ error: `No se pudieron cargar ${cfg.plural}` }, { status: 500 })
  }

  const fichas = (data ?? []).map((f) => cfg.mapear(f as unknown as Record<string, unknown>))

  // Cuánto debe cada uno, en una sola consulta para toda la página. Va acá y no
  // en la vista de la tabla porque el saldo no es una columna de `clientes`: se
  // calcula contra los comprobantes, y hacerlo en el navegador significaría
  // bajar todas las facturas de todos para sumarlas.
  const resumenes = await resumenPorEntidad(
    cfg.tipo,
    fichas.map((f) => f.id)
  )

  return NextResponse.json({
    [cfg.clave]: fichas.map((f) => ({
      ...f,
      resumen: resumenes.get(f.id) ?? RESUMEN_VACIO,
    })),
    total: count ?? 0,
    pagina,
    porPagina,
  })
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

export async function crearEntidad(cfg: Config, req: Request) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const validado = await validarEntidad(body.raw, { tabla: cfg.tabla })
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const { data, error } = await supabase
    .from(cfg.tabla)
    .insert(validado.fila)
    .select(cfg.select)
    .single()

  if (error) return respuestaDeErrorDeBase(error, "crear", cfg.singular)

  return NextResponse.json(
    { [cfg.clave.slice(0, -1)]: cfg.mapear(data as unknown as Record<string, unknown>) },
    { status: 201 }
  )
}

/* ── Edición ──────────────────────────────────────────────────────────────── */

export async function editarEntidad(cfg: Config, req: Request, id: string) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const validado = await validarEntidad(body.raw, { excluirId: id, tabla: cfg.tabla })
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const { data, error } = await supabase
    .from(cfg.tabla)
    .update(validado.fila)
    .eq("id", id)
    .select(cfg.select)
    .maybeSingle()

  if (error) return respuestaDeErrorDeBase(error, "editar", cfg.singular)
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  return NextResponse.json({
    [cfg.clave.slice(0, -1)]: cfg.mapear(data as unknown as Record<string, unknown>),
  })
}

/* ── Baja lógica y borrado ────────────────────────────────────────────────── */

export async function borrarEntidad(cfg: Config, req: Request, id: string) {
  const modo = new URL(req.url).searchParams.get("modo")

  if (modo === "eliminar") {
    const { data, error } = await supabase
      .from(cfg.tabla)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle()

    if (error) {
      // 23503: algo cuelga de esta ficha. Quién decide si el borrado es seguro
      // es Postgres, no este código: preguntar antes "¿tiene comprobantes?"
      // sería una carrera contra quien esté cargando uno justo ahora.
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error: `No se puede eliminar: tiene comprobantes o movimientos cargados. Dalo de baja para sacarlo de las listas sin perder su historia.`,
          },
          { status: 409 }
        )
      }
      console.error(`[${cfg.tabla} DELETE]`, error)
      return NextResponse.json({ error: `No se pudo eliminar ${cfg.singular}` }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

    return NextResponse.json({ ok: true, eliminado: true })
  }

  const { data, error } = await supabase
    .from(cfg.tabla)
    .update({ activo: false })
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error(`[${cfg.tabla} baja]`, error)
    return NextResponse.json({ error: `No se pudo dar de baja ${cfg.singular}` }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true, eliminado: false })
}

/* ── Utilidad ─────────────────────────────────────────────────────────────── */

async function leerBody(
  req: Request
): Promise<{ raw: Record<string, unknown> } | { error: NextResponse }> {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
    }
    return { raw: body as Record<string, unknown> }
  } catch {
    return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
  }
}
