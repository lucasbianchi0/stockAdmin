import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Sesion } from "@/lib/sesion-server"
import { listarEquipo } from "@/lib/tickets-server"
import type { Usuario } from "@/lib/tickets"
import { esCsv, parsearCsv } from "@/lib/admin/importar-csv"
import { ArchivoInvalido, esXlsx, leerXlsx } from "@/lib/admin/xlsx"
import { todas } from "@/lib/marketing/contactos-server"
import { esEmail } from "@/lib/marketing/contactos"
import {
  capitalizar,
  clave,
  decodificarCsv,
  huella,
  limpiarEmail,
  limpiarTelefono,
  partirNombre,
} from "@/lib/marketing/contactos-import"
import { EQUIPO, ESTADO_CRM_LABEL, esEstadoCrm, reglaDeCierre, type EstadoCrm } from "@/lib/comercial/crm"
import {
  FILAS_IMPORT_PROYECTOS_MAX,
  buscarCabeceraProyecto,
  leerEtapa,
  leerFecha,
  leerPorcentaje,
  mapearColumnasProyecto,
  type CampoProyecto,
  type DatosProyectoImportado,
  type FilaProyectoImportada,
  type PrevisualizacionProyectos,
} from "@/lib/comercial/crm-import"

/**
 * Importar proyectos al CRM desde la planilla de cada comercial.
 *
 * Dos pasos, como Contactos: el primero (multipart) lee y dice qué va a pasar
 * con cada fila sin escribir nada; el segundo (JSON) guarda lo confirmado.
 *
 * Las personas se buscan en Contactos (por mail, o por nombre + empresa): si
 * están, el proyecto se engancha a esa ficha; si no, se crean una sola vez
 * aunque aparezcan en diez filas. Un proyecto que esa persona ya tiene en ese
 * CRM (mismo nombre) no se duplica: se muestra qué cambiaría y se actualiza
 * solo si se pide.
 */

type Fila = Record<string, unknown>

type ContactoExistente = {
  id: string
  email: string | null
  nombre: string | null
  apellido: string | null
  empresa: string | null
  cargo: string | null
  telefono: string | null
}

type ProyectoExistente = {
  id: string
  contacto_id: string
  owner_id: string
  producto: string | null
  estado: string
  probabilidad: number
  proxima_accion: string | null
  fecha_proxima: string | null
  ultimo_contacto: string | null
  motivo_perdida: string | null
  notas: string | null
  empresa: string | null
}

const puedeCargarEn = (yo: Sesion, ownerId: string) => yo.admin || yo.id === ownerId
const nombreDe = (n: string | null, a: string | null) => [n, a].filter(Boolean).join(" ")

/** Alguien del equipo por nombre completo, iniciales ("LB") o primer nombre si es único. */
function resolverPersonaEquipo(valor: string, equipo: Usuario[]): Usuario | null {
  const v = clave(valor)
  if (!v) return null
  const nombres = equipo.map((u) => ({ u, k: clave(u.nombre) }))
  const exacto = nombres.find((x) => x.k === v)
  if (exacto) return exacto.u
  const iniciales = (k: string) =>
    k
      .split(" ")
      .map((p) => p[0])
      .join("")
  const porIniciales = nombres.filter((x) => iniciales(x.k) === v.replace(/[^a-z]/g, ""))
  if (porIniciales.length === 1) return porIniciales[0].u
  const porNombre = nombres.filter((x) => x.k.split(" ")[0] === v.split(" ")[0])
  if (porNombre.length === 1) return porNombre[0].u
  return null
}

export async function importarProyectos(req: Request, yo: Sesion) {
  const tipo = req.headers.get("content-type") ?? ""
  return tipo.includes("multipart/form-data") ? previsualizar(req, yo) : confirmar(req, yo)
}

/* ── Paso 1 · leer y mostrar ─────────────────────────────────────────────── */

