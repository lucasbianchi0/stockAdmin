/**
 * Fila de la base → lo que consume el tablero, y la lista del equipo.
 *
 * Vive aparte porque lo comparten las cinco rutas de la ticketera: el día que
 * una devuelva `asignado_nombre` y otra `asignadoNombre`, las tarjetas se
 * dibujan sin nadie asignado y sin un solo error en la consola.
 *
 * Sólo servidor: importa el cliente con service key.
 */

import { supabase } from "@/lib/supabase"
import { accesoDeUsuario } from "@/lib/permisos"
import { nombreDeUsuario } from "@/lib/usuario"
import { esEstado, type Imagen, type Proyecto, type Ticket, type Usuario } from "@/lib/tickets"

// En una sola línea y sin concatenar: el tipado de supabase-js lee la cadena
// como literal para inferir la forma de la fila, y un `"a" + "b"` la degrada a
// `string` — con lo que `data` pasa a ser un error genérico y no una fila.
export const COLUMNAS_TICKET =
  "id, titulo, descripcion, estado, proyecto_id, autor_id, autor_nombre, asignado_id, asignado_nombre, origen_agente, orden, created_at, updated_at"

export const COLUMNAS_PROYECTO = "id, nombre, color"

export const COLUMNAS_IMAGEN = "id, nombre, ruta, tipo_mime, tamano, created_at"

/** El bucket de las imágenes de tickets. Privado: una captura puede tener
 *  adentro datos de un cliente, así que nada se sirve por URL directa. */
export const BUCKET_TICKETS = "tickets"

/** Una hora. Alcanza de sobra para mirar o descargar, y si la pestaña queda
 *  abierta toda la tarde el enlace ya no sirve. */
const VENCIMIENTO_S = 3600

type Fila = Record<string, unknown>

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

export function aTicket(fila: Fila, imagenes = 0): Ticket {
  return {
    id: String(fila.id),
    titulo: String(fila.titulo ?? ""),
    descripcion: texto(fila.descripcion),
    // El check de la base ya garantiza el valor; el fallback cubre el hueco
    // entre desplegar una columna nueva y desplegar el código que la conoce,
    // que es donde el tablero perdería tarjetas.
    estado: esEstado(fila.estado) ? fila.estado : "backlog",
    proyectoId: texto(fila.proyecto_id),
    autorId: texto(fila.autor_id),
    autorNombre: String(fila.autor_nombre ?? "Alguien"),
    asignadoId: texto(fila.asignado_id),
    asignadoNombre: texto(fila.asignado_nombre),
    orden: Number(fila.orden) || 0,
    origenAgente: texto(fila.origen_agente),
    imagenes,
    createdAt: String(fila.created_at),
    updatedAt: String(fila.updated_at ?? fila.created_at),
  }
}

export function aProyecto(fila: Fila): Proyecto {
  return {
    id: String(fila.id),
    nombre: String(fila.nombre ?? ""),
    color: Number(fila.color) || 0,
  }
}

/**
 * El equipo: quién puede aparecer como avatar y a quién se le puede asignar.
 *
 * Sale de `auth.users` y no de una tabla de perfiles porque no hay tal tabla —
 * son menos de diez personas dadas de alta a mano desde el panel de Supabase
 * (ver `nombreDeUsuario`). Se filtra a los que tienen algún módulo: alguien sin
 * acceso no puede entrar a la app, y ofrecerlo en el selector de asignados
 * garantiza un ticket que nunca va a ver nadie.
 */
/**
 * Cuentas que NO salen en la Ticketera aunque tengan acceso de sobra.
 *
 * Si encontrás un mail escrito a mano acá y te preguntás por qué: es a pedido, y
 * es deliberado. Son cuentas con acceso a la app —esta es admin— que igual no
 * tienen que recibir tickets ni ocupar un avatar en el tablero. Sin esta lista
 * no hay forma de expresarlo, porque el equipo sale de `auth.users` filtrado por
 * permisos y ser admin es justo lo que te mete adentro.
 *
 * Sacar la línea la devuelve al tablero; no hay nada más que deshacer.
 */
