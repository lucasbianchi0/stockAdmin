import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { redondear, type Moneda } from "@/lib/admin/moneda"
import {
  ESTADOS,
  TIPOS_ITEM,
  calcularTotales,
  type EstadoPresupuesto,
  type ItemPresupuesto,
  type Presupuesto,
  type PresupuestoFila,
  type TipoItem,
} from "@/lib/comercial/presupuestos"

/**
 * Presupuestos: lectura, alta y edición.
 *
 * Los totales no se guardan: se calculan de los renglones cada vez que se leen.
 * Es la misma decisión que el saldo de un comprobante, y por el mismo motivo —un
 * total guardado es un total que algún día no coincide con sus partes, y cuando
 * eso pasa nadie sabe cuál de los dos creer.
 */

const SELECT = `
  *,
  cliente:clientes (id, razon_social),
  vendedor:vendedores (id, nombre),
  items:presupuesto_items (*)
`

type FilaItem = Record<string, unknown>

const num = (v: unknown, x = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : x
}

function aItem(f: FilaItem): ItemPresupuesto {
  return {
    id: f.id as string,
    orden: num(f.orden),
    proveedor: (f.proveedor as string | null) ?? null,
    parte: (f.parte as string | null) ?? null,
    cantidad: num(f.cantidad, 1),
    descripcion: (f.descripcion as string) ?? "",
    tipo: (TIPOS_ITEM.includes(f.tipo as TipoItem) ? f.tipo : "material") as TipoItem,
    costoUnitario: num(f.costo_unitario),
    venta: num(f.venta_unitaria),
    impPct: num(f.imp_pct),
    iva: num(f.iva, 0.21),
    stock: f.stock !== false,
  }
}

