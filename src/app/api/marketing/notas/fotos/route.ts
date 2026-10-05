import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { problemaDeImagen, subirFoto } from "@/lib/marketing/notas-server"

/* ── POST · una foto para el cuerpo ───────────────────────────────────────── */

/**
 * `multipart/form-data` con `foto`. Sube en el momento —no al guardar, como la
 * portada— porque lo que el editor necesita es la URL para escribirla en el
 * markdown y verla en la vista previa.
 */
export const POST = ruta("notas fotos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const form = await req.formData()
  const foto = form.get("foto")
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Falta la foto" }, { status: 400 })
  }
  const problema = problemaDeImagen(foto)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const subida = await subirFoto(foto)
  if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 500 })
  return NextResponse.json({ url: subida.url })
})
