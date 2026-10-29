import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
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

  /*
   * La subida programada de conversiones: la lee Google Ads una vez por día, sin
   * sesión ni forma de tenerla. Igual que la muestra, va acá y no en `PUBLICAS`:
   * es una sola ruta exacta, y el handler exige usuario y contraseña (Basic) y
   * devuelve 404 si la clave no está configurada. Lo único que expone es gclid
   * y hora — ni nombres, ni teléfonos, ni mensajes.
   */
  if (
    pathname === "/api/marketing/conversiones/programada" ||
    pathname === "/api/marketing/conversiones/contactos.csv"
  ) {
    return response
  }

  /*
   * El webhook de WhatsApp: lo llama Kapso con cada mensaje, sin sesión. Misma
   * idea que la de arriba: una ruta exacta, y el handler rechaza todo lo que no
   * venga firmado con `KAPSO_WEBHOOK_SECRET` (y devuelve 404 sin el secreto).
   */
  if (pathname === "/api/whatsapp/webhook") {
    return response
  }

  /*
   * Donde los agentes y procesos avisan que corrieron (calendario): una rutina
   * de Claude o un workflow no tienen sesión. Ruta exacta, y el handler exige
   * `CRON_SECRET` y devuelve 404 sin él.
   */
  if (pathname === "/api/calendario/corridas") {
    return response
  }

  /*
   * La sincronización diaria de LinkedIn (Windsor.ai): la llama el cron de
   * GitHub Actions, sin sesión. Una ruta exacta, y el handler pide el
   * `CRON_SECRET` o, si no lo trae, una sesión con el módulo de marketing.
   */
  if (pathname === "/api/marketing/linkedin/sincronizar") {
    return response
  }

  /*
   * Lo mismo para Instagram y Facebook (API de Meta): cron diario de GitHub
   * Actions sin sesión, y el handler pide `CRON_SECRET` o el módulo de marketing.
   */
  if (pathname === "/api/marketing/redes/sincronizar") {
    return response
  }

  /*
   * Y la publicación programada (publicar.yml, cada quince minutos). Sin esta
   * excepción el middleware le contestaba 401 al cron y nada agendado salía.
   * El handler pide `CRON_SECRET` o una sesión con el módulo de marketing.
   */
  if (pathname === "/api/contenido/publicar/tick") {
    return response
  }

  /*
   * `getClaims` y no `getUser`: la firma del token se verifica acá con la clave
   * pública (ES256, ver lib/sesion-server.ts), sin el viaje al servidor de
   * autenticación que `getUser` hacía en CADA pedido —páginas y API—.
   *
   * La cookie se sigue renovando: `getClaims` pasa por `getSession`, que
   * refresca el token cuando está por vencer y lo escribe con el `setAll` de
   * arriba. Lo que se resigna es lo mismo que en lib/guard-api.ts: un cambio de
   * módulos o una sesión revocada se notan recién cuando el token se renueva
   * (una hora como mucho).
   */
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsError ? null : claimsData?.claims
  const user: User | null = claims?.sub
    ? ({
        id: claims.sub,
        email: claims.email,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
      } as unknown as User)
    : null
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
