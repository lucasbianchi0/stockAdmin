import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Sesion } from "@/lib/sesion-server"
import { listarEquipo } from "@/lib/tickets-server"
import { palabrasDeBusqueda } from "@/lib/busqueda"
import {
  buscarCabecera,
  clave,
  decodificarCsv,
  huella,
  leerFila,
  mapearColumnas,
} from "@/lib/marketing/contactos-import"
import type { Usuario } from "@/lib/tickets"
import { esCsv, parsearCsv } from "@/lib/admin/importar-csv"
import { ArchivoInvalido, esXlsx, leerXlsx } from "@/lib/admin/xlsx"
import {
  FILAS_IMPORT_MAX,
  LIMITE_OBSERVACIONES,
  LIMITE_TEXTO,
  esEmail,
  type CampoImportable,
  type Contacto,
  type FilaImportada,
  type KpisContactos,
  type OpcionesContactos,
  type PrevisualizacionImport,
} from "@/lib/marketing/contactos"

/**
 * Contactos: listado, alta, edición, baja e importación.
 *
 * El listado pagina y filtra en la base. Los KPIs y las opciones de los
 * filtros, en cambio, salen de una lectura liviana de toda la tabla (cuatro
 * columnas): son unos miles de filas y contar distintos en PostgREST obligaría a
 * una vista o una función por cada número.
 */

const SELECT = "*, crm:crm_oportunidades(id, owner_id, owner_nombre, estado, producto, probabilidad)"

type Fila = Record<string, unknown>

function aContacto(f: Fila): Contacto {
  const crm = (f.crm as Fila[] | null) ?? []
  return {
    id: f.id as string,
    empresa: (f.empresa as string) ?? "",
    nombre: (f.nombre as string | null) ?? null,
    apellido: (f.apellido as string | null) ?? null,
    cargo: (f.cargo as string | null) ?? null,
    departamento: (f.departamento as string | null) ?? null,
    vertical: (f.vertical as string | null) ?? null,
    email: (f.email as string | null) ?? null,
    telefono: (f.telefono as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
    amId: (f.am_id as string | null) ?? null,
    amNombre: (f.am_nombre as string | null) ?? null,
    createdAt: f.created_at as string,
    crm: crm.map((c) => ({
      id: c.id as string,
      proyecto: (c.producto as string | null) ?? null,
      ownerId: c.owner_id as string,
      ownerNombre: c.owner_nombre as string,
      estado: c.estado as string,
      probabilidad: Number(c.probabilidad ?? 0),
    })),
  }
}

/** Texto limpio y con tope, o `null` si quedó vacío. */
function texto(v: unknown, max = LIMITE_TEXTO): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().replace(/\s+/g, " ").slice(0, max)
  return t === "" ? null : t
}


/** Todas las filas de una consulta, de a mil: el tope por pedido de PostgREST. */
export async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const salida: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar(desde, desde + 999)
    if (error) throw error
    salida.push(...(data ?? []))
    if (!data || data.length < 1000) return salida
  }
}

const distintos = (valores: (string | null)[]) =>
  [...new Set(valores.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b, "es")
  )

/* ── GET · listado ─────────────────────────────────────────────────────────── */

/* ── Filtros ──────────────────────────────────────────────────────────────── */

/** Las columnas por las que se puede ordenar la tabla. */
const ORDENABLES = ["empresa", "nombre", "apellido", "cargo", "departamento", "vertical", "email", "created_at"] as const
type Ordenable = (typeof ORDENABLES)[number]

/**
 * Una consulta de contactos con los filtros de la pantalla aplicados.
 *
 * Es la misma para el listado, para los números de las pestañas y para "todos
 * los que coinciden" (agregar a un grupo, cambiar el AM en lote): así lo que
 * se hace con un filtro es exactamente lo que se ve con ese filtro.
 *
 *   q             palabras, sin acentos, en cualquier campo
 *   am            id del AM, o "sin"
 *   empresa, vertical, departamento   valor exacto
 *   estado        "libre" (en ningún CRM) o "en_crm"
 *   grupo         id de un grupo
 *   ids           ids separados por coma
 */
