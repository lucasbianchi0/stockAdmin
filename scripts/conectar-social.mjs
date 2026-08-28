/**
 * Conectar una cuenta para publicar: canjea el código/token corto que da la
 * plataforma por uno largo y lo guarda en `social_cuentas`.
 *
 * Se corre a mano y una sola vez por cuenta. No hay pantalla de OAuth en la app
 * a propósito: para un solo negocio con dos cuentas propias, construir el
 * redirect, el state y el callback es bastante código para algo que se usa dos
 * veces por año. A partir de acá los tokens se renuevan solos (ver lib/publicar/cuentas.ts).
 *
 *   node scripts/conectar-social.mjs instagram <token-corto>
 *   node scripts/conectar-social.mjs linkedin  <code-de-oauth> [urn-de-organizacion]
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const [, , destino, valor, extra] = process.argv

async function guardar(fila) {
  const { error } = await supabase
    .from("social_cuentas")
    .upsert({ ...fila, actualizado_at: new Date().toISOString() }, { onConflict: "destino" })

  if (error) throw new Error(error.message)

  console.log(`✓ ${fila.destino} conectado como ${fila.cuenta_nombre ?? fila.cuenta_id}`)
  console.log(`  vence: ${fila.expira_at ?? "no vence"}`)
}

async function instagram(tokenCorto) {
  const secret = process.env.INSTAGRAM_APP_SECRET
  if (!secret) throw new Error("Falta INSTAGRAM_APP_SECRET")

  // El token que devuelve el login dura una hora. Este canje lo lleva a 60 días,
  // y a partir de ahí se renueva solo mientras el cron corra al menos una vez
  // cada dos meses.
  const url = new URL("https://graph.instagram.com/access_token")
  url.searchParams.set("grant_type", "ig_exchange_token")
  url.searchParams.set("client_secret", secret)
  url.searchParams.set("access_token", tokenCorto)

  const res = await fetch(url)
  const cuerpo = await res.json()
  if (!res.ok || !cuerpo.access_token) {
    throw new Error(`No se pudo canjear el token: ${JSON.stringify(cuerpo)}`)
  }

  const perfilRes = await fetch(
    `https://graph.instagram.com/v23.0/me?fields=id,username&access_token=${cuerpo.access_token}`
  )
  const perfil = await perfilRes.json()
  if (!perfilRes.ok || !perfil.id) {
    throw new Error(`No se pudo leer el perfil: ${JSON.stringify(perfil)}`)
  }

  await guardar({
    destino: "instagram",
    cuenta_id: String(perfil.id),
    cuenta_nombre: perfil.username ?? null,
    access_token: cuerpo.access_token,
    refresh_token: null,
    expira_at: cuerpo.expires_in
      ? new Date(Date.now() + cuerpo.expires_in * 1000).toISOString()
      : null,
  })
}

async function linkedin(code, urnOrganizacion) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Faltan LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET o LINKEDIN_REDIRECT_URI")
  }

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const cuerpo = await res.json()
  if (!res.ok || !cuerpo.access_token) {
    throw new Error(`No se pudo canjear el código: ${JSON.stringify(cuerpo)}`)
  }

  // El URN de la organización se pasa a mano porque no se puede deducir: una
  // cuenta puede administrar varias páginas y elegir la equivocada significa
  // publicar en la página de otro. Sin él, se publica como la persona.
  let cuentaId = urnOrganizacion ?? null
  let cuentaNombre = urnOrganizacion ? "Página de empresa" : null

  if (!cuentaId) {
    const perfilRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${cuerpo.access_token}` },
    })
    const perfil = await perfilRes.json()
    if (!perfilRes.ok || !perfil.sub) {
      throw new Error(`No se pudo leer el perfil: ${JSON.stringify(perfil)}`)
    }
    cuentaId = `urn:li:person:${perfil.sub}`
    cuentaNombre = perfil.name ?? null
  }

  await guardar({
    destino: "linkedin",
    cuenta_id: cuentaId,
    cuenta_nombre: cuentaNombre,
    access_token: cuerpo.access_token,
    // Sólo lo entrega si la app tiene habilitada la renovación programática. Sin
    // él hay que volver a correr esto cada 60 días.
    refresh_token: cuerpo.refresh_token ?? null,
    expira_at: cuerpo.expires_in
      ? new Date(Date.now() + cuerpo.expires_in * 1000).toISOString()
      : null,
  })
}

const acciones = { instagram, linkedin }

if (!acciones[destino] || !valor) {
  console.error("Uso: node scripts/conectar-social.mjs <instagram|linkedin> <token-o-code> [urn]")
  process.exit(1)
}

acciones[destino](valor, extra).catch((e) => {
  console.error(`✗ ${e.message}`)
  process.exit(1)
})
