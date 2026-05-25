import { supabase } from "@/lib/supabase"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("code", code)
    .single()

  if (error || !data) {
    return Response.json({ error: "Product not found" }, { status: 404 })
  }

  return Response.json({
    code: data.code,
    sku: data.sku,
    stock: data.stock,
    currency: data.currency,
    price: data.price,
    iva: data.iva,
    ii: data.ii,
    name: data.name ?? undefined,
    brand: data.brand ?? undefined,
    subBrand: data.sub_brand ?? undefined,
    category: data.category ?? undefined,
    ean: data.ean ?? undefined,
    upc: data.upc ?? undefined,
    description: data.description ?? undefined,
    fullDescription: data.full_description ?? undefined,
    attributes: data.attributes ?? undefined,
    images: data.images ?? undefined,
  })
}
