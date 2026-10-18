import { ruta } from "@/lib/admin/ruta"
import { respuestaProgramada } from "@/lib/marketing/conversiones-programadas"

/**
 * El archivo que Google Ads viene a buscar solo, todos los días.
 *
 * ── POR QUE EXISTE ──
 *
 * Google cerró la subida de conversiones por API a esta cuenta
 * (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`, 13/9/2026), y un botón que
 * alguien tiene que apretar es donde la medición muere. La subida programada de
 * Google Ads (Objetivos → Subidas → Programar, fuente HTTPS) lee esta dirección
 * una vez por día y carga lo que encuentra. No hace falta que nadie haga nada.
 *
 * ── QUE DEVUELVE ──
 *
 * Sólo los clics a WhatsApp, teléfono o mail de gente que vino de un anuncio,
 * como `Contacto directo`, de los últimos 90 días. Todos, cada vez: Google
 * ignora una fila con el mismo gclid, nombre y hora que ya recibió, así que
 * repetirlas no duplica.
 *
 * Las consultas del formulario NO van acá. Esas las revisa una persona antes de
 * decirle a Google que valen — ver `../route.ts`.
 *
 * ── LA PUERTA ──
 *
 * El middleware la deja pasar sin sesión porque Google no tiene una. La
 * protección es ésta: usuario y contraseña por Basic, que es lo que acepta la
 * fuente HTTPS de Google Ads. Sin `CONVERSIONES_PROGRAMADAS_CLAVE` configurada
 * la ruta contesta 404: abierta sin contraseña sería peor que no existir.
 */

export const GET = ruta("conversiones programadas", (req) => respuestaProgramada(req, { parametros: true }))
