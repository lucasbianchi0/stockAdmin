import { supabase } from "@/lib/supabase"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  try {
    const body = await req.json()
    const allowed = ["publication_name", "published_price", "publication_link"]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
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
