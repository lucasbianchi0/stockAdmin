import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { problemaDeImagen, subirFirma } from "@/lib/marketing/eventos-server"

/**
 * Sube la imagen de una firma y devuelve su ruta y su URL.
 *
 * Se sube apenas se elige el archivo, no al guardar el evento: así el editor
 * muestra la firma ya procesada —sin fondo y en blanco— sobre la vista previa
 * del certificado, que es donde se decide si quedó bien. La ruta viaja después
 * dentro del certificado al guardar.
 *
 * Si nadie guarda, el archivo queda sin usar en el bucket. Es un PNG de pocos
 * KB y es el precio de ver el resultado antes de comprometerse; las firmas que
 * sí se reemplazan o quitan de un evento guardado se borran al guardarlo.
 */
export const POST = ruta("firmas POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const firma = form.get("firma")
  if (!(firma instanceof File) || firma.size === 0) {
    return NextResponse.json({ error: "Falta la imagen de la firma" }, { status: 400 })
  }
  const problema = problemaDeImagen(firma)
  if (problema) return NextResponse.json({ error: problema }, { status: 415 })

  const subida = await subirFirma(firma)
  if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

  return NextResponse.json(subida, { status: 201 })
})