function consultaContactos(
  p: URLSearchParams,
  { columnas, conteo, sinEstado = false }: { columnas: string; conteo?: "exact"; sinEstado?: boolean }
) {
  const estado = sinEstado ? null : p.get("estado")
  const grupo = p.get("grupo")

  // Las relaciones que hacen falta para filtrar: el CRM para "libre" o
  // "en_crm", los miembros para un grupo. `!inner` deja solo los que tienen.
  let select = columnas
  if (estado === "en_crm") select += ", crm_f:crm_oportunidades!inner(id)"
  if (estado === "libre") select += ", crm_f:crm_oportunidades(id)"
  if (grupo) select += ", grupo_f:contacto_grupo_miembros!inner(grupo_id)"

  let q = supabase.from("contactos").select(select, conteo ? { count: conteo, head: columnas === "id" && !!conteo } : undefined)

  const am = p.get("am")
  if (am === "sin") q = q.is("am_id", null)
  else if (am) q = q.eq("am_id", am)
  for (const campo of ["empresa", "vertical", "departamento"] as const) {
    const v = p.get(campo)
    if (v) q = q.eq(campo, v)
  }
  // Cada palabra tiene que estar, en cualquier campo (ver la migración de
  // `busqueda`: minúscula y sin acentos).
  for (const w of palabrasDeBusqueda(p.get("q") ?? "")) {
    q = q.ilike("busqueda", `%${w.replace(/[%_\\]/g, "\\$&")}%`)
  }
  if (estado === "libre") q = q.is("crm_f", null)
  if (grupo) q = q.eq("grupo_f.grupo_id", grupo)
  // Una selección puntual (exportar lo elegido).
  const ids = p.get("ids")
  if (ids) q = q.in("id", ids.split(",").filter(Boolean).slice(0, 1000))
  return q
}

/** Los ids de todos los que coinciden con un filtro, para las acciones en lote. */
export async function idsQueCoinciden(p: URLSearchParams): Promise<string[]> {
  const filas = await todas<{ id: string }>((a, b) =>
    consultaContactos(p, { columnas: "id" }).order("id").range(a, b) as unknown as PromiseLike<{
      data: { id: string }[] | null
      error: unknown
    }>
  )
  return filas.map((f) => f.id)
}

/**
 * A quiénes apunta una acción en lote: una lista de ids, o "todos los que
 * coinciden" con un filtro (lo que manda la tabla cuando se eligió eso).
 */
export async function destinatarios(b: { ids?: unknown; filtro?: unknown }): Promise<string[]> {
  if (typeof b.filtro === "string") return idsQueCoinciden(new URLSearchParams(b.filtro))
  return Array.isArray(b.ids) ? [...new Set(b.ids.filter((i): i is string => typeof i === "string"))] : []
}

/* ── GET · listado ─────────────────────────────────────────────────────────── */

