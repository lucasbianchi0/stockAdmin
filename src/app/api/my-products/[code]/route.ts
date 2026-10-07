import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  const { code } = await params
  try {
    const body = await req.json()
    const allowed = ["published_price", "publication_link"]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }
    // El convenio es un % de descuento sobre el costo: nulo es "sin convenio",
    // y fuera de (0, 100) no tiene sentido —100 % daría costo cero—.
    if ("convenio_pct" in body) {
      const v = body.convenio_pct
      if (v === null || v === "") {
        update.convenio_pct = null
      } else {
        const n = Number(v)
        if (!Number.isFinite(n) || n <= 0 || n >= 100) {
          return Response.json(
            { error: "El convenio tiene que ser un porcentaje mayor a 0 y menor a 100" },
            { status: 400 }
          )
        }
        update.convenio_pct = Math.round(n * 100) / 100
      }
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 })
    }
    const { error } = await supabase.from("my_products").update(update).eq("code", code)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[/api/my-products/[code] PATCH]", err)
    return Response.json({ error: "Error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  const { code } = await params
  try {
    const { error } = await supabase.from("my_products").delete().eq("code", code)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[/api/my-products/[code] DELETE]", err)
    return Response.json({ error: "Error" }, { status: 500 })
  }
}
