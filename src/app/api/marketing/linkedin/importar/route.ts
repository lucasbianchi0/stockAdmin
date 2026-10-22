import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { esXls, leerXls } from "@/lib/admin/xls"
import { ArchivoInvalido } from "@/lib/admin/xlsx"
import { importarExport } from "@/lib/marketing/linkedin-server"
import type { ResumenImportacion } from "@/lib/marketing/linkedin"
import { sesionConModulo } from "@/lib/sesion-server"

/**
 * Sube los .xls de la analítica de LinkedIn (uno, dos o los tres juntos).
 *
 * Sin previsualización, a diferencia de Contactos: el archivo lo arma LinkedIn,
 * no una persona, y volver a importar el mismo período deja los mismos
 * números. Equivocarse no rompe nada; se arregla subiendo el archivo bueno.
 */
export const POST = ruta("linkedin importar", async (req) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta

  const archivos = (await req.formData()).getAll("archivo").filter((a): a is File => a instanceof File)
  if (archivos.length === 0) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })

  const resumen: ResumenImportacion = { archivos: [] }
  for (const archivo of archivos) {
    if (!esXls(archivo.name)) {
      return NextResponse.json(
        { error: `${archivo.name}: LinkedIn exporta .xls; subí el archivo tal cual lo bajaste` },
        { status: 400 }
      )
    }
    if (archivo.size > 6 * 1024 * 1024) {
      return NextResponse.json({ error: `${archivo.name} pesa más de 6 MB` }, { status: 400 })
    }
    try {
      const hojas = leerXls(await archivo.arrayBuffer())
      resumen.archivos.push({ archivo: archivo.name, ...(await importarExport(hojas, archivo.name, s.sesion.nombre)) })
    } catch (e) {
      if (!(e instanceof ArchivoInvalido)) throw e
      return NextResponse.json({ error: `${archivo.name}: ${e.message}`, resumen }, { status: 400 })
    }
  }
  return NextResponse.json(resumen)
})
