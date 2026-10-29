import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { palabrasDeBusqueda } from "@/lib/busqueda"
import { clave, claveEmpresa } from "@/lib/marketing/contactos-import"
import { esEstadoCrm, type EstadoCrm } from "@/lib/comercial/crm"
import type { FichaEmpresa, PlantillaParaEnviar, Similar } from "@/lib/contactos-compartido"

/**
 * Lo que Contactos y el CRM usan por igual: avisar si una persona ya existe,
 * la ficha de una empresa y las plantillas de mensajes para escribirle a
 * alguien. Cuelga de `/api/contactos`, que habilita a los dos módulos.
 */

/* ── ¿Ya existe? ──────────────────────────────────────────────────────────── */

/**
 * Las personas que se parecen a la que se está cargando: mismo mail, o mismo
 * nombre y apellido (en la misma empresa pesa más). Se pide mientras se escribe
 * el formulario, para avisar antes de guardar y no después.
 */
export async function similares(req: Request) {
  const p = new URL(req.url).searchParams
  const email = (p.get("email") ?? "").trim().toLowerCase()
  const nombre = p.get("nombre") ?? ""
  const apellido = p.get("apellido") ?? ""
  const empresa = p.get("empresa") ?? ""
  const excluir = p.get("excluir")

  const persona = clave(`${nombre} ${apellido}`)
  const encontrados = new Map<string, Similar>()

  const agregar = (f: Record<string, unknown>, motivo: Similar["motivo"]) => {
    const id = f.id as string
    if (id === excluir || encontrados.has(id)) return
    encontrados.set(id, {
      id,
      nombre: [f.nombre, f.apellido].filter(Boolean).join(" ") || (f.email as string) || "Sin nombre",
      empresa: (f.empresa as string) ?? "",
      cargo: (f.cargo as string | null) ?? null,
      email: (f.email as string | null) ?? null,
      motivo,
    })
  }

  const columnas = "id, nombre, apellido, empresa, cargo, email"
  const [porMail, porNombre] = await Promise.all([
    email.includes("@")
      ? supabase.from("contactos").select(columnas).ilike("email", email).limit(3)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // Hace falta al menos un nombre y un apellido: con "Juan" solo, todo se parece.
    nombre.trim() && apellido.trim()
      ? (() => {
          let q = supabase.from("contactos").select(columnas)
          for (const w of palabrasDeBusqueda(`${nombre} ${apellido}`)) q = q.ilike("busqueda", `%${w}%`)
          return q.limit(10)
        })()
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  for (const f of porMail.data ?? []) agregar(f, "mail")
  for (const f of porNombre.data ?? []) {
    if (clave(`${f.nombre ?? ""} ${f.apellido ?? ""}`) !== persona) continue
    agregar(f, empresa && clave(String(f.empresa ?? "")) === clave(empresa) ? "persona" : "nombre")
  }

  return NextResponse.json({ similares: [...encontrados.values()].slice(0, 5) })
}

/* ── Empresas para sugerir ──────────────────────────────────────────────── */

/**
 * Las empresas de Contactos más las de Clientes que todavía no tienen a nadie
 * cargado, para que al dar de alta a alguien de un cliente aparezca su razón
 * social y la ficha encuentre sus presupuestos. Si ya está en Contactos (aunque
 * escrita con "S.A." en vez de "SA"), queda como está escrita ahí.
 */
export async function conEmpresasDeClientes(empresas: string[]): Promise<string[]> {
  const { data, error } = await supabase.from("clientes").select("razon_social").limit(2000)
  if (error) throw error
  const vistas = new Set(empresas.map(claveEmpresa))
  const nuevas: string[] = []
  for (const c of data ?? []) {
    const r = String(c.razon_social ?? "").trim()
    const k = claveEmpresa(r)
    if (!r || vistas.has(k)) continue
    vistas.add(k)
    nuevas.push(r)
  }
  return [...empresas, ...nuevas].sort((a, b) => a.localeCompare(b, "es"))
}

/* ── La ficha de una empresa ──────────────────────────────────────────────── */

/**
 * Todo lo de una empresa en un lugar: sus personas (con quién las sigue y en
 * qué etapa), y si ya es cliente, sus presupuestos.
 *
 * La empresa de un contacto es texto, no una ficha: se busca por nombre sin
 * mayúsculas ni acentos. El cliente se busca por razón social, además sin
 * puntos ni forma societaria: "ANDREANI LOGISTICA S.A." en Contactos es
 * "ANDREANI LOGISTICA SA" en Clientes. Si no hay una igual, vale la única que
 * empiece igual ("Andreani" → "Andreani Logística SA").
 */
export async function fichaEmpresa(req: Request) {
  const nombre = (new URL(req.url).searchParams.get("nombre") ?? "").trim()
  if (!nombre) return NextResponse.json({ error: "Falta la empresa" }, { status: 400 })
  const k = clave(nombre)

  let qPersonas = supabase
    .from("contactos")
    .select(
      "id, nombre, apellido, cargo, departamento, vertical, email, telefono, observaciones, am_id, am_nombre, empresa, crm:crm_oportunidades(id, owner_id, owner_nombre, estado, probabilidad, producto, proxima_accion, fecha_proxima, presupuesto_id)"
    )
  for (const w of palabrasDeBusqueda(nombre)) qPersonas = qPersonas.ilike("busqueda", `%${w}%`)

  const [personas, clientes] = await Promise.all([
    qPersonas.limit(200),
    supabase.from("clientes").select("id, razon_social").limit(2000),
  ])
  if (personas.error) throw personas.error

  const deLaEmpresa = (personas.data ?? []).filter((f) => clave(String(f.empresa ?? "")) === k)
  if (clientes.error) throw clientes.error
  const ke = claveEmpresa(nombre)
  const conClave = (clientes.data ?? []).map((c) => ({ ...c, k: claveEmpresa(c.razon_social) }))
  const parecidos = conClave.filter((c) => c.k.startsWith(`${ke} `) || ke.startsWith(`${c.k} `))
  const cliente = conClave.find((c) => c.k === ke) ?? (parecidos.length === 1 ? parecidos[0] : null)

  let presupuestos: FichaEmpresa["presupuestos"] = []
  if (cliente) {
    const { data, error } = await supabase
      .from("presupuestos")
      .select("id, numero, referencia, estado, fecha")
      .eq("cliente_id", cliente.id)
      .order("fecha", { ascending: false })
      .limit(10)
    if (error) throw error
    presupuestos = (data ?? []).map((pr) => ({
      id: pr.id,
      numero: pr.numero,
      referencia: pr.referencia,
      estado: pr.estado,
      fecha: pr.fecha,
    }))
  }

  const ficha: FichaEmpresa = {
    nombre: deLaEmpresa[0]?.empresa ?? nombre,
    vertical: deLaEmpresa.find((f) => f.vertical)?.vertical ?? null,
    personas: deLaEmpresa.map((f) => ({
      id: f.id,
      nombre: [f.nombre, f.apellido].filter(Boolean).join(" ") || f.email || "Sin nombre",
      cargo: f.cargo,
      departamento: f.departamento,
      email: f.email,
      telefono: f.telefono,
      observaciones: f.observaciones ?? null,
      amId: f.am_id,
      amNombre: f.am_nombre,
      crm: ((f.crm as Record<string, unknown>[] | null) ?? []).map((o) => ({
        id: o.id as string,
        ownerId: o.owner_id as string,
        ownerNombre: o.owner_nombre as string,
        estado: (esEstadoCrm(o.estado) ? o.estado : "nuevo") as EstadoCrm,
        probabilidad: Number(o.probabilidad ?? 0),
        proyecto: (o.producto as string | null) ?? null,
        proximaAccion: (o.proxima_accion as string | null) ?? null,
        fechaProxima: (o.fecha_proxima as string | null) ?? null,
      })),
    })),
    cliente: cliente ? { id: cliente.id, razonSocial: cliente.razon_social } : null,
    presupuestos,
  }
  return NextResponse.json(ficha)
}

/* ── Plantillas para escribirle a alguien ─────────────────────────────────── */

/**
 * Las plantillas de Marketing → Plantillas de mensajes que sirven para escribirle
 * a un contacto: las de mail y WhatsApp (y LinkedIn, que se copia). Primero las
 * más usadas, que es lo que más probablemente se busca.
 */
export async function plantillasParaEnviar() {
  const { data, error } = await supabase
    .from("mensajes_plantilla")
    .select("id, titulo, circunstancia, canal, asunto, cuerpo, cuando_usar, usos")
    .in("canal", ["email", "whatsapp", "linkedin"])
    .order("usos", { ascending: false })
    .order("titulo")
  if (error) throw error

  const plantillas: PlantillaParaEnviar[] = (data ?? []).map((m) => ({
    id: m.id,
    titulo: m.titulo,
    circunstancia: m.circunstancia,
    canal: m.canal,
    asunto: m.asunto,
    cuerpo: m.cuerpo,
    cuandoUsar: m.cuando_usar,
  }))
  return NextResponse.json({ plantillas })
}

/** "Se usó una vez más", igual que al copiar desde Plantillas. Nunca falla. */
export async function usarPlantilla(id: string) {
  const { error } = await supabase.rpc("mensaje_plantilla_usado", { p_id: id })
  if (error) console.error("[plantilla uso]", error)
  return NextResponse.json({ ok: true })
}
