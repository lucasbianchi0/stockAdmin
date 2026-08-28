/**
 * Las cuentas conectadas y sus tokens.
 *
 * Vive aparte de los publicadores porque los dos necesitan lo mismo —traer un
 * token válido— y el vencimiento se maneja distinto en cada plataforma. Meterlo
 * dentro de cada publicador garantizaría que un día uno renueve y el otro no.
 *
 * Solo servidor: importa el cliente de Supabase con service key.
 */

import { supabase } from "@/lib/supabase"

export const DESTINOS = ["instagram", "linkedin", "facebook"] as const
export type Destino = (typeof DESTINOS)[number]

export type Cuenta = {
  destino: Destino
  /** IG User ID, o el URN completo del autor en LinkedIn. */
  cuentaId: string
  cuentaNombre: string | null
  accessToken: string
  refreshToken: string | null
  /** Null = no vence (token de usuario de sistema de Meta). */
  expiraAt: string | null
}

/**
 * Cuánto antes del vencimiento se considera que un token ya está vencido.
 *
 * Siete días y no cinco minutos: los tokens de estas dos plataformas duran 60
 * días y renovarlos exige que el token viejo TODAVÍA SIRVA. Un margen corto
 * significa que basta con que el cron esté caído el fin de semana en que vence
 * para perder la sesión y tener que reconectar a mano.
 */
const MARGEN_MS = 7 * 24 * 60 * 60 * 1000

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

export async function traerCuenta(destino: Destino): Promise<Cuenta | null> {
  const { data, error } = await supabase
    .from("social_cuentas")
    .select("destino, cuenta_id, cuenta_nombre, access_token, refresh_token, expira_at")
    .eq("destino", destino)
    .maybeSingle()

  if (error) {
    console.error("[publicar cuentas]", error)
    return null
  }
  if (!data) return null

  return {
    destino,
    cuentaId: String(data.cuenta_id),
    cuentaNombre: texto(data.cuenta_nombre),
    accessToken: String(data.access_token),
    refreshToken: texto(data.refresh_token),
    expiraAt: texto(data.expira_at),
  }
}

export async function guardarToken(
  destino: Destino,
  campos: { accessToken: string; refreshToken?: string | null; expiraAt?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("social_cuentas")
    .update({
      access_token: campos.accessToken,
      ...(campos.refreshToken !== undefined ? { refresh_token: campos.refreshToken } : {}),
      ...(campos.expiraAt !== undefined ? { expira_at: campos.expiraAt } : {}),
      actualizado_at: new Date().toISOString(),
    })
    .eq("destino", destino)

  if (error) throw new Error(`No se pudo guardar el token de ${destino}: ${error.message}`)
}

/** Le quedan menos de siete días, o ya venció. */
export function porVencer(cuenta: Cuenta): boolean {
  if (!cuenta.expiraAt) return false
  return new Date(cuenta.expiraAt).getTime() - Date.now() < MARGEN_MS
}

/**
 * El token de Instagram, renovado si hace falta.
 *
 * Meta renueva sin secreto de app: se le pasa el token vigente y devuelve otro
 * de 60 días. La única condición es que el actual tenga más de 24 horas de vida,
 * así que llamar a esto en cada publicación no serviría de nada — por eso sólo
 * se dispara cuando entra en la ventana de los siete días.
 */
export async function tokenInstagram(cuenta: Cuenta): Promise<string> {
  if (!porVencer(cuenta)) return cuenta.accessToken

  const url = new URL("https://graph.instagram.com/refresh_access_token")
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", cuenta.accessToken)

  const res = await fetch(url, { method: "GET" })
  const cuerpo = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null

  if (!res.ok || !cuerpo?.access_token) {
    // No se tira: el token viejo puede seguir sirviendo hoy y cortar la
    // publicación por un refresh fallido sería romper algo que todavía anda.
    // Lo que sí hace falta es que quede escrito, porque en siete días esto pasa
    // de ser un aviso a ser una caída.
    console.error("[publicar] no se pudo renovar el token de Instagram", cuerpo)
    return cuenta.accessToken
  }

  const expiraAt = cuerpo.expires_in
    ? new Date(Date.now() + cuerpo.expires_in * 1000).toISOString()
    : null

  await guardarToken("instagram", { accessToken: cuerpo.access_token, expiraAt })
  return cuerpo.access_token
}

/**
 * El token de LinkedIn, renovado si hace falta.
 *
 * A diferencia de Meta, acá el refresh es OAuth estándar y necesita el secreto
 * de la app. Y el refresh token sólo lo entrega LinkedIn a las apps que lo
 * tienen habilitado: sin él, cuando vencen los 60 días hay que volver a
 * autorizar a mano. Por eso el mensaje de error dice qué hacer y no sólo que
 * falló.
 */
export async function tokenLinkedin(cuenta: Cuenta): Promise<string> {
  if (!porVencer(cuenta)) return cuenta.accessToken

  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

  if (!cuenta.refreshToken || !clientId || !clientSecret) {
    console.error(
      "[publicar] el token de LinkedIn está por vencer y no se puede renovar solo: " +
        "reconectá la cuenta con `node scripts/conectar-social.mjs linkedin`"
    )
    return cuenta.accessToken
  }

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cuenta.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const cuerpo = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; refresh_token?: string }
    | null

  if (!res.ok || !cuerpo?.access_token) {
    console.error("[publicar] no se pudo renovar el token de LinkedIn", cuerpo)
    return cuenta.accessToken
  }

  const expiraAt = cuerpo.expires_in
    ? new Date(Date.now() + cuerpo.expires_in * 1000).toISOString()
    : null

  await guardarToken("linkedin", {
    accessToken: cuerpo.access_token,
    // LinkedIn puede rotar el refresh token en cada uso. Guardar el nuevo no es
    // opcional: si se conserva el viejo, la renovación siguiente falla.
    refreshToken: cuerpo.refresh_token ?? cuenta.refreshToken,
    expiraAt,
  })

  return cuerpo.access_token
}
