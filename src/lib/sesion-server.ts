import type { User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { createSupabaseServer } from "@/lib/supabase-server"
import { accesoDeUsuario, type Modulo } from "@/lib/permisos"
import { listarEquipo } from "@/lib/tickets-server"
import { nombreDeUsuario } from "@/lib/usuario"

/**
 * Quién hace el pedido, en una sola llamada.
 *
 * Las rutas necesitan lo mismo después del chequeo de módulo: el id para
 * firmar lo que se escribe, el nombre para copiarlo al lado (PostgREST no hace
 * join contra `auth.users`) y si es admin para las reglas de "solo lo tuyo".
 */
export type Sesion = { id: string; nombre: string; admin: boolean }

export async function sesionActual(): Promise<Sesion | null> {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { id: user.id, nombre: nombreDeUsuario(user), admin: accesoDeUsuario(user).admin }
}

/**
 * El permiso y la sesión juntos.
 *
 * `exigirModulo` + `sesionActual` eran dos `getUser()` por pedido, y cada uno
 * es un viaje al servidor de autenticación de Supabase: la mitad del tiempo de
 * respuesta de Contactos y del CRM se iba en preguntar dos veces quién era la
 * misma persona. Esto pregunta una vez y devuelve las dos cosas.
 *
 *   const s = await sesionConModulo(["comercial"])
 *   if ("respuesta" in s) return s.respuesta
 *   return listarCrm(req, s.sesion)
 */
export async function sesionConModulo(
  modulos: Modulo[]
): Promise<{ sesion: Sesion } | { respuesta: NextResponse }> {
  const supabase = await createSupabaseServer()

  /*
   * `getClaims` y no `getUser`: el proyecto firma las sesiones con claves
   * asimétricas (ES256), así que la firma se verifica acá mismo con la clave
   * pública, sin ir al servidor de autenticación. `getUser` era un viaje de
   * red por pedido —desde Argentina, un cuarto de segundo— y es lo que
   * Supabase recomienda dejar para cuando hace falta el usuario fresco de la
   * base, que acá no.
   */
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) {
    return { respuesta: NextResponse.json({ error: "No autenticado" }, { status: 401 }) }
  }

  const user = {
    id: claims.sub,
    email: claims.email,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  } as unknown as User

  const acceso = accesoDeUsuario(user)
  if (!acceso.admin && !modulos.some((m) => acceso.modulos.includes(m))) {
    return {
      respuesta: NextResponse.json({ error: "Sin permiso para este módulo" }, { status: 403 }),
    }
  }

  // El nombre, de la lista del equipo (en memoria): el del token puede tener
  // hasta una hora de atraso si alguien lo cambió en Supabase.
  const delEquipo = (await listarEquipo()).find((u) => u.id === user.id)
  return {
    sesion: { id: user.id, nombre: delEquipo?.nombre ?? nombreDeUsuario(user), admin: acceso.admin },
  }
}
