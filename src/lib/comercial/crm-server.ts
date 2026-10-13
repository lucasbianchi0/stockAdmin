import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Sesion } from "@/lib/sesion-server"
import { listarEquipo } from "@/lib/tickets-server"
import { destinatarios, insertarContacto } from "@/lib/marketing/contactos-server"
import {
  EQUIPO,
  ESTADO_CRM_LABEL,
  ESTA_ABIERTA,
  PRODUCTOS_SUGERIDOS,
  esEstadoCrm,
  type Actividad,
  type EstadoCrm,
  type OpcionesContacto,
  type Oportunidad,
  type RespuestaCrm,
  type TipoActividad,
} from "@/lib/comercial/crm"

/**
 * El CRM del lado del servidor.
 *
 * La regla de edición vive acá y no en la pantalla: cualquiera con Comercial
 * mira el CRM de cualquiera, pero escribe solo en el suyo (o en todos si es
 * admin). La pantalla deshabilita los controles para no ofrecer lo que después
 * se va a rechazar, pero el que decide es `puedeEditar`.
 */

// `actividades` trae solo la última (ver el `.order`/`.limit` de la consulta):
// es la fecha del último movimiento, para marcar las oportunidades estancadas.
const SELECT = `
  *,
  contacto:contactos (id, empresa, nombre, apellido, cargo, departamento, vertical, email, telefono, observaciones, am_id, am_nombre),
  presupuesto:presupuestos (id, numero, referencia, estado),
  actividades:crm_actividades (created_at)
`

type Fila = Record<string, unknown>

const ajeno = () =>
  NextResponse.json({ error: "Solo podés editar tu propio CRM" }, { status: 403 })

const puedeEditar = (yo: Sesion, ownerId: string) => yo.admin || yo.id === ownerId

/**
 * Cuándo pasó algo por última vez: un cambio en la oportunidad, una nota, una
 * llamada o el último contacto anotado. Lo que pase primero de los tres.
 */
function ultimoMovimiento(f: Fila): string {
  const fechas = [
    f.updated_at as string,
    ...((f.actividades as Fila[] | null) ?? []).map((a) => a.created_at as string),
    f.ultimo_contacto ? `${f.ultimo_contacto as string}T12:00:00` : undefined,
  ].filter((x): x is string => !!x)
  return fechas.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
}

