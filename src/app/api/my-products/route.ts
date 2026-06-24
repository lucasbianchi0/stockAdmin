import { supabase } from "@/lib/supabase"

export async function GET() {
  try {
    const { data: myRows, error: myErr } = await supabase
      .from("my_products")
      .select("*")
      .order("added_at", { ascending: true })

    if (myErr) return Response.json({ error: myErr.message }, { status: 500 })
    if (!myRows || myRows.length === 0) return Response.json({ products: [], codes: [] })

    const codes = myRows.map((r) => r.code)

    const { data: prodRows, error: prodErr } = await supabase
      .from("products")
      .select("code, name, brand, stock, price, currency, sku, iva")
      .in("code", codes)

    if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 })

    const prodMap = new Map((prodRows ?? []).map((p) => [p.code, p]))

    const products = myRows.map((r) => ({
      code: r.code,
      added_at: r.added_at,
      publication_name: r.publication_name ?? null,
      published_price: r.published_price ?? null,
      publication_link: r.publication_link ?? null,
      name: null,
      brand: null,
      stock: 0,
      price: 0,
      currency: "USD",
      sku: "",
      iva: 0,
      ...(prodMap.get(r.code) ?? {}),
    }))

    return Response.json({ products, codes })
  } catch (err) {
    console.error("[/api/my-products GET]", err)
    return Response.json({ error: "Error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { codes } = await req.json()
    if (!Array.isArray(codes) || codes.length === 0) {
      return Response.json({ error: "codes required" }, { status: 400 })
    }
    const rows = (codes as string[]).map((code) => ({ code }))
    const { error } = await supabase
      .from("my_products")
      .upsert(rows, { onConflict: "code", ignoreDuplicates: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, added: codes.length })
  } catch (err) {
    console.error("[/api/my-products POST]", err)
    return Response.json({ error: "Error" }, { status: 500 })
  }
}