export async function listarContactos(req: Request) {
  const p = new URL(req.url).searchParams
  const pagina = Math.max(1, Number(p.get("pagina")) || 1)
  const porPagina = Math.min(5000, Math.max(1, Number(p.get("porPagina")) || 25))
  const orden: Ordenable = ORDENABLES.includes(p.get("orden") as Ordenable) ? (p.get("orden") as Ordenable) : "created_at"
  const asc = p.get("dir") ? p.get("dir") === "asc" : orden !== "created_at"

  const q = consultaContactos(p, { columnas: SELECT, conteo: "exact" })

  // Las pestañas cuentan con los mismos filtros, cada una con su estado.
  const sinEstado = new URLSearchParams(p)
  sinEstado.delete("estado")
  const soloLibres = new URLSearchParams(sinEstado)
  soloLibres.set("estado", "libre")
  const sinAm = new URLSearchParams(sinEstado)
  sinAm.set("am", "sin")
  const conteoTodos = consultaContactos(sinEstado, { columnas: "id", conteo: "exact" })
  const conteoLibres = consultaContactos(soloLibres, { columnas: "id", conteo: "exact" })
  const conteoSinAm = consultaContactos(sinAm, { columnas: "id", conteo: "exact" })

  const desde = (pagina - 1) * porPagina
  const [listado, todos, libres, sinAmCuenta] = await Promise.all([
    q
      .order(orden, { ascending: asc, nullsFirst: false })
      .order("id")
      .range(desde, desde + porPagina - 1),
    conteoTodos,
    conteoLibres,
    conteoSinAm,
  ])

  if (listado.error) {
    console.error("[contactos GET]", listado.error)
    return NextResponse.json({ error: "No se pudieron cargar los contactos" }, { status: 500 })
  }

  return NextResponse.json({
    contactos: (listado.data ?? []).map((f) => aContacto(f as unknown as Fila)),
    total: listado.count ?? 0,
    // Las pestañas, con los filtros y la búsqueda puestos.
    conteos: { todos: todos.count ?? 0, libres: libres.count ?? 0, sinAm: sinAmCuenta.count ?? 0 },
  })
}

/* ── PATCH · en lote ───────────────────────────────────────────────────────── */

/**
 * Cambiar el AM o la vertical de muchos a la vez: `{ ids | filtro, amId?,
 * vertical? }`. `amId: null` deja sin AM.
 */
export async function editarEnLote(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ids = await destinatarios(b)
  if (ids.length === 0) return NextResponse.json({ error: "No hay a quién cambiar" }, { status: 400 })

  const cambios: Fila = {}
  if ("amId" in b) {
    if (b.amId === null || b.amId === "") {
      cambios.am_id = null
      cambios.am_nombre = null
    } else {
      const am = (await listarEquipo()).find((u) => u.id === b.amId)
      if (!am) return NextResponse.json({ error: "Ese AM no es parte del equipo" }, { status: 400 })
      cambios.am_id = am.id
      cambios.am_nombre = am.nombre
    }
  }
  if ("vertical" in b) cambios.vertical = texto(b.vertical)
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.from("contactos").update(cambios).in("id", ids.slice(i, i + 500))
    if (error) throw error
  }
  return NextResponse.json({ cambiados: ids.length })
}

/* ── GET · el resumen ─────────────────────────────────────────────────────── */

/**
 * Lo que no cambia al buscar ni al pasar de página: cuántas empresas y
 * verticales hay, y las opciones de los filtros. Aparte del listado a
 * propósito: antes se recalculaba leyendo la base entera en cada tecla del
 * buscador. El navegador lo guarda y lo vuelve a pedir solo después de un alta,
 * una edición o un borrado.
 */
export async function resumenContactos() {
  const [livianas, enCrm] = await Promise.all([
    todas<{ empresa: string | null; vertical: string | null; departamento: string | null }>((a, b) =>
      supabase.from("contactos").select("empresa, vertical, departamento").range(a, b)
    ),
    todas<{ contacto_id: string }>((a, b) =>
      supabase.from("crm_oportunidades").select("contacto_id").range(a, b)
    ),
  ])

  const kpis: KpisContactos = {
    total: livianas.length,
    empresas: new Set(livianas.map((f) => f.empresa?.trim().toLowerCase()).filter(Boolean)).size,
    verticales: new Set(livianas.map((f) => f.vertical?.trim().toLowerCase()).filter(Boolean)).size,
    enSeguimiento: new Set(enCrm.map((f) => f.contacto_id)).size,
  }

  const opciones: OpcionesContactos = {
    empresas: distintos(livianas.map((f) => f.empresa)),
    verticales: distintos(livianas.map((f) => f.vertical)),
    departamentos: distintos(livianas.map((f) => f.departamento)),
  }

  return NextResponse.json({ kpis, opciones })
}

/* ── Alta y edición ────────────────────────────────────────────────────────── */