function aOportunidad(f: Fila): Oportunidad {
  const c = (f.contacto as Fila | null) ?? {}
  return {
    id: f.id as string,
    ownerId: f.owner_id as string,
    ownerNombre: f.owner_nombre as string,
    producto: (f.producto as string | null) ?? null,
    estado: esEstadoCrm(f.estado) ? f.estado : "nuevo",
    proximaAccion: (f.proxima_accion as string | null) ?? null,
    fechaProxima: (f.fecha_proxima as string | null) ?? null,
    ultimoContacto: (f.ultimo_contacto as string | null) ?? null,
    probabilidad: Number(f.probabilidad ?? 0),
    montoUsd: f.monto_usd === null || f.monto_usd === undefined ? null : Number(f.monto_usd),
    motivoPerdida: (f.motivo_perdida as string | null) ?? null,
    notas: (f.notas as string | null) ?? null,
    createdAt: f.created_at as string,
    updatedAt: f.updated_at as string,
    ultimoMovimiento: ultimoMovimiento(f),
    presupuesto: f.presupuesto
      ? {
          id: (f.presupuesto as Fila).id as string,
          numero: Number((f.presupuesto as Fila).numero),
          referencia: (f.presupuesto as Fila).referencia as string,
          estado: (f.presupuesto as Fila).estado as string,
        }
      : null,
    contacto: {
      id: (c.id as string) ?? "",
      empresa: (c.empresa as string) ?? "",
      nombre: (c.nombre as string | null) ?? null,
      apellido: (c.apellido as string | null) ?? null,
      cargo: (c.cargo as string | null) ?? null,
      departamento: (c.departamento as string | null) ?? null,
      vertical: (c.vertical as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      telefono: (c.telefono as string | null) ?? null,
      observaciones: (c.observaciones as string | null) ?? null,
      amId: (c.am_id as string | null) ?? null,
      amNombre: (c.am_nombre as string | null) ?? null,
    },
  }
}

async function anotar(
  oportunidadIds: string[],
  tipo: TipoActividad,
  texto: string | ((id: string) => string),
  yo: Sesion
) {
  if (oportunidadIds.length === 0) return
  const { error } = await supabase.from("crm_actividades").insert(
    oportunidadIds.map((id) => ({
      oportunidad_id: id,
      tipo,
      texto: typeof texto === "string" ? texto : texto(id),
      autor_id: yo.id,
      autor_nombre: yo.nombre,
    }))
  )
  // El historial acompaña; si falla no tiene que tirar abajo el cambio.
  if (error) console.error("[crm actividades]", error)
}

/* ── GET · el CRM de una persona ─────────────────────────────────────────── */

export async function listarCrm(req: Request, yo: Sesion) {
  const pedido = new URL(req.url).searchParams.get("owner")
  const esEquipo = pedido === EQUIPO

  // Las filas se piden en paralelo con el equipo, con el dueño tal como vino:
  // validarlo primero costaba un viaje más a la base en cada carga. Si el
  // pedido no era de alguien del equipo (raro: un link viejo), se descarta y
  // se piden las propias. `equipo` trae las de todos.
  const filasDe = (id: string | null) => {
    let q = supabase
      .from("crm_oportunidades")
      .select(SELECT)
      .order("fecha_proxima", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { referencedTable: "actividades", ascending: false })
      .limit(1, { referencedTable: "actividades" })
    if (id) q = q.eq("owner_id", id)
    return q
  }

  const [equipo, conteo, primera] = await Promise.all([
    listarEquipo(),
    supabase.from("crm_oportunidades").select("owner_id, estado"),
    filasDe(esEquipo ? null : (pedido ?? yo.id)),
  ])

  const ownerId = esEquipo ? EQUIPO : pedido && equipo.some((u) => u.id === pedido) ? pedido : yo.id
  const owner = esEquipo
    ? { id: EQUIPO, nombre: "Todo el equipo" }
    : (equipo.find((u) => u.id === ownerId) ?? { id: yo.id, nombre: yo.nombre })
  const { data, error } =
    esEquipo || ownerId === (pedido ?? yo.id) ? primera : await filasDe(ownerId)

  if (error) {
    console.error("[crm GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el CRM" }, { status: 500 })
  }

  const oportunidades = (data ?? []).map((f) => aOportunidad(f as Fila))

  const activasPor = new Map<string, number>()
  for (const f of conteo.data ?? []) {
    if (esEstadoCrm(f.estado) && ESTA_ABIERTA(f.estado)) {
      activasPor.set(f.owner_id, (activasPor.get(f.owner_id) ?? 0) + 1)
    }
  }

  const productos = [
    ...new Set([
      ...PRODUCTOS_SUGERIDOS,
      ...oportunidades.map((o) => o.producto).filter((p): p is string => !!p),
    ]),
  ]

  const respuesta: RespuestaCrm = {
    oportunidades,
    equipo: equipo.map((u) => ({ ...u, activas: activasPor.get(u.id) ?? 0 })),
    yo,
    owner,
    // En la vista de equipo cada fila decide por su dueño (ver `puedeEditarFila`).
    puedeEditar: esEquipo ? false : puedeEditar(yo, ownerId),
    productos,
  }
  return NextResponse.json(respuesta)
}

/* ── GET · lo pendiente, para el menú ─────────────────────────────────────── */

/**
 * Cuántas próximas acciones del CRM propio están vencidas o son de hoy. Es el
 * número al lado de "CRM" en el menú: se ve sin entrar.
 */
export async function pendientesCrm(yo: Sesion) {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
  const { count, error } = await supabase
    .from("crm_oportunidades")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", yo.id)
    .not("estado", "in", "(ganada,perdida)")
    .lte("fecha_proxima", hoy)
  if (error) throw error
  return NextResponse.json({ pendientes: count ?? 0 })
}