async function previsualizar(req: Request, yo: Sesion) {
  const form = await req.formData()
  const archivo = form.get("archivo")
  const ownerPedido = String(form.get("ownerId") ?? "")
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
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

  const todasLasFilas = [grilla.cabeceras, ...grilla.filas]
  const h = buscarCabeceraProyecto(todasLasFilas)
  const cabeceras = todasLasFilas[h].map((c) => (c ?? "").trim())
  const crudas = todasLasFilas.slice(h + 1).filter((f) => f.some((c) => (c ?? "").trim() !== ""))
  const mapa = mapearColumnasProyecto(cabeceras)

  const faltan = [
    mapa.empresa === undefined && '"Empresa"',
    mapa.proyecto === undefined && '"Proyecto"',
    mapa.nombre === undefined && mapa.apellido === undefined && mapa.nombreCompleto === undefined && mapa.email === undefined &&
      '"Contacto" (o "Nombre", o "Email")',
  ].filter(Boolean)
  if (faltan.length > 0) {
    return NextResponse.json(
      {
        error: `Falta la columna ${faltan.join(", ")}. Encabezados leídos: ${cabeceras.filter(Boolean).join(", ") || "ninguno"}`,
      },
      { status: 400 }
    )
  }
  if (crudas.length > FILAS_IMPORT_PROYECTOS_MAX) {
    return NextResponse.json(
      { error: `La planilla tiene ${crudas.length} filas; el máximo por vez es ${FILAS_IMPORT_PROYECTOS_MAX}` },
      { status: 400 }
    )
  }

  const [equipo, contactos, proyectos] = await Promise.all([
    listarEquipo(),
    todas<ContactoExistente>((a, b) =>
      supabase.from("contactos").select("id, email, nombre, apellido, empresa, cargo, telefono").range(a, b)
    ),
    todas<Fila>((a, b) =>
      supabase
        .from("crm_oportunidades")
        .select(
          "id, contacto_id, owner_id, producto, estado, probabilidad, proxima_accion, fecha_proxima, ultimo_contacto, motivo_perdida, notas, contacto:contactos (empresa)"
        )
        .range(a, b)
    ),
  ])

  // Sin columna "Dueño", todo va al CRM que se está mirando (o al propio, desde
  // la vista del equipo).
  const ownerPorDefecto =
    ownerPedido && ownerPedido !== EQUIPO ? (equipo.find((u) => u.id === ownerPedido) ?? null) : null
  const yoComoUsuario = equipo.find((u) => u.id === yo.id) ?? { id: yo.id, nombre: yo.nombre }
  const destino = ownerPorDefecto ?? yoComoUsuario

  // Empresas como ya están escritas en Contactos: "andreani" → "Andreani".
  const empresas = new Map<string, string>()
  for (const c of contactos) if (c.empresa && !empresas.has(clave(c.empresa))) empresas.set(clave(c.empresa), c.empresa)

  const porHuella = new Map<string, ContactoExistente>()
  for (const c of contactos) {
    const hu = huella(c)
    if (hu) porHuella.set(hu, c)
    if (c.email) {
      const sinMail = huella({ ...c, email: null })
      if (sinMail && !porHuella.has(sinMail)) porHuella.set(sinMail, c)
    }
  }

  const existentes: ProyectoExistente[] = proyectos.map((p) => ({
    ...(p as unknown as ProyectoExistente),
    probabilidad: Number(p.probabilidad ?? 0),
    empresa: ((p.contacto as Fila | null)?.empresa as string | null) ?? null,
  }))
  const proyectoDe = new Map<string, ProyectoExistente>()
  for (const p of existentes) {
    if (p.producto) proyectoDe.set(`${p.owner_id}|${p.contacto_id}|${clave(p.producto)}`, p)
  }

  const vistos = new Map<string, number>()
  // Personas nuevas de la planilla: cada forma de reconocerla (mail, nombre +
  // empresa) apunta a la misma clave, la de la primera fila donde aparece.
  const nuevasPorHuella = new Map<string, string>()
  const celda = (f: string[], c: CampoProyecto) => {
    const i = mapa[c]
    return i === undefined ? "" : (f[i] ?? "").replace(/\s+/g, " ").trim()
  }

  const filas: FilaProyectoImportada[] = crudas.map((f, i) => {
    const arreglos: string[] = []
    const avisos: string[] = []

    // La persona.
    let nombre = celda(f, "nombre")
    let apellido = celda(f, "apellido")
    if (!nombre && !apellido && celda(f, "nombreCompleto")) ({ nombre, apellido } = partirNombre(celda(f, "nombreCompleto")))
    const n = capitalizar(nombre)
    const a = capitalizar(apellido)
    if (n.cambio || a.cambio) arreglos.push("mayúsculas corregidas")
    const email = limpiarEmail(celda(f, "email"))
    if (email.cambio) arreglos.push("mail limpiado")
    const telefono = limpiarTelefono(celda(f, "telefono"))
    if (telefono.dudoso) avisos.push("teléfono redondeado por Excel")

    const empresaCruda = celda(f, "empresa")
    const empresa = empresas.get(clave(empresaCruda)) ?? empresaCruda
    if (empresaCruda && empresa !== empresaCruda) arreglos.push(`empresa como en Contactos: ${empresa}`)

    // Etapa y % juntos, con la misma regla que el CRM.
    const etapa = leerEtapa(celda(f, "estado"))
    if (!etapa.entendida) avisos.push(`etapa “${celda(f, "estado")}” no se entendió: queda En seguimiento`)
    const pct = leerPorcentaje(celda(f, "probabilidad"))
    if (pct.nota) arreglos.push(pct.nota)
    const traeCierre = etapa.estado !== null || pct.valor !== null
    const cierre = reglaDeCierre(
      { estado: "nuevo", probabilidad: 0 },
      { estado: etapa.estado ?? undefined, probabilidad: pct.valor ?? undefined }
    )
    if (etapa.estado && pct.valor !== null && (cierre.estado !== etapa.estado || cierre.probabilidad !== pct.valor)) {
      arreglos.push(`${ESTADO_CRM_LABEL[cierre.estado]} va con ${cierre.probabilidad}%`)
    }

    const fecha = (c: "fechaProxima" | "ultimoContacto") => {
      const r = leerFecha(celda(f, c))
      if (r.nota) avisos.push(r.nota)
      return r.valor
    }
    const texto = (c: CampoProyecto, max = 300) => celda(f, c).slice(0, max) || null

    const datos: DatosProyectoImportado = {
      empresa,
      nombre: n.valor,
      apellido: a.valor,
      email: email.valor,
      telefono: telefono.valor,
      cargo: celda(f, "cargo"),
      proyecto: celda(f, "proyecto").slice(0, 120),
      estado: cierre.estado,
      probabilidad: cierre.probabilidad,
      proximaAccion: texto("proximaAccion", 200),
      fechaProxima: fecha("fechaProxima"),
      ultimoContacto: fecha("ultimoContacto"),
      motivoPerdida: cierre.estado === "perdida" ? texto("motivoPerdida", 200) : null,
      notas: texto("notas", 4000),
    }

    // De quién es.
    const duenoTexto = celda(f, "dueno")
    const owner = duenoTexto ? resolverPersonaEquipo(duenoTexto, equipo) : destino

    const base = {
      fila: i + 1,
      datos,
      traeCierre,
      ownerId: owner?.id ?? null,
      ownerNombre: owner?.nombre ?? null,
      persona: null,
      arreglos: arreglos.length ? arreglos : undefined,
      avisos: avisos.length ? avisos : undefined,
    }
    const error = (motivo: string): FilaProyectoImportada => ({ ...base, estado: "error", motivo })

    if (!datos.empresa) return error("Sin empresa")
    if (!datos.proyecto) return error("Sin proyecto")
    if (!datos.nombre && !datos.apellido && !datos.email) return error("Sin contacto")
    if (datos.email && !esEmail(datos.email)) return error("Mail inválido")
    if (!owner) return error(`“${duenoTexto}” no es nadie del equipo`)
    if (!puedeCargarEn(yo, owner.id)) return error(`Solo podés cargar en tu CRM (dice ${owner.nombre})`)

    // La persona en Contactos. Sin nombre pero con mail, se busca solo por mail.
    const hu = huella(datos)
    const huSinMail = huella({ ...datos, email: "" })
    const contacto = (hu && porHuella.get(hu)) ?? (huSinMail ? porHuella.get(huSinMail) : undefined)
    if (!contacto && !datos.nombre && !datos.apellido) return error("El mail no está en Contactos y falta el nombre")

    const persona = contacto ? { id: contacto.id, nombre: nombreDe(contacto.nombre, contacto.apellido) || contacto.email || "" } : null
    let personaNueva: string | undefined
    if (!contacto) {
      const huellas = [hu, huSinMail].filter((x): x is string => !!x)
      personaNueva = huellas.map((x) => nuevasPorHuella.get(x)).find(Boolean) ?? `n${base.fila}`
      for (const x of huellas) nuevasPorHuella.set(x, personaNueva)
    }
    const conPersona = { ...base, persona, personaNueva }

    // ¿Ya está ese proyecto con esa persona en ese CRM?
    const ya = contacto ? proyectoDe.get(`${owner.id}|${contacto.id}|${clave(datos.proyecto)}`) : undefined
    if (ya) {
      const cambios = describirCambios(ya, datos, traeCierre)
      return {
        ...conPersona,
        estado: "existente",
        proyectoId: ya.id,
        motivo: cambios.length ? "Ya está: cambia" : "Ya está, igual",
        cambios: cambios.length ? cambios : undefined,
      }
    }

    // Repetido en el archivo: misma persona, mismo proyecto, mismo dueño.
    const quien = contacto ? contacto.id : personaNueva!
    const k = `${owner.id}|${quien}|${clave(datos.proyecto)}`
    const previa = vistos.get(k)
    if (previa !== undefined) return { ...conPersona, estado: "repetido", motivo: `Igual a la #${previa}` }
    vistos.set(k, base.fila)

    // Un proyecto con el mismo nombre en la misma empresa, con otra persona:
    // puede ser el mismo cargado dos veces. Se avisa, no se frena.
    const parecido = existentes.find(
      (p) =>
        p.owner_id === owner.id &&
        p.producto &&
        clave(p.producto) === clave(datos.proyecto) &&
        p.empresa &&
        clave(p.empresa) === clave(datos.empresa)
    )
    if (parecido) {
      conPersona.avisos = [...(conPersona.avisos ?? []), `ya hay un “${datos.proyecto}” en ${datos.empresa} con otra persona`]
    }

    return { ...conPersona, estado: "nuevo" }
  })

  const usadas = new Set(Object.values(mapa))
  const respuesta: PrevisualizacionProyectos = {
    filas,
    columnasReconocidas: Object.keys(mapa) as CampoProyecto[],
    columnasIgnoradas: cabeceras.filter((c, i) => c && !usadas.has(i)),
    filaCabecera: h + 1,
    recodificado,
  }
  return NextResponse.json(respuesta)
}