export function aPresupuesto(fila: Record<string, unknown>): Presupuesto {
  const cliente = fila.cliente as { id: string; razon_social: string } | null
  const vendedor = fila.vendedor as { id: string; nombre: string } | null

  const items = ((fila.items as FilaItem[]) ?? [])
    .map(aItem)
    .sort((a, b) => a.orden - b.orden)

  return {
    id: fila.id as string,
    numero: num(fila.numero),
    clienteId: (fila.cliente_id as string) ?? "",
    clienteNombre: cliente?.razon_social ?? null,
    referencia: (fila.referencia as string) ?? "",
    fecha: fila.fecha as string,
    fechaValidez: (fila.fecha_validez as string | null) ?? null,
    moneda: (fila.moneda as Moneda) ?? "USD",
    tc: fila.tc === null || fila.tc === undefined ? null : num(fila.tc),
    vendedorId: (fila.vendedor_id as string | null) ?? null,
    vendedorNombre: vendedor?.nombre ?? null,
    estado: (fila.estado as EstadoPresupuesto) ?? "borrador",
    breakPct: num(fila.break_pct, 0.1),
    margenMateriales: num(fila.margen_materiales, 1.7),
    margenManoObra: num(fila.margen_mano_obra, 1.7),
    alcance: (fila.alcance as string | null) ?? null,
    condiciones: (fila.condiciones as string | null) ?? null,
    confidencialidad: (fila.confidencialidad as string | null) ?? null,
    observaciones: (fila.observaciones as string | null) ?? null,
    noContempla: (fila.no_contempla as string | null) ?? null,
    notaImportante: (fila.nota_importante as string | null) ?? null,
    createdAt: fila.created_at as string,
    items,
    totales: calcularTotales(items),
  }
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

export async function listarPresupuestos(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const estado = url.searchParams.get("estado") ?? ""

  let consulta = supabase
    .from("presupuestos")
    .select(SELECT)
    .order("numero", { ascending: false })
    .limit(500)

  if (ESTADOS.includes(estado as EstadoPresupuesto)) {
    consulta = consulta.eq("estado", estado)
  }

  const { data, error } = await consulta

  if (error) {
    console.error("[presupuestos listar]", error)
    return NextResponse.json({ error: "No se pudieron cargar los presupuestos" }, { status: 500 })
  }

  let filas = (data ?? []).map((f) => aPresupuesto(f as Record<string, unknown>))

  /*
   * La búsqueda se hace acá y no en la consulta porque tiene que alcanzar al
   * nombre del cliente, que vive en otra tabla: un `or` de PostgREST no cruza el
   * embed, y el volumen de presupuestos de una empresa entra holgado en memoria.
   * El día que no entre, esto se convierte en una vista y se busca allá.
   */
  if (q) {
    const t = q.toLowerCase()
    filas = filas.filter(
      (p) =>
        String(p.numero).includes(t) ||
        p.referencia.toLowerCase().includes(t) ||
        (p.clienteNombre ?? "").toLowerCase().includes(t) ||
        (p.vendedorNombre ?? "").toLowerCase().includes(t)
    )
  }

  /* El listado no necesita los renglones de cada uno, solo sus totales —que ya
     vienen calculados—. Mandarlos sería bajar la planilla entera de doscientos
     presupuestos para dibujar una tabla que no los muestra. */
  const sinItems: PresupuestoFila[] = filas.map((p) => {
    const copia: Partial<Presupuesto> = { ...p }
    delete copia.items
    return copia as PresupuestoFila
  })

  return NextResponse.json({ presupuestos: sinItems })
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

/**
 * Un presupuesto nace con número y poco más.
 *
 * El pedido dice que el número se asigna "al iniciar un nuevo presupuesto", así
 * que el alta crea el borrador y devuelve su id: la pantalla que sigue ya edita
 * algo que existe. La alternativa —un formulario largo que recién al final
 * guarda— deja a quien lo carga sin número mientras arma la planilla, que es
 * justo cuando lo necesita para nombrar el archivo o pedirle algo al proveedor.
 */
export async function crearPresupuesto(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clienteId = typeof raw.clienteId === "string" ? raw.clienteId : ""
  if (!clienteId) return NextResponse.json({ error: "Elegí el cliente" }, { status: 400 })

  const referencia =
    typeof raw.referencia === "string" ? raw.referencia.trim().slice(0, 300) : ""
  if (!referencia) {
    return NextResponse.json(
      { error: "Escribí la referencia: es con lo que se reconoce el presupuesto" },
      { status: 400 }
    )
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("presupuestos")
    .insert({
      cliente_id: clienteId,
      referencia,
      moneda: raw.moneda === "ARS" ? "ARS" : "USD",
      tc: Number.isFinite(Number(raw.tc)) && Number(raw.tc) > 0 ? redondear(Number(raw.tc), 4) : null,
      vendedor_id: typeof raw.vendedorId === "string" && raw.vendedorId ? raw.vendedorId : null,
      fecha_validez: fechaONull(raw.fechaValidez),
      created_by: user?.id ?? null,
    })
    .select(SELECT)
    .single()

  if (error || !data) {
    console.error("[presupuestos crear]", error)
    return NextResponse.json({ error: "No se pudo crear el presupuesto" }, { status: 500 })
  }

  return NextResponse.json(
    { presupuesto: aPresupuesto(data as Record<string, unknown>) },
    { status: 201 }
  )
}

/* ── Detalle ──────────────────────────────────────────────────────────────── */

export async function leerPresupuesto(id: string) {
  const { data, error } = await supabase
    .from("presupuestos")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[presupuesto leer]", error)
    return NextResponse.json({ error: "No se pudo cargar el presupuesto" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 })

  return NextResponse.json({ presupuesto: aPresupuesto(data as Record<string, unknown>) })
}

/* ── Edición ──────────────────────────────────────────────────────────────── */

const fechaONull = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

const textoONull = (v: unknown, max = 4000): string | null =>
  typeof v === "string" ? v.trim().slice(0, max) || null : null

/**
 * Guardar el presupuesto entero: cabecera y renglones.
 *
 * Los renglones se reemplazan completos en vez de diferenciar altas, bajas y
 * cambios. La planilla se edita como una planilla —se agrega una fila, se borra
 * otra, se reordena— y mandar el estado final es lo que hace que lo que se ve
 * sea exactamente lo que queda guardado. Como son pocos por presupuesto, el
 * costo de reescribirlos es irrelevante frente a la clase de bug que evita.
 */
export async function guardarPresupuesto(req: Request, id: string) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const cabecera: Record<string, unknown> = {}

  if (typeof raw.clienteId === "string" && raw.clienteId) cabecera.cliente_id = raw.clienteId
  if (typeof raw.referencia === "string") {
    const r = raw.referencia.trim().slice(0, 300)
    if (!r) return NextResponse.json({ error: "La referencia no puede quedar vacía" }, { status: 400 })
    cabecera.referencia = r
  }
  if (raw.fecha !== undefined) {
    const f = fechaONull(raw.fecha)
    if (!f) return NextResponse.json({ error: "La fecha es inválida" }, { status: 400 })
    cabecera.fecha = f
  }
  if (raw.fechaValidez !== undefined) cabecera.fecha_validez = fechaONull(raw.fechaValidez)
  if (raw.moneda !== undefined) cabecera.moneda = raw.moneda === "ARS" ? "ARS" : "USD"
  if (raw.tc !== undefined) {
    const tc = Number(raw.tc)
    cabecera.tc = Number.isFinite(tc) && tc > 0 ? redondear(tc, 4) : null
  }
  if (raw.vendedorId !== undefined) {
    cabecera.vendedor_id =
      typeof raw.vendedorId === "string" && raw.vendedorId ? raw.vendedorId : null
  }
  if (raw.estado !== undefined) {
    if (!ESTADOS.includes(raw.estado as EstadoPresupuesto)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }
    cabecera.estado = raw.estado
  }

  for (const [campo, columna] of [
    ["breakPct", "break_pct"],
    ["margenMateriales", "margen_materiales"],
    ["margenManoObra", "margen_mano_obra"],
  ] as const) {
    if (raw[campo] === undefined) continue
    const v = Number(raw[campo])
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "Los márgenes tienen que ser números" }, { status: 400 })
    }
    cabecera[columna] = redondear(v, 4)
  }

  for (const [campo, columna] of [
    ["alcance", "alcance"],
    ["condiciones", "condiciones"],
    ["confidencialidad", "confidencialidad"],
    ["observaciones", "observaciones"],
    ["noContempla", "no_contempla"],
    ["notaImportante", "nota_importante"],
  ] as const) {
    if (raw[campo] !== undefined) cabecera[columna] = textoONull(raw[campo])
  }

  if (Object.keys(cabecera).length > 0) {
    const { error } = await supabase.from("presupuestos").update(cabecera).eq("id", id)
    if (error) {
      console.error("[presupuesto guardar cabecera]", error)
      return NextResponse.json({ error: "No se pudo guardar el presupuesto" }, { status: 500 })
    }
  }

  if (Array.isArray(raw.items)) {
    const filas = (raw.items as Record<string, unknown>[])
      .map((i, orden) => {
        const descripcion = typeof i.descripcion === "string" ? i.descripcion.trim() : ""
        if (!descripcion) return null
        const cantidad = Number(i.cantidad)
        return {
          presupuesto_id: id,
          orden,
          proveedor: textoONull(i.proveedor, 160),
          parte: textoONull(i.parte, 80),
          cantidad: Number.isFinite(cantidad) && cantidad > 0 ? redondear(cantidad, 4) : 1,
          descripcion: descripcion.slice(0, 600),
          tipo: TIPOS_ITEM.includes(i.tipo as TipoItem) ? i.tipo : "material",
          costo_unitario: redondear(num(i.costoUnitario), 4),
          venta_unitaria: redondear(num(i.venta), 4),
          imp_pct: redondear(num(i.impPct), 4),
          iva: redondear(num(i.iva, 0.21), 4),
          stock: i.stock !== false,
        }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)

    const { error: errBorrar } = await supabase
      .from("presupuesto_items")
      .delete()
      .eq("presupuesto_id", id)

    if (errBorrar) {
      console.error("[presupuesto borrar items]", errBorrar)
      return NextResponse.json({ error: "No se pudieron guardar los renglones" }, { status: 500 })
    }

    if (filas.length > 0) {
      const { error: errAlta } = await supabase.from("presupuesto_items").insert(filas)
      if (errAlta) {
        console.error("[presupuesto insertar items]", errAlta)
        return NextResponse.json({ error: "No se pudieron guardar los renglones" }, { status: 500 })
      }
    }
  }

  return leerPresupuesto(id)
}

/* ── Baja ─────────────────────────────────────────────────────────────────── */

export async function borrarPresupuesto(id: string) {
  const { error } = await supabase.from("presupuestos").delete().eq("id", id)
  if (error) {
    console.error("[presupuesto borrar]", error)
    return NextResponse.json({ error: "No se pudo borrar el presupuesto" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
