import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

/**
 * La lista de direcciones que NO son clientes: nosotros.
 *
 * ── POR QUE ESTO ES UN BOTON Y NO UNA LISTA QUE ALGUIEN MANTIENE ──
 *
 * La regla de dominio `@accedra.com.ar` cubre a los cinco usuarios del
 * backoffice. Lo que no cubre —y es lo que pasó— son las casillas personales:
 * alguien prueba un formulario desde su Gmail y ese lead entra como consulta
 * real. Medido el 13/9/2026: de diez leads en la base, ocho eran del equipo, y
 * dos de esas direcciones no figuraban en ninguna lista.
 *
 * Enumerar por adelantado las casillas personales de todo el mundo es adivinar,
 * y se desactualiza el día que entra alguien nuevo. Marcar desde la bandeja, en
 * cambio, lo hace quien está mirando el lead y sabe quién es. Una vez marcada,
 * la dirección queda descontada para siempre y hacia atrás — porque el filtro se
 * aplica al leer, no al guardar.
 */

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const POST = ruta("marcar como equipo", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const raw = (await req.json().catch(() => null)) as { email?: unknown; nota?: unknown } | null
  const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : ""

  if (!email || !MAIL.test(email)) {
    return NextResponse.json({ error: "Hace falta una dirección de mail válida" }, { status: 400 })
  }

  // Se guarda la dirección exacta, no el dominio. Marcar un dominio entero desde
  // un botón es demasiado poder para un clic: `@gmail.com` dejaría fuera a media
  // Argentina y nadie entendería después por qué no entran consultas.
  const { error } = await supabase.from("marketing_equipo").upsert(
    {
      patron: email,
      nota: typeof raw?.nota === "string" && raw.nota.trim() ? raw.nota.trim().slice(0, 200) : "Marcado desde la bandeja",
    },
    { onConflict: "patron" }
  )

  if (error) {
    console.error("[equipo POST]", error)
    return NextResponse.json({ error: "No se pudo marcar" }, { status: 500 })
  }

  return NextResponse.json({ email })
})

export const DELETE = ruta("desmarcar equipo", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "Falta el mail" }, { status: 400 })

  // Los patrones de dominio no se borran desde acá: `@accedra.com.ar` es la
  // regla que sostiene todo el filtro, y sacarla por accidente desde un botón
  // convertiría a la empresa entera en clientes de un día para el otro.
  if (email.startsWith("@")) {
    return NextResponse.json(
      { error: "Los dominios se editan en la tabla marketing_equipo, no desde acá" },
      { status: 400 }
    )
  }

  const { error } = await supabase.from("marketing_equipo").delete().eq("patron", email)
  if (error) {
    console.error("[equipo DELETE]", error)
    return NextResponse.json({ error: "No se pudo desmarcar" }, { status: 500 })
  }

  return NextResponse.json({ email })
})