/** Las columnas que un proyecto existente tomaría de la fila: solo lo que la
 *  planilla trae y es distinto. Una celda vacía no borra nada. */
function columnasQueCambian(p: ProyectoExistente, d: DatosProyectoImportado, traeCierre: boolean): Fila {
  const cols: Fila = {}
  if (traeCierre) {
    const antes = { estado: (esEstadoCrm(p.estado) ? p.estado : "nuevo") as EstadoCrm, probabilidad: p.probabilidad }
    const r = reglaDeCierre(antes, { estado: d.estado, probabilidad: d.probabilidad })
    if (r.estado !== antes.estado) cols.estado = r.estado
    if (r.probabilidad !== antes.probabilidad) cols.probabilidad = r.probabilidad
  }
  const pares: [keyof DatosProyectoImportado, keyof ProyectoExistente][] = [
    ["proximaAccion", "proxima_accion"],
    ["fechaProxima", "fecha_proxima"],
    ["ultimoContacto", "ultimo_contacto"],
    ["motivoPerdida", "motivo_perdida"],
    ["notas", "notas"],
  ]
  for (const [dk, pk] of pares) {
    const v = d[dk]
    if (v !== null && v !== "" && v !== p[pk]) cols[pk] = v
  }
  return cols
}

function describirCambios(p: ProyectoExistente, d: DatosProyectoImportado, traeCierre: boolean): string[] {
  const cols = columnasQueCambian(p, d, traeCierre)
  const out: string[] = []
  if (cols.estado) out.push(`${ESTADO_CRM_LABEL[p.estado as EstadoCrm] ?? p.estado} → ${ESTADO_CRM_LABEL[cols.estado as EstadoCrm]}`)
  if (cols.probabilidad !== undefined) out.push(`${p.probabilidad}% → ${cols.probabilidad}%`)
  if (cols.proxima_accion) out.push("próxima acción")
  if (cols.fecha_proxima) out.push("fecha próxima")
  if (cols.ultimo_contacto) out.push("último contacto")
  if (cols.motivo_perdida) out.push("motivo de pérdida")
  if (cols.notas) out.push("notas")
  return out
}

