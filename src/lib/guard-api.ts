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
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const acceso = accesoDeUsuario(user)
  if (!acceso.admin && !modulos.some((m) => acceso.modulos.includes(m))) {
    return NextResponse.json({ error: "Sin permiso para este módulo" }, { status: 403 })
  }

  return null
}