/** El cuerpo de un contacto, validado. Devuelve el error como texto. */
function leerCuerpo(
  b: Record<string, unknown>,
  equipo: Usuario[]
): { fila: Fila } | { error: string } {
  const empresa = texto(b.empresa)
  if (!empresa) return { error: "La empresa es obligatoria" }

  const email = texto(b.email)?.toLowerCase() ?? null
  if (email && !esEmail(email)) return { error: "El email no es válido" }

  const nombre = texto(b.nombre)
  const apellido = texto(b.apellido)
  // Es una persona: sin nombre ni apellido no hay a quién llamar.
  if (!nombre && !apellido) return { error: "Cargá el nombre de la persona" }

  let amId: string | null = null
  let amNombre: string | null = null
  if (typeof b.amId === "string" && b.amId) {
    const am = equipo.find((u) => u.id === b.amId)
    if (!am) return { error: "El AM elegido no es parte del equipo" }
    amId = am.id
    amNombre = am.nombre
  }

  return {
    fila: {
      empresa,
      nombre,
      apellido,
      cargo: texto(b.cargo),
      departamento: texto(b.departamento),
      vertical: texto(b.vertical),
      email,
      telefono: texto(b.telefono, 60),
      observaciones: texto(b.observaciones, LIMITE_OBSERVACIONES),
      am_id: amId,
      am_nombre: amNombre,
    },
  }
}

const esDuplicado = (e: { code?: string } | null) => e?.code === "23505"

export async function crearContacto(req: Request, yo: Sesion) {
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const r = await insertarContacto(cuerpo, yo)
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status })
  if (r.yaExistia) {
    return NextResponse.json({ error: "Ya hay un contacto con ese email" }, { status: 409 })
  }
  return NextResponse.json({ contacto: r.contacto }, { status: 201 })
}

/**
 * El alta en sí, para las dos puertas: Contactos y el "Nuevo contacto" del
 * CRM. Si el mail ya está cargado devuelve esa persona con `yaExistia` en vez
 * de fallar: desde el CRM lo que se quiere es seguirla, no tener dos fichas.
 */
export async function insertarContacto(
  cuerpo: Record<string, unknown>,
  yo: Sesion
): Promise<{ contacto: Contacto; yaExistia: boolean } | { error: string; status: number }> {
  const leido = leerCuerpo(cuerpo, await listarEquipo())
  if ("error" in leido) return { error: leido.error, status: 400 }

  const { data, error } = await supabase
    .from("contactos")
    .insert({ ...leido.fila, created_by: yo.id })
    .select(SELECT)
    .single()

  if (esDuplicado(error) && leido.fila.email) {
    const { data: existente, error: e2 } = await supabase
      .from("contactos")
      .select(SELECT)
      .ilike("email", leido.fila.email as string)
      .maybeSingle()
    if (e2) throw e2
    if (existente) return { contacto: aContacto(existente as Fila), yaExistia: true }
  }
  if (error) throw error
  return { contacto: aContacto(data as Fila), yaExistia: false }
}

export async function editarContacto(req: Request, id: string) {
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const leido = leerCuerpo(cuerpo, await listarEquipo())
  if ("error" in leido) return NextResponse.json({ error: leido.error }, { status: 400 })

  const { data, error } = await supabase
    .from("contactos")
    .update(leido.fila)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle()

  if (esDuplicado(error)) {
    return NextResponse.json({ error: "Ya hay un contacto con ese email" }, { status: 409 })
  }
  if (error) throw error
  if (!data) return NextResponse.json({ error: "El contacto ya no existe" }, { status: 404 })
  return NextResponse.json({ contacto: aContacto(data as Fila) })
}

/** Borrar un contacto lo saca también de todos los CRM (cascade): el diálogo lo avisa. */
export async function borrarContactos(req: Request) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown }
  const lista = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : []
  if (lista.length === 0) return NextResponse.json({ error: "No hay nada para borrar" }, { status: 400 })

  const { error } = await supabase.from("contactos").delete().in("id", lista.slice(0, 1000))
  if (error) throw error
  return NextResponse.json({ borrados: lista.length })
}

