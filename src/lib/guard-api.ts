import type { User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { createSupabaseServer } from "@/lib/supabase-server"
import { accesoDeUsuario, type Modulo } from "@/lib/permisos"

/**
 * Segunda barrera de permisos, pegada al dato.
 *
 * El middleware ya corta antes, pero es una sola pieza con un `matcher` lleno de
 * exclusiones: alcanza con que alguien lo edite para dejar pasar un asset para
 * abrir un agujero que nadie nota. Esto cuesta una línea por handler y falla
 * cerrado.
 *
 * Acá importa más que en otras apps: todos los handlers consultan Supabase con
 * la *service role key*, que ignora las políticas RLS. No hay una red debajo —
 * este chequeo es la red.
 *
 *   export async function GET() {
 *     const no = await exigirModulo("productos")
 *     if (no) return no
 *     ...
 *   }
 */
/**
 * Quién hace el pedido, leído del token y no del servidor de autenticación.
 *
 * `getClaims` y no `getUser`, por lo mismo que en lib/sesion-server.ts: las
 * sesiones van firmadas con claves asimétricas (ES256), así que la firma se
 * verifica acá con la clave pública —que queda en memoria— sin el viaje de
 * red de `getUser`, un cuarto de segundo desde Argentina en CADA pedido de
 * Administración. Los permisos salen del mismo `app_metadata` que miraba
 * antes, que viaja adentro del token.
 *
 * Lo que se resigna, y se aceptó: un cambio de módulos o una baja tarda en
 * notarse hasta que el token se renueva (una hora como mucho). Si el proyecto
 * volviera a firmar con una clave simétrica, `getClaims` cae solo en `getUser`
 * y esto sigue andando, nomás más lento.
 */
async function usuarioDelToken(): Promise<User | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  // Lo justo para `accesoDeUsuario` y para firmar lo que se escribe.
  return {
    id: claims.sub,
    email: claims.email,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  } as unknown as User
}

export async function exigirModulo(modulo: Modulo): Promise<NextResponse | null> {
  return exigirAlgunModulo([modulo])
}

/**
 * Para los pocos endpoints genuinamente compartidos entre módulos —la cotización
 * del dólar es el caso—: alcanza con tener uno de los de la lista. Tiene que
 * coincidir con lo que declara `RUTAS` en lib/permisos.ts, o el middleware corta
 * antes y esto no llega a ejecutarse nunca.
 */
export async function exigirAlgunModulo(
  modulos: Modulo[]
): Promise<NextResponse | null> {
  const r = await exigirModuloConUsuario(modulos)
  return r.error
}

/**
 * El chequeo de módulo y el id de quien pide, de una sola lectura del token.
 *
 * Las altas necesitan el id para el `created_by`, y antes lo sacaban con un
 * segundo `getUser()` después del chequeo: dos preguntas por la misma
 * persona. `admin` viaja para las pantallas que muestran o esconden algo según
 * quién mira (reabrir un período cerrado).
 *
 *   const s = await exigirModuloConUsuario(["administracion"])
 *   if (s.error) return s.error
 *   ... created_by: s.usuarioId
 */
export async function exigirModuloConUsuario(
  modulos: Modulo[]
): Promise<
  | { error: NextResponse; usuarioId: null; admin: false }
  | { error: null; usuarioId: string; admin: boolean }
> {
  const user = await usuarioDelToken()

  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
      usuarioId: null,
      admin: false,
    }
  }

  const acceso = accesoDeUsuario(user)
  if (!acceso.admin && !modulos.some((m) => acceso.modulos.includes(m))) {
    return {
      error: NextResponse.json({ error: "Sin permiso para este módulo" }, { status: 403 }),
      usuarioId: null,
      admin: false,
    }
  }

  return { error: null, usuarioId: user.id, admin: acceso.admin }
}

/**
 * Sólo administradores, sin importar los módulos.
 *
 * Para lo que se decidió mostrar únicamente a quien administra el sistema —el
 * stock, por pedido de Lucas el 15/10/2026; reabrir un período contable
 * cerrado—. Devuelve también el id del usuario, que es lo que piden las altas
 * para el `created_by`. El mensaje cambia según qué se le está negando.
 */
export async function exigirAdmin(
  mensaje = "Sólo los administradores ven el stock"
): Promise<
  { error: NextResponse; usuarioId: null } | { error: null; usuarioId: string }
> {
  const user = await usuarioDelToken()

  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }), usuarioId: null }
  }
  if (!accesoDeUsuario(user).admin) {
    return {
      error: NextResponse.json({ error: mensaje }, { status: 403 }),
      usuarioId: null,
    }
  }
  return { error: null, usuarioId: user.id }
}