/**
 * Lo que ya está cargado en Contactos (empresas, verticales, departamentos),
 * para las sugerencias del "Nuevo contacto". Aparte del listado a propósito:
 * se pide solo al abrir el formulario y no en cada carga del CRM.
 */
export async function opcionesContacto() {
  const { data, error } = await supabase
    .from("contactos")
    .select("empresa, vertical, departamento")
    .limit(5000)
  if (error) throw error
  const distintos = (vs: (string | null)[]) =>
    [...new Set(vs.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
      a.localeCompare(b, "es")
    )
  const opciones: OpcionesContacto = {
    empresas: distintos((data ?? []).map((f) => f.empresa)),
    verticales: distintos((data ?? []).map((f) => f.vertical)),
    departamentos: distintos((data ?? []).map((f) => f.departamento)),
  }
  return NextResponse.json(opciones)
}

/* ── POST · mandar contactos a un CRM ────────────────────────────────────── */

/**
 * Lo que dispara la barra de selección de Contactos. Por defecto va al CRM de
 * quien lo manda; con `ownerId`, al de otra persona del equipo (para repartir
 * cuentas). Mandar algo que ya estaba no lo duplica ni lo pisa.
 */
export async function enviarAlCrm(req: Request, yo: Sesion) {

  const b = (await req.json().catch(() => ({}))) as {
    contactoIds?: unknown
    filtro?: unknown
    ownerId?: unknown
  }
  // Una lista de ids, o "todos los que coinciden" con el filtro de Contactos.
  const ids = (await destinatarios({ ids: b.contactoIds, filtro: b.filtro })).slice(0, 2000)
  if (ids.length === 0) {
    return NextResponse.json({ error: "Elegí al menos un contacto" }, { status: 400 })
  }

  const equipo = await listarEquipo()
  const ownerId = typeof b.ownerId === "string" && b.ownerId ? b.ownerId : yo.id
  const owner = equipo.find((u) => u.id === ownerId) ?? (ownerId === yo.id ? yo : null)
  if (!owner) {
    return NextResponse.json({ error: "Esa persona no es parte del equipo" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("crm_oportunidades")
    .upsert(
      ids.map((contacto_id) => ({
        contacto_id,
        owner_id: owner.id,
        owner_nombre: owner.nombre,
        created_by: yo.id,
      })),
      { onConflict: "contacto_id,owner_id", ignoreDuplicates: true }
    )
    .select("id")

  if (error) throw error

  const nuevas = (data ?? []).map((f) => f.id as string)
  await anotar(
    nuevas,
    "alta",
    owner.id === yo.id ? "Lo sumó a su CRM" : `Lo mandó ${yo.nombre} desde Contactos`,
    yo
  )

  return NextResponse.json({
    agregados: nuevas.length,
    yaEstaban: ids.length - nuevas.length,
    owner: { id: owner.id, nombre: owner.nombre },
  })
}

/* ── POST · una persona nueva, directo al CRM ─────────────────────────────── */

/**
 * El "Nuevo contacto" del CRM: se carga en la base de Contactos —la de
 * marketing, que es una sola— y en el mismo paso entra al CRM que se está
 * mirando. Si el mail ya existía, se suma al CRM la persona que ya estaba.
 */
export async function crearContactoEnCrm(req: Request, yo: Sesion) {

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ownerId = typeof b.ownerId === "string" && b.ownerId ? b.ownerId : yo.id
  if (!puedeEditar(yo, ownerId)) return ajeno()

  const equipo = await listarEquipo()
  const owner = equipo.find((u) => u.id === ownerId) ?? (ownerId === yo.id ? yo : null)
  if (!owner) {
    return NextResponse.json({ error: "Esa persona no es parte del equipo" }, { status: 400 })
  }

  const r = await insertarContacto(b, yo)
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const { data, error } = await supabase
    .from("crm_oportunidades")
    .upsert(
      {
        contacto_id: r.contacto.id,
        owner_id: owner.id,
        owner_nombre: owner.nombre,
        created_by: yo.id,
      },
      { onConflict: "contacto_id,owner_id", ignoreDuplicates: true }
    )
    .select("id")
  if (error) throw error

  const nueva = data?.[0]?.id as string | undefined
  if (nueva) await anotar([nueva], "alta", "Lo cargó desde el CRM", yo)

  return NextResponse.json(
    { contacto: r.contacto, yaExistia: r.yaExistia, yaEnCrm: !nueva, oportunidadId: nueva ?? null },
    { status: 201 }
  )
}

/* ── PATCH · editar una o varias ─────────────────────────────────────────── */

const textoONull = (v: unknown, max = 300) => {
  if (v === null) return null
  if (typeof v !== "string") return undefined
  const t = v.trim().slice(0, max)
  return t === "" ? null : t
}

const fechaONull = (v: unknown) => {
  if (v === null || v === "") return null
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  return v
}

/** Lo que llega del cliente a columnas de la tabla. Lo que no se entiende se ignora. */
function aColumnas(b: Record<string, unknown>): Fila | { error: string } {
  const f: Fila = {}
  if ("producto" in b) f.producto = textoONull(b.producto, 120)
  if ("estado" in b) {
    if (!esEstadoCrm(b.estado)) return { error: "Estado inválido" }
    f.estado = b.estado
  }
  if ("proximaAccion" in b) f.proxima_accion = textoONull(b.proximaAccion, 200)
  if ("fechaProxima" in b) f.fecha_proxima = fechaONull(b.fechaProxima)
  if ("ultimoContacto" in b) f.ultimo_contacto = fechaONull(b.ultimoContacto)
  if ("probabilidad" in b) {
    const n = Math.round(Number(b.probabilidad))
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "La probabilidad va de 0 a 100" }
    f.probabilidad = n
  }
  if ("montoUsd" in b) {
    if (b.montoUsd === null || b.montoUsd === "") f.monto_usd = null
    else {
      const n = Number(b.montoUsd)
      if (!Number.isFinite(n) || n < 0) return { error: "El monto no es válido" }
      f.monto_usd = Math.round(n * 100) / 100
    }
  }
  if ("motivoPerdida" in b) f.motivo_perdida = textoONull(b.motivoPerdida, 200)
  if ("notas" in b) f.notas = textoONull(b.notas, 4000)
  if ("presupuestoId" in b) {
    if (b.presupuestoId === null) f.presupuesto_id = null
    else if (typeof b.presupuestoId === "string" && /^[0-9a-f-]{36}$/i.test(b.presupuestoId)) {
      f.presupuesto_id = b.presupuestoId
    } else return { error: "Presupuesto inválido" }
  }
  for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k]
  return f
}

/**
 * Una o varias a la vez (`ids`), con la misma regla: todas tienen que ser de
 * un CRM que quien pide puede editar. Si una no lo es, no se toca ninguna.
 */
export async function editarOportunidades(req: Request, yo: Sesion, idUnico?: string) {

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ids = idUnico
    ? [idUnico]
    : Array.isArray(b.ids)
      ? b.ids.filter((i): i is string => typeof i === "string").slice(0, 500)
      : []
  if (ids.length === 0) return NextResponse.json({ error: "Nada para editar" }, { status: 400 })

  const cols = aColumnas(b)
  if ("error" in cols) return NextResponse.json({ error: cols.error }, { status: 400 })
  if (Object.keys(cols).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const { data: actuales, error: errActuales } = await supabase
    .from("crm_oportunidades")
    .select("id, owner_id, estado")
    .in("id", ids)
  if (errActuales) throw errActuales
  if (!actuales || actuales.length === 0) {
    return NextResponse.json({ error: "La oportunidad ya no existe" }, { status: 404 })
  }
  if (actuales.some((o) => !puedeEditar(yo, o.owner_id as string))) return ajeno()

  // Al ganar o perder, el motivo de pérdida solo tiene sentido en "perdida".
  if (cols.estado && cols.estado !== "perdida" && !("motivo_perdida" in cols)) {
    cols.motivo_perdida = null
  }

  const { data, error } = await supabase
    .from("crm_oportunidades")
    .update(cols)
    .in("id", ids)
    .select(SELECT)
  if (error) throw error

  if (cols.estado) {
    const nuevo = cols.estado as EstadoCrm
    const cambiaron = actuales.filter((o) => o.estado !== nuevo)
    const previo = new Map(cambiaron.map((o) => [o.id as string, o.estado as EstadoCrm]))
    await anotar(
      cambiaron.map((o) => o.id as string),
      "cambio_estado",
      (id) => {
        const antes = previo.get(id)
        return `${antes ? ESTADO_CRM_LABEL[antes] : "—"} → ${ESTADO_CRM_LABEL[nuevo]}`
      },
      yo
    )
  }

  const oportunidades = (data ?? []).map((f) => aOportunidad(f as Fila))
  return NextResponse.json(idUnico ? { oportunidad: oportunidades[0] } : { oportunidades })
}

/* ── DELETE · sacar del CRM ──────────────────────────────────────────────── */

/** Saca del CRM, no borra el contacto: sigue en la base de Marketing. */
export async function quitarDelCrm(req: Request, yo: Sesion) {

  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const lista = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : []
  if (lista.length === 0) return NextResponse.json({ error: "Nada para quitar" }, { status: 400 })

  const { data: actuales, error: e1 } = await supabase
    .from("crm_oportunidades")
    .select("id, owner_id")
    .in("id", lista)
  if (e1) throw e1
  if ((actuales ?? []).some((o) => !puedeEditar(yo, o.owner_id as string))) return ajeno()

  const { error } = await supabase.from("crm_oportunidades").delete().in("id", lista)
  if (error) throw error
  return NextResponse.json({ quitados: lista.length })
}

/* ── Actividades ──────────────────────────────────────────────────────────── */

export async function listarActividades(id: string) {
  const { data, error } = await supabase
    .from("crm_actividades")
    .select("*")
    .eq("oportunidad_id", id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error

  const actividades: Actividad[] = (data ?? []).map((f) => ({
    id: f.id,
    tipo: f.tipo,
    texto: f.texto,
    autorId: f.autor_id,
    autorNombre: f.autor_nombre,
    createdAt: f.created_at,
  }))
  return NextResponse.json({ actividades })
}

const TIPOS_MANUALES: TipoActividad[] = ["nota", "llamada", "reunion", "email"]

export async function crearActividad(req: Request, id: string, yo: Sesion) {

  const b = (await req.json().catch(() => ({}))) as { tipo?: unknown; texto?: unknown }
  const tipo = TIPOS_MANUALES.includes(b.tipo as TipoActividad) ? (b.tipo as TipoActividad) : "nota"
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 2000) : ""
  if (!texto) return NextResponse.json({ error: "Escribí algo" }, { status: 400 })

  const { data: op, error: e1 } = await supabase
    .from("crm_oportunidades")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle()
  if (e1) throw e1
  if (!op) return NextResponse.json({ error: "La oportunidad ya no existe" }, { status: 404 })
  if (!puedeEditar(yo, op.owner_id as string)) return ajeno()

  const { data, error } = await supabase
    .from("crm_actividades")
    .insert({ oportunidad_id: id, tipo, texto, autor_id: yo.id, autor_nombre: yo.nombre })
    .select("*")
    .single()
  if (error) throw error

  // Una llamada, una reunión o un mail son un contacto: se actualiza solo.
  if (tipo !== "nota") {
    // La fecha de acá, no la del servidor (UTC): pasadas las 21 serían mañana.
    const local = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
    await supabase.from("crm_oportunidades").update({ ultimo_contacto: local }).eq("id", id)
  }

  const actividad: Actividad = {
    id: data.id,
    tipo: data.tipo,
    texto: data.texto,
    autorId: data.autor_id,
    autorNombre: data.autor_nombre,
    createdAt: data.created_at,
  }
  return NextResponse.json({ actividad }, { status: 201 })
}