/* ── Importación ──────────────────────────────────────────────────────────── */

/**
 * Dos pasos, como el importador de comprobantes: primero se lee la planilla y
 * se muestra qué entra, qué está repetido y qué no se entiende; recién después
 * se guarda lo que la persona confirmó. Nada se escribe en el primer paso.
 *
 *   multipart (archivo)  → previsualización
 *   JSON { filas }       → alta de las filas "nuevo"
 */
export async function importarContactos(req: Request, yo: Sesion) {
  const tipo = req.headers.get("content-type") ?? ""
  return tipo.includes("multipart/form-data") ? previsualizar(req) : confirmar(req, yo)
}

async function previsualizar(req: Request) {
  const form = await req.formData()
  const archivo = form.get("archivo")
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  if (archivo.size > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo pesa más de 6 MB" }, { status: 400 })
  }

  let grilla: { cabeceras: string[]; filas: string[][] }
  let recodificado = false
  try {
    if (esXlsx(archivo.name)) grilla = leerXlsx(await archivo.arrayBuffer())
    else if (esCsv(archivo.name)) {
      const csv = decodificarCsv(await archivo.arrayBuffer())
      recodificado = csv.recodificado
      grilla = parsearCsv(csv.texto)
    } else return NextResponse.json({ error: "Subí un .xlsx o un .csv" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof ArchivoInvalido ? e.message : "No se pudo leer el archivo"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Los encabezados pueden no estar en la primera fila: un título arriba, una
  // fila vacía. Se busca la fila que más columnas reconoce.
  const todasLasFilas = [grilla.cabeceras, ...grilla.filas]
  const h = buscarCabecera(todasLasFilas)
  const cabeceras = todasLasFilas[h].map((c) => c.trim())
  const datosCrudos = todasLasFilas.slice(h + 1).filter((f) => f.some((c) => (c ?? "").trim() !== ""))

  const mapa = mapearColumnas(cabeceras)
  if (mapa.empresa === undefined) {
    return NextResponse.json(
      {
        error: `No encontré la columna "Empresa". Encabezados leídos: ${cabeceras.filter(Boolean).join(", ") || "ninguno"}`,
      },
      { status: 400 }
    )
  }
  if (mapa.nombre === undefined && mapa.apellido === undefined && mapa.nombreCompleto === undefined) {
    return NextResponse.json(
      { error: 'No encontré una columna de nombre ("Nombre", "Apellido" o "Nombre y apellido")' },
      { status: 400 }
    )
  }
  if (datosCrudos.length > FILAS_IMPORT_MAX) {
    return NextResponse.json(
      { error: `La planilla tiene ${datosCrudos.length} filas; el máximo por vez es ${FILAS_IMPORT_MAX}` },
      { status: 400 }
    )
  }

  const [equipo, existentes] = await Promise.all([listarEquipo(), leerExistentes()])

  // Cómo se escribe hoy cada empresa, vertical y departamento, para no crear
  // "banco provincia" al lado de "Banco Provincia". Lo nuevo que aparece en la
  // planilla también se fija la primera vez que se ve.
  const canonicos = {
    empresa: new Map<string, string>(),
    vertical: new Map<string, string>(),
    departamento: new Map<string, string>(),
  }
  for (const e of existentes) {
    for (const campo of ["empresa", "vertical", "departamento"] as const) {
      const v = e[campo]
      if (v && !canonicos[campo].has(clave(v))) canonicos[campo].set(clave(v), v)
    }
  }
  const canonico = (campo: "empresa" | "vertical" | "departamento", valor: string) => {
    const k = clave(valor)
    const ya = canonicos[campo].get(k)
    if (ya) return ya
    canonicos[campo].set(k, valor)
    return valor
  }

  const porHuella = new Map<string, Existente>()
  for (const e of existentes) {
    const hu = huella(e)
    if (hu) porHuella.set(hu, e)
    // Alguien cargado con mail también se reconoce por nombre y empresa, por si
    // la planilla lo trae sin mail.
    if (e.email) {
      const sinMail = huella({ ...e, email: null })
      if (sinMail && !porHuella.has(sinMail)) porHuella.set(sinMail, e)
    }
  }
  const enPlanilla = new Map<string, number>()

  const filas: FilaImportada[] = datosCrudos.map((f, i) => {
    const { datos, arreglos } = leerFila(f, mapa, canonico)
    const amId = resolverAm(datos.am, equipo)
    // Numeradas en orden (#1, #2…) y no por fila de Excel: los lectores
    // descartan las filas vacías, y un número de fila corrido manda a buscar
    // a la persona equivocada.
    const base = { fila: i + 1, datos, amId, arreglos: arreglos.length ? arreglos : undefined }

    if (!datos.nombre && !datos.apellido) return { ...base, estado: "error", motivo: "Sin nombre" }
    if (!datos.empresa) return { ...base, estado: "error", motivo: "Sin empresa" }
    if (datos.email && !esEmail(datos.email)) return { ...base, estado: "error", motivo: "Mail inválido" }

    const hu = huella(datos)!
    const huSinMail = huella({ ...datos, email: "" })
    const existente = porHuella.get(hu) ?? (huSinMail ? porHuella.get(huSinMail) : undefined)
    if (existente) {
      const completaria = camposQueCompleta(existente, datos, amId)
      return {
        ...base,
        estado: "duplicado",
        motivo: completaria.length ? "Ya está: le faltan datos" : "Ya está en la base",
        existenteId: existente.id,
        completaria: completaria.length ? completaria : undefined,
      }
    }

    const previa = enPlanilla.get(hu) ?? (huSinMail ? enPlanilla.get(huSinMail) : undefined)
    if (previa !== undefined) return { ...base, estado: "repetido", motivo: `Igual a la #${previa}` }
    enPlanilla.set(hu, base.fila)
    if (huSinMail) enPlanilla.set(huSinMail, base.fila)
    return { ...base, estado: "nuevo" }
  })

  const usadas = new Set(Object.values(mapa))
  const respuesta: PrevisualizacionImport = {
    filas,
    columnasReconocidas: Object.keys(mapa) as CampoImportable[],
    columnasIgnoradas: cabeceras.filter((c, i) => c && !usadas.has(i)),
    filaCabecera: h + 1,
    recodificado,
  }
  return NextResponse.json(respuesta)
}

type Existente = {
  id: string
  email: string | null
  nombre: string | null
  apellido: string | null
  empresa: string | null
  cargo: string | null
  departamento: string | null
  vertical: string | null
  telefono: string | null
  observaciones: string | null
  am_id: string | null
}

const leerExistentes = () =>
  todas<Existente>((a, b) =>
    supabase
      .from("contactos")
      .select("id, email, nombre, apellido, empresa, cargo, departamento, vertical, telefono, observaciones, am_id")
      .range(a, b)
  )

/** Lo que la ficha existente tiene vacío y la planilla trae. Nunca pisa un dato. */
const COMPLETABLES = ["email", "apellido", "cargo", "departamento", "vertical", "telefono", "observaciones"] as const

function camposQueCompleta(e: Existente, d: FilaImportada["datos"], amId: string | null): CampoImportable[] {
  const campos: CampoImportable[] = COMPLETABLES.filter((c) => !e[c] && d[c])
  if (!e.am_id && amId) campos.push("am")
  return campos
}

/**
 * El AM de la planilla contra el equipo: por nombre completo, por iniciales
 * ("LB") o por el primer nombre si es único, sin importar acentos ni
 * mayúsculas. Lo que no se reconoce queda sin AM en vez de inventar a quién se
 * refería.
 */
function resolverAm(valor: string, equipo: Usuario[]): string | null {
  const v = clave(valor)
  if (!v) return null
  const nombres = equipo.map((u) => ({ id: u.id, k: clave(u.nombre) }))
  const exacto = nombres.find((u) => u.k === v)
  if (exacto) return exacto.id
  const iniciales = (k: string) =>
    k
      .split(" ")
      .map((p) => p[0])
      .join("")
  const porIniciales = nombres.filter((u) => iniciales(u.k) === v.replace(/[^a-z]/g, ""))
  if (porIniciales.length === 1) return porIniciales[0].id
  const porNombre = nombres.filter((u) => u.k.split(" ")[0] === v)
  if (porNombre.length === 1) return porNombre[0].id
  return null
}

/**
 * Guarda lo confirmado: las filas nuevas, y —si se pidió— completa los datos
 * vacíos de las personas que ya estaban, sin pisar nada que tengan cargado.
 */
async function confirmar(req: Request, yo: Sesion) {
  const { filas, completar } = (await req.json().catch(() => ({}))) as {
    filas?: unknown
    completar?: unknown
  }
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 })
  }
  if (filas.length > FILAS_IMPORT_MAX) {
    return NextResponse.json({ error: "Demasiadas filas" }, { status: 400 })
  }

  const equipo = await listarEquipo()
  const lista = filas as FilaImportada[]

  const aInsertar: Fila[] = []
  for (const f of lista.filter((x) => x.estado === "nuevo")) {
    const leido = leerCuerpo({ ...f.datos, amId: f.amId }, equipo)
    if ("fila" in leido) aInsertar.push({ ...leido.fila, created_by: yo.id })
  }

  // De a una tanda. El índice de mail frena un duplicado que alguien cargó
  // entre la vista previa y el confirmar: esa fila se saltea en vez de tirar
  // abajo la importación entera.
  let insertados = 0
  for (let i = 0; i < aInsertar.length; i += 500) {
    const tanda = aInsertar.slice(i, i + 500)
    const { data, error } = await supabase.from("contactos").insert(tanda).select("id")
    if (esDuplicado(error)) {
      for (const fila of tanda) {
        const r = await supabase.from("contactos").insert(fila)
        if (!r.error) insertados++
        else if (!esDuplicado(r.error)) throw r.error
      }
      continue
    }
    if (error) throw error
    insertados += data?.length ?? 0
  }

  // Completar: se vuelve a leer cada ficha y se escriben solo sus vacíos, así
  // nada que alguien haya cargado a mano se pierde por una planilla vieja.
  let completados = 0
  const aCompletar = completar === true ? lista.filter((x) => x.estado === "duplicado" && x.existenteId) : []
  if (aCompletar.length > 0) {
    const ids = [...new Set(aCompletar.map((x) => x.existenteId!))]
    const { data: actuales, error } = await supabase
      .from("contactos")
      .select("id, email, nombre, apellido, empresa, cargo, departamento, vertical, telefono, observaciones, am_id")
      .in("id", ids)
    if (error) throw error
    const porId = new Map((actuales ?? []).map((e) => [e.id as string, e as Existente]))

    for (const f of aCompletar) {
      const e = porId.get(f.existenteId!)
      if (!e) continue
      const leido = leerCuerpo({ ...f.datos, amId: f.amId }, equipo)
      if (!("fila" in leido)) continue
      const parche: Fila = {}
      for (const c of COMPLETABLES) if (!e[c] && leido.fila[c]) parche[c] = leido.fila[c]
      if (!e.am_id && leido.fila.am_id) {
        parche.am_id = leido.fila.am_id
        parche.am_nombre = leido.fila.am_nombre
      }
      if (Object.keys(parche).length === 0) continue
      const r = await supabase.from("contactos").update(parche).eq("id", e.id)
      // Un mail que ya usa otra ficha no se escribe; el resto sí.
      if (esDuplicado(r.error) && parche.email) {
        delete parche.email
        if (Object.keys(parche).length && !(await supabase.from("contactos").update(parche).eq("id", e.id)).error)
          completados++
        continue
      }
      if (r.error) throw r.error
      completados++
      // Para que dos filas de la planilla no completen dos veces lo mismo.
      Object.assign(e, parche)
    }
  }

  return NextResponse.json({
    insertados,
    completados,
    salteados: lista.length - insertados - completados,
  })
}
