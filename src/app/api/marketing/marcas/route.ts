import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { LIMITES } from "@/lib/marketing/eventos"
import {
  COLUMNAS_MARCA,
  aMarca,
  borrarObjetos,
  leerMarcas,
  problemaDeImagen,
  subirLogo,
} from "@/lib/marketing/eventos-server"

/** La biblioteca de logos. */
export const GET = ruta("marcas GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso
  return NextResponse.json({ marcas: await leerMarcas() })
})

/**
 * Una marca nueva: `nombre` y `logo`. El nombre es único sin distinguir
 * mayúsculas —ver el índice de la migración—: dos "Microsoft Copilot" en la
 * biblioteca terminan en dos logos distintos en dos certificados del mismo mes.
 */
export const POST = ruta("marcas POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const nombre = String(form.get("nombre") ?? "").trim().slice(0, LIMITES.marcaNombre)
  if (!nombre) return NextResponse.json({ error: "Falta el nombre de la marca" }, { status: 400 })

  const logo = form.get("logo")
  if (!(logo instanceof File) || logo.size === 0) {
    return NextResponse.json({ error: "Falta el logo" }, { status: 400 })
  }
  const problema = problemaDeImagen(logo)
  if (problema) return NextResponse.json({ error: problema }, { status: 415 })

  const { data: repetida } = await supabase.from("marcas").select("id").ilike("nombre", nombre).maybeSingle()
  if (repetida) {
    return NextResponse.json({ error: `Ya hay una marca “${nombre}” en la biblioteca` }, { status: 409 })
  }

  const subida = await subirLogo(logo)
  if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

  const { data, error } = await supabase
    .from("marcas")
    .insert({ nombre, logo_ruta: subida.ruta, logo_ancho: subida.ancho, logo_alto: subida.alto })
    .select(COLUMNAS_MARCA)
    .single()

  if (error || !data) {
    console.error("[marcas POST]", error)
    await borrarObjetos([subida.ruta])
    return NextResponse.json({ error: "No se pudo guardar la marca" }, { status: 500 })
  }

  return NextResponse.json({ marca: aMarca(data) }, { status: 201 })
})
