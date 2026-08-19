import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { accesoDeUsuario, esPublica, homeDe, puede } from "@/lib/permisos"

/**
 * Puerta única de la app: corre en el edge ANTES de renderizar nada, así que una
 * página prohibida no se esconde — no se sirve.
 *
 * Es la primera barrera, no la única. Cada handler de `/api` vuelve a chequear
 * por su cuenta: el `matcher` de acá tiene exclusiones y el día que alguien lo
 * toque para dejar pasar un asset, el chequeo del handler sigue en pie.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  /*
   * La muestra de placas, solo en desarrollo.
   *
   * Se saltea acá y no sumándola a `PUBLICAS` a propósito: esa lista es la
   * frontera de seguridad de toda la app y ensancharla para una herramienta de
   * diseño es la clase de cambio que después nadie recuerda haber hecho. Acá
   * queda atado a NODE_ENV, y la propia ruta vuelve a chequearlo y devuelve 404
   * en producción — dos candados para algo que no debería existir allá.
   */
  if (process.env.NODE_ENV !== "production" && pathname === "/api/contenido/placa/muestra") {
    return response
  }

  const { data: { user } } = await supabase.auth.getUser()
  const esApi = pathname.startsWith("/api/")

  // ── 1. Sesión ────────────────────────────────────────────────────────────
  if (!user) {
    if (esPublica(pathname)) return response
    // A una llamada de API se le contesta con un código, no con el HTML del
    // login: un fetch que recibe una redirección a una pantalla de ingreso
    // falla de una forma imposible de diagnosticar desde el cliente.
    if (esApi) return json(401, "No autenticado")
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL(homeDe(accesoDeUsuario(user)), request.url))
  }

  // ── 2. Permisos ──────────────────────────────────────────────────────────
  const acceso = accesoDeUsuario(user)

  // Quien sí tiene módulos no tiene nada que hacer en la pantalla de sin acceso.
  if (pathname === "/sin-acceso" && acceso.modulos.length > 0) {
    return NextResponse.redirect(new URL(homeDe(acceso), request.url))
  }

  if (esPublica(pathname)) return response

  if (acceso.modulos.length === 0) {
    if (esApi) return json(403, "El usuario no tiene módulos asignados")
    if (pathname !== "/sin-acceso") {
      return NextResponse.redirect(new URL("/sin-acceso", request.url))
    }
    return response
  }

  if (!puede(acceso, pathname)) {
    if (esApi) return json(403, "Sin permiso para este módulo")
    return NextResponse.redirect(new URL(homeDe(acceso), request.url))
  }

  return response
}

function json(status: number, error: string) {
  return new NextResponse(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
