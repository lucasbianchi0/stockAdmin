import { createHmac, timingSafeEqual } from "node:crypto"

import { traerTodo } from "@/lib/admin/paginar"
import { supabase } from "@/lib/supabase"
import {
  claveTelefono,
  type ConversacionWhatsapp,
  type Direccion,
  type MensajeWhatsapp,
} from "@/lib/whatsapp"

/**
 * WhatsApp → backoffice, a través de Kapso.
 *
 * ── CÓMO LLEGAN ──
 *
 * El número sigue en la app de WhatsApp Business del celular. Kapso lo conecta
 * a la API oficial en modo coexistencia y avisa por webhook de cada mensaje:
 * los que escriben los clientes (`inbound`) y los que el equipo contesta desde
 * el teléfono (`outbound`, con `origin: business_app`). Al conectar, Kapso
 * además trae hasta seis meses de historial; eso se copia acá con
 * `importarHistorial`, que lee la API de Kapso de punta a punta.
 *
 * Las dos puertas terminan en `guardarMensajes`, y como el `wamid` es único,
 * da lo mismo que un mensaje llegue por las dos o dos veces por la misma.
 *
 * ── CONTACTOS ──
 *
 * Cada número es una conversación. La primera vez que aparece se busca un
 * contacto con el mismo teléfono (por los últimos diez dígitos); si no hay, se
 * crea uno con el nombre del perfil de WhatsApp y empresa "Sin empresa", para
 * que alguien lo complete. Una conversación ya vinculada no se vuelve a tocar:
 * si alguien la vinculó a mano a otro contacto, eso manda.
 */

export const EMPRESA_SIN_DATOS = "Sin empresa"

type MensajeNormalizado = {
  wamid: string
  telefono: string
  nombrePerfil: string | null
  direccion: Direccion
  origen: string | null
  tipo: string
  texto: string | null
  enviadoAt: string
}

type Crudo = Record<string, unknown>

const obj = (v: unknown): Crudo => (v && typeof v === "object" ? (v as Crudo) : {})
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

/**
 * Un mensaje de Kapso, venga del webhook (`message` + `conversation`) o de la
 * API de listado (todo dentro de `message.kapso`). `null` si no se puede saber
 * de quién es: sin teléfono no hay a qué conversación pegarlo.
 */
export function normalizarMensaje(message: unknown, conversation?: unknown): MensajeNormalizado | null {
  const m = obj(message)
  const k = obj(m.kapso)
  const c = obj(conversation)

  const wamid = str(m.id)
  if (!wamid) return null

  const direccion: Direccion = k.direction === "outbound" ? "saliente" : "entrante"
  const telefono = (
    str(c.phone_number) ??
    str(k.phone_number) ??
    (direccion === "entrante" ? str(m.from) : str(m.to)) ??
    ""
  ).replace(/\D/g, "")
  if (telefono.length < 8) return null

  const segundos = Number(m.timestamp)
  const enviadoAt = Number.isFinite(segundos) && segundos > 0
    ? new Date(segundos * 1000).toISOString()
    : new Date().toISOString()

  const tipo = str(m.type) ?? "text"
  const texto = str(k.content) ?? str(obj(m.text).body) ?? str(k.transcript) ?? null

  return {
    wamid,
    telefono,
    nombrePerfil: str(c.contact_name) ?? str(k.contact_name),
    direccion,
    origen: str(k.origin),
    tipo,
    texto: texto ? texto.slice(0, 8000) : null,
    enviadoAt,
  }
}

/** Guarda una tanda de mensajes. Devuelve cuántos eran nuevos. */
export async function guardarMensajes(lista: MensajeNormalizado[]): Promise<number> {
  const porTelefono = new Map<string, MensajeNormalizado[]>()
  for (const m of lista) porTelefono.set(m.telefono, [...(porTelefono.get(m.telefono) ?? []), m])

  let nuevos = 0
  for (const [telefono, mensajes] of porTelefono) {
    const nombrePerfil = mensajes.find((m) => m.nombrePerfil)?.nombrePerfil ?? null
    const conversacion = await conversacionDe(telefono, nombrePerfil)

    const { data, error } = await supabase
      .from("whatsapp_mensajes")
      .upsert(
        mensajes.map((m) => ({
          wamid: m.wamid,
          conversacion_id: conversacion.id,
          direccion: m.direccion,
          origen: m.origen,
          tipo: m.tipo,
          texto: m.texto,
          enviado_at: m.enviadoAt,
        })),
        { onConflict: "wamid", ignoreDuplicates: true }
      )
      .select("id")
    if (error) throw error
    nuevos += data?.length ?? 0

    if (data?.length) await actualizarResumen(conversacion.id)
  }
  return nuevos
}