const FUERA_DEL_TABLERO = ["diazstellamaris2@gmail.com"]

export async function listarEquipo(): Promise<Usuario[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })

  if (error) {
    console.error("[tickets equipo]", error)
    return []
  }

  return (data?.users ?? [])
    .filter((u) => {
      if (FUERA_DEL_TABLERO.includes((u.email ?? "").trim().toLowerCase())) return false
      const acceso = accesoDeUsuario(u)
      return acceso.admin || acceso.modulos.length > 0
    })
    .map((u) => ({ id: u.id, nombre: nombreDeUsuario(u) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/* ── Normalización de lo que llega del cliente ────────────────────────────── */

/** Texto limpio y con tope. Devuelve `""` para todo lo que no sea una cadena
 *  con contenido, así el llamador decide entre error y `null` en un solo lugar. */
export function recortar(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/** Un uuid o `null`. La base rechazaría cualquier otra cosa con un 500 que no
 *  dice nada; acá se convierte en "sin proyecto", que es lo que quiso decir. */
export function uuid(v: unknown): string | null {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : null
}

/**
 * El asignado, con su nombre resuelto contra el equipo real.
 *
 * El nombre no viaja desde el cliente a propósito: si lo mandara el navegador,
 * cualquiera podría asignarle un ticket a "El Jefe" y la tarjeta lo mostraría
 * así para siempre. Un id que no está en el equipo se trata como "sin asignar".
 */
export async function resolverAsignado(v: unknown): Promise<Usuario | null> {
  const id = uuid(v)
  if (!id) return null
  const equipo = await listarEquipo()
  return equipo.find((u) => u.id === id) ?? null
}

/** El `orden` de una tarjeta nueva: uno menos que la primera de su columna, o
 *  sea arriba de todo. Un ticket recién anotado al final de la lista es un
 *  ticket que nadie vuelve a ver. */
export async function ordenInicial(estado: string): Promise<number> {
  const { data } = await supabase
    .from("tickets")
    .select("orden")
    .eq("estado", estado)
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle()

  return (Number(data?.orden) || 0) - 1
}

/* ── Imágenes ─────────────────────────────────────────────────────────────── */

type FilaImagen = {
  id: string
  nombre: string
  ruta: string
  tipo_mime: string | null
  tamano: number | null
  created_at: string
}

/** Las URL firmadas de una tanda de imágenes, en un solo pedido. Una por
 *  llamada serían diez viajes para abrir un ticket con diez capturas. */
export async function conUrls(filas: FilaImagen[]): Promise<Imagen[]> {
  if (filas.length === 0) return []

  const { data: firmadas } = await supabase.storage
    .from(BUCKET_TICKETS)
    .createSignedUrls(
      filas.map((f) => f.ruta),
      VENCIMIENTO_S
    )

  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    tipoMime: f.tipo_mime,
    tamano: f.tamano,
    createdAt: f.created_at,
    url: porRuta.get(f.ruta) ?? null,
  }))
}

/**
 * Cuántas imágenes tiene cada ticket.
 *
 * Una sola consulta que trae los `ticket_id` y los cuenta acá, en vez de un
 * `count` agrupado por ticket: son unos cientos de filas de una columna, y
 * PostgREST no expone `group by` sin crear una vista para esto.
 *
 * El día que pasen del tope de filas de PostgREST, el número del clip de alguna
 * tarjeta va a quedar corto — nunca de más. Es un contador decorativo: cuando
 * eso pase, lo que corresponde es la vista agrupada, no paginar esto.
 */
export async function contarImagenes(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("ticket_imagenes").select("ticket_id")

  if (error) {
    console.error("[tickets contarImagenes]", error)
    return new Map()
  }

  const m = new Map<string, number>()
  for (const f of data ?? []) {
    const id = String(f.ticket_id)
    m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}