/* ── Paso 2 · guardar ─────────────────────────────────────────────────────── */

async function confirmar(req: Request, yo: Sesion) {
  const b = (await req.json().catch(() => ({}))) as { filas?: unknown; actualizar?: unknown; archivo?: unknown }
  if (!Array.isArray(b.filas) || b.filas.length === 0) {
    return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 })
  }
  if (b.filas.length > FILAS_IMPORT_PROYECTOS_MAX) {
    return NextResponse.json({ error: "Demasiadas filas" }, { status: 400 })
  }
  const filas = b.filas as FilaProyectoImportada[]
  const actualizar = b.actualizar === true
  const archivo = typeof b.archivo === "string" ? b.archivo.slice(0, 120) : "una planilla"

  const equipo = await listarEquipo()
  const delEquipo = new Map(equipo.map((u) => [u.id, u]))
  const nuevas = filas.filter((f) => f.estado === "nuevo")
  const aActualizar = actualizar ? filas.filter((f) => f.estado === "existente" && f.proyectoId && f.cambios?.length) : []

  // Lo mismo que se validó al leer, otra vez: el cuerpo viene del navegador.
  for (const f of [...nuevas, ...aActualizar]) {
    if (!f.ownerId || !delEquipo.has(f.ownerId) || !puedeCargarEn(yo, f.ownerId)) {
      return NextResponse.json({ error: `Fila #${f.fila}: solo podés cargar en tu CRM` }, { status: 403 })
    }
    if (!esEstadoCrm(f.datos.estado)) return NextResponse.json({ error: `Fila #${f.fila}: etapa inválida` }, { status: 400 })
  }

  // 1 · Las personas que faltan, una vez cada una aunque estén en varias filas.
  const contactoDe = new Map<number, string>()
  const creadas = new Map<string, string>()
  let personasNuevas = 0
  for (const f of nuevas) {
    if (f.persona) {
      contactoDe.set(f.fila, f.persona.id)
      continue
    }
    const d = f.datos
    const hu = f.personaNueva ?? huella(d) ?? `fila${f.fila}`
    const ya = creadas.get(hu)
    if (ya) {
      contactoDe.set(f.fila, ya)
      continue
    }
    const owner = delEquipo.get(f.ownerId!)!
    const fila = {
      empresa: d.empresa.slice(0, 200),
      nombre: d.nombre || null,
      apellido: d.apellido || null,
      cargo: d.cargo || null,
      email: d.email || null,
      telefono: d.telefono || null,
      // El AM de la persona nueva es quien va a trabajar el proyecto.
      am_id: owner.id,
      am_nombre: owner.nombre,
      created_by: yo.id,
    }
    let { data, error } = await supabase.from("contactos").insert(fila).select("id").single()
    // Alguien la cargó entre la vista previa y el confirmar: se usa esa ficha.
    if (error?.code === "23505" && fila.email) {
      ;({ data, error } = await supabase.from("contactos").select("id").ilike("email", fila.email).maybeSingle())
    }
    if (error) throw error
    if (!data) continue
    creadas.set(hu, data.id as string)
    contactoDe.set(f.fila, data.id as string)
    personasNuevas++
  }

  // 2 · Los proyectos nuevos, de a tandas.
  const aInsertar = nuevas
    .filter((f) => contactoDe.has(f.fila))
    .map((f) => {
      const d = f.datos
      const owner = delEquipo.get(f.ownerId!)!
      const cierre = reglaDeCierre({ estado: "nuevo", probabilidad: 0 }, { estado: d.estado, probabilidad: d.probabilidad })
      return {
        contacto_id: contactoDe.get(f.fila)!,
        owner_id: owner.id,
        owner_nombre: owner.nombre,
        producto: d.proyecto.slice(0, 120),
        estado: cierre.estado,
        probabilidad: cierre.probabilidad,
        proxima_accion: d.proximaAccion,
        fecha_proxima: d.fechaProxima,
        ultimo_contacto: d.ultimoContacto,
        motivo_perdida: cierre.estado === "perdida" ? d.motivoPerdida : null,
        notas: d.notas,
        created_by: yo.id,
      }
    })
  const insertados: { id: string; estado: string; probabilidad: number }[] = []
  for (let i = 0; i < aInsertar.length; i += 500) {
    const { data, error } = await supabase
      .from("crm_oportunidades")
      .insert(aInsertar.slice(i, i + 500))
      .select("id, estado, probabilidad")
    if (error) throw error
    insertados.push(...((data ?? []) as typeof insertados))
  }

  // 3 · Los que ya estaban, si se pidió: se relee cada uno y se escribe solo
  //     lo que cambia, con la regla de etapa y %.
  let actualizados = 0
  const historial: Fila[] = insertados.map((p) => ({
    oportunidad_id: p.id,
    tipo: "alta",
    texto: `Importado desde ${archivo} (${ESTADO_CRM_LABEL[p.estado as EstadoCrm] ?? p.estado}, ${p.probabilidad}%)`,
    autor_id: yo.id,
    autor_nombre: yo.nombre,
  }))
  if (aActualizar.length > 0) {
    const ids = [...new Set(aActualizar.map((f) => f.proyectoId!))]
    const { data, error } = await supabase
      .from("crm_oportunidades")
      .select("id, contacto_id, owner_id, producto, estado, probabilidad, proxima_accion, fecha_proxima, ultimo_contacto, motivo_perdida, notas")
      .in("id", ids)
    if (error) throw error
    const porId = new Map((data ?? []).map((p) => [p.id as string, { ...(p as unknown as ProyectoExistente), probabilidad: Number(p.probabilidad), empresa: null }]))
    for (const f of aActualizar) {
      const p = porId.get(f.proyectoId!)
      if (!p || !puedeCargarEn(yo, p.owner_id)) continue
      const cols = columnasQueCambian(p, f.datos, f.traeCierre)
      if (Object.keys(cols).length === 0) continue
      if (cols.estado && cols.estado !== "perdida") cols.motivo_perdida = null
      const r = await supabase.from("crm_oportunidades").update(cols).eq("id", p.id)
      if (r.error) throw r.error
      actualizados++
      historial.push({
        oportunidad_id: p.id,
        tipo: cols.estado || cols.probabilidad !== undefined ? "cambio_estado" : "nota",
        texto: `Actualizado desde ${archivo}: ${describirCambios(p, f.datos, f.traeCierre).join(", ")}`,
        autor_id: yo.id,
        autor_nombre: yo.nombre,
      })
      // Dos filas sobre el mismo proyecto: la segunda parte de lo que dejó la primera.
      Object.assign(p, cols)
    }
  }

  for (let i = 0; i < historial.length; i += 500) {
    const { error } = await supabase.from("crm_actividades").insert(historial.slice(i, i + 500))
    // El historial acompaña: si falla, lo importado igual quedó.
    if (error) console.error("[crm importar historial]", error)
  }

  return NextResponse.json({ proyectos: insertados.length, personasNuevas, actualizados })
}