async function conversacionDe(telefono: string, nombrePerfil: string | null) {
  const { data: existente, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, contacto_id, nombre_perfil")
    .eq("telefono", telefono)
    .maybeSingle()
  if (error) throw error

  if (existente) {
    const cambios: Crudo = {}
    if (nombrePerfil && existente.nombre_perfil !== nombrePerfil) cambios.nombre_perfil = nombrePerfil
    if (!existente.contacto_id) cambios.contacto_id = await contactoPara(telefono, nombrePerfil)
    if (Object.keys(cambios).length) {
      const r = await supabase.from("whatsapp_conversaciones").update(cambios).eq("id", existente.id)
      if (r.error) throw r.error
    }
    return { id: existente.id as string }
  }

  const contactoId = await contactoPara(telefono, nombrePerfil)
  const { data, error: e2 } = await supabase
    .from("whatsapp_conversaciones")
    .upsert(
      { telefono, nombre_perfil: nombrePerfil, contacto_id: contactoId },
      { onConflict: "telefono" }
    )
    .select("id")
    .single()
  if (e2) throw e2
  return { id: data.id as string }
}

/** El contacto con ese teléfono, o uno nuevo con lo que dice el perfil. */
async function contactoPara(telefono: string, nombrePerfil: string | null): Promise<string> {
  const clave = claveTelefono(telefono)
  // La ficha guarda el teléfono como lo escribió cada uno: se trae por los
  // últimos cuatro dígitos (que tiene que tener en cualquier formato) y se
  // compara entero acá.
  const { filas, error } = await traerTodo<{ id: string; telefono: string | null }>(() =>
    supabase
      .from("contactos")
      .select("id, telefono")
      .like("telefono", `%${telefono.slice(-4)}`)
      .order("created_at")
      .order("id")
  )
  if (error) throw error
  const igual = filas.find((f) => claveTelefono(f.telefono) === clave)
  if (igual) return igual.id

  const [nombre, ...resto] = (nombrePerfil ?? "").split(/\s+/).filter(Boolean)
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
  const { data, error: e2 } = await supabase
    .from("contactos")
    .insert({
      empresa: EMPRESA_SIN_DATOS,
      nombre: nombre ?? null,
      apellido: resto.length ? resto.join(" ") : null,
      telefono: `+${telefono}`,
      observaciones: `Llegó por WhatsApp el ${hoy}.`,
    })
    .select("id")
    .single()
  if (e2) throw e2
  return data.id as string
}

async function actualizarResumen(conversacionId: string) {
  const [{ data: ultimo, error: e1 }, { count, error: e2 }] = await Promise.all([
    supabase
      .from("whatsapp_mensajes")
      .select("texto, tipo, direccion, enviado_at")
      .eq("conversacion_id", conversacionId)
      .order("enviado_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("whatsapp_mensajes")
      .select("id", { count: "exact", head: true })
      .eq("conversacion_id", conversacionId),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const { error } = await supabase
    .from("whatsapp_conversaciones")
    .update({
      mensajes: count ?? 0,
      ultimo_mensaje_at: ultimo?.enviado_at ?? null,
      ultimo_texto: ultimo ? (ultimo.texto ?? `[${ultimo.tipo}]`).slice(0, 200) : null,
      ultima_direccion: ultimo?.direccion ?? null,
    })
    .eq("id", conversacionId)
  if (error) throw error
}

/* ── El webhook ─────────────────────────────────────────────────────────── */

/** Firma HMAC-SHA256 en hex sobre el cuerpo tal cual llegó. */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string): boolean {
  if (!firma) return false
  const esperada = Buffer.from(createHmac("sha256", secreto).update(cuerpo).digest("hex"), "utf8")
  const recibida = Buffer.from(firma, "utf8")
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

/**
 * Lo que manda Kapso: un evento suelto o, con buffering, `{ batch: true,
 * data: [...] }`. Sirve cualquier `whatsapp.message.*`: los de estado
 * (entregado, leído) traen el mismo `wamid` y no agregan nada.
 */
export async function procesarWebhook(evento: string | null, cuerpo: unknown): Promise<number> {
  if (evento && !evento.startsWith("whatsapp.message.")) return 0
  const b = obj(cuerpo)
  const items = b.batch === true && Array.isArray(b.data) ? (b.data as unknown[]) : [cuerpo]
  const mensajes = items
    .map((it) => normalizarMensaje(obj(it).message, obj(it).conversation))
    .filter((m): m is MensajeNormalizado => m !== null)
  return mensajes.length ? guardarMensajes(mensajes) : 0
}

/* ── El historial ───────────────────────────────────────────────────────── */

const KAPSO_API = "https://api.kapso.ai/meta/whatsapp/v24.0"

export function kapsoConfigurado() {
  return Boolean(process.env.KAPSO_API_KEY && process.env.KAPSO_PHONE_NUMBER_ID)
}

/**
 * Todo lo que Kapso tiene del número, de a cien. Se puede correr las veces que
 * haga falta: lo que ya estaba se saltea.
 */
export async function importarHistorial(): Promise<{ leidos: number; nuevos: number }> {
  const clave = process.env.KAPSO_API_KEY
  const numero = process.env.KAPSO_PHONE_NUMBER_ID
  if (!clave || !numero) throw new Error("Falta configurar KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID")

  let leidos = 0
  let nuevos = 0
  let despues: string | null = null
  for (let pagina = 0; pagina < 500; pagina++) {
    const p = new URLSearchParams({ limit: "100", fields: "kapso()" })
    if (despues) p.set("after", despues)
    const res = await fetch(`${KAPSO_API}/${encodeURIComponent(numero)}/messages?${p}`, {
      headers: { "X-API-Key": clave },
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`Kapso respondió ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = obj(await res.json())
    const datos = Array.isArray(json.data) ? (json.data as unknown[]) : []
    leidos += datos.length
    const mensajes = datos
      .map((m) => normalizarMensaje(m))
      .filter((m): m is MensajeNormalizado => m !== null)
    if (mensajes.length) nuevos += await guardarMensajes(mensajes)

    despues = str(obj(obj(json.paging).cursors).after)
    if (!despues || datos.length === 0) break
  }
  return { leidos, nuevos }
}

/* ── Lectura ────────────────────────────────────────────────────────────── */

type FilaConversacion = {
  id: string
  telefono: string
  nombre_perfil: string | null
  ultimo_mensaje_at: string | null
  ultimo_texto: string | null
  ultima_direccion: Direccion | null
  mensajes: number
  contacto: { id: string; nombre: string | null; apellido: string | null; empresa: string } | null
}

function aConversacion(f: FilaConversacion): ConversacionWhatsapp {
  const c = f.contacto
  return {
    id: f.id,
    telefono: f.telefono,
    nombrePerfil: f.nombre_perfil,
    contacto: c
      ? { id: c.id, nombre: [c.nombre, c.apellido].filter(Boolean).join(" "), empresa: c.empresa }
      : null,
    ultimoMensajeAt: f.ultimo_mensaje_at,
    ultimoTexto: f.ultimo_texto,
    ultimaDireccion: f.ultima_direccion,
    mensajes: f.mensajes,
  }
}

const SELECT_CONVERSACION =
  "id, telefono, nombre_perfil, ultimo_mensaje_at, ultimo_texto, ultima_direccion, mensajes, contacto:contactos(id, nombre, apellido, empresa)"

export async function listarConversaciones(): Promise<ConversacionWhatsapp[]> {
  // PostgREST tipa el contacto como lista; al ser muchos-a-uno llega un objeto.
  const { filas, error } = await traerTodo<unknown>(() =>
    supabase
      .from("whatsapp_conversaciones")
      .select(SELECT_CONVERSACION)
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
      .order("id")
  )
  if (error) throw error
  return (filas as FilaConversacion[]).map(aConversacion)
}

export async function mensajesDe(conversacionId: string): Promise<MensajeWhatsapp[]> {
  const { filas, error } = await traerTodo<{
    id: string
    direccion: Direccion
    origen: string | null
    tipo: string
    texto: string | null
    enviado_at: string
  }>(() =>
    supabase
      .from("whatsapp_mensajes")
      .select("id, direccion, origen, tipo, texto, enviado_at")
      .eq("conversacion_id", conversacionId)
      .order("enviado_at")
      .order("id")
  )
  if (error) throw error
  return filas.map((m) => ({
    id: m.id,
    direccion: m.direccion,
    origen: m.origen,
    tipo: m.tipo,
    texto: m.texto,
    enviadoAt: m.enviado_at,
  }))
}

/** El chat de un contacto (casi siempre uno; dos si tiene dos números). */
export async function whatsappDeContacto(
  contactoId: string
): Promise<{ conversacion: ConversacionWhatsapp; mensajes: MensajeWhatsapp[] }[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select(SELECT_CONVERSACION)
    .eq("contacto_id", contactoId)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
  if (error) throw error
  return Promise.all(
    ((data ?? []) as unknown as FilaConversacion[]).map(async (f) => ({
      conversacion: aConversacion(f),
      mensajes: await mensajesDe(f.id),
    }))
  )
}
