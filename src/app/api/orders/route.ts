import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import {
  createOrder,
  searchProducts,
  isDistecnaConfigured,
  DistecnaError,
  type DistecnaOrderLine,
} from "@/lib/distecna-v2"

interface RequestItem {
  code: string
  quantity: number
}

// products.type todavia no viene del sync (la V1 no lo expone). Para los productos
// que no lo tengan guardado, lo resolvemos contra V2 por codigo y lo persistimos,
// asi la proxima vez ya esta.
async function resolveTypes(
  codes: string[]
): Promise<{ types: Map<string, string>; missing: string[] }> {
  const { data } = await supabase
    .from("products")
    .select("code, type")
    .in("code", codes)

  const types = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.type) types.set(row.code, row.type)
  }

  const unresolved = codes.filter((c) => !types.has(c))
  const missing: string[] = []

  for (const code of unresolved) {
    try {
      const res = await searchProducts(code, 5, 0)
      const match = (res.products ?? []).find((p) => p.code === code)
      const type = match?.type
      if (typeof type === "string" && type) {
        types.set(code, type)
        await supabase.from("products").update({ type }).eq("code", code)
      } else {
        missing.push(code)
      }
    } catch {
      missing.push(code)
    }
  }

  return { types, missing }
}

export async function GET() {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!orders || orders.length === 0) return Response.json({ orders: [] })

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .in(
      "order_id",
      orders.map((o) => o.id)
    )

  const byOrder = new Map<string, unknown[]>()
  for (const item of items ?? []) {
    const list = byOrder.get(item.order_id) ?? []
    list.push(item)
    byOrder.set(item.order_id, list)
  }

  return Response.json({
    orders: orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] })),
  })
}

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  if (!isDistecnaConfigured()) {
    return Response.json(
      { error: "Distecna V2 no está configurado en este entorno." },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const rawItems: RequestItem[] = Array.isArray(body.items) ? body.items : []

    const items = rawItems
      .map((i) => ({ code: String(i.code ?? "").trim(), quantity: Number(i.quantity) }))
      .filter((i) => i.code && Number.isInteger(i.quantity) && i.quantity > 0)

    if (items.length === 0) {
      return Response.json(
        { error: "Agregá al menos un producto con cantidad mayor a 0." },
        { status: 400 }
      )
    }

    const codes = [...new Set(items.map((i) => i.code))]
    const { types, missing } = await resolveTypes(codes)

    if (missing.length > 0) {
      return Response.json(
        {
          error:
            `No se pudo determinar el tipo de producto de: ${missing.join(", ")}. ` +
            `Distecna lo exige para crear el pedido y estos códigos no aparecen en la API V2.`,
          missing,
        },
        { status: 422 }
      )
    }

    // Precio e IVA salen de nuestro catalogo, solo para dejar registro de a que
    // valor pedimos. Distecna factura con su propio precio al momento del pedido.
    const { data: catalog } = await supabase
      .from("products")
      .select("code, name, price, currency, iva")
      .in("code", codes)

    const info = new Map((catalog ?? []).map((p) => [p.code, p]))

    const lines: DistecnaOrderLine[] = items.map((i) => ({
      productCode: i.code,
      productType: types.get(i.code)!,
      quantity: i.quantity,
    }))

    const paymentTermId = body.paymentTermId ? String(body.paymentTermId) : null
    const deliveryAddressId = body.deliveryAddressId
      ? String(body.deliveryAddressId)
      : null

    const request = { products: lines, paymentTermId, deliveryAddressId }
    const totalUsd = items.reduce(
      (acc, i) => acc + (Number(info.get(i.code)?.price) || 0) * i.quantity,
      0
    )

    let result
    try {
      result = await createOrder(request)
    } catch (err) {
      // Guardamos el intento fallido: sin endpoint de consulta, si no lo
      // registramos nosotros no queda rastro de que se intento pedir.
      let message = err instanceof Error ? err.message : "Error desconocido"
      // Ante falta de stock Distecna responde 400 con un texto generico que no
      // dice cual es el problema. Le agregamos la pista.
      if (err instanceof DistecnaError && err.status === 400 && /^error al crear el pedido\.?$/i.test(message)) {
        message =
          "Distecna rechazó el pedido. Suele ser por falta de stock para las cantidades pedidas — revisá la disponibilidad de cada producto."
      }
      await supabase.from("orders").insert({
        status: "error",
        payment_term_id: paymentTermId,
        delivery_address_id: deliveryAddressId,
        environment: process.env.DISTECNA_ENV ?? "qa",
        total_usd: totalUsd,
        request,
        error: message,
      })
      const status = err instanceof DistecnaError ? err.status : 502
      return Response.json({ error: message }, { status: status === 401 ? 502 : status })
    }

    const { data: order, error: insertErr } = await supabase
      .from("orders")
      .insert({
        sales_order_id: result.salesOrderId,
        status: "enviado",
        payment_term_id: paymentTermId,
        delivery_address_id: deliveryAddressId,
        environment: process.env.DISTECNA_ENV ?? "qa",
        total_usd: totalUsd,
        request,
        response: result,
      })
      .select("id")
      .single()

    if (insertErr) {
      // El pedido existe en Distecna pero no lo pudimos guardar. Hay que avisarlo
      // fuerte: no hay endpoint para reconstruirlo despues.
      console.error("[/api/orders POST] pedido creado pero no persistido", insertErr)
      return Response.json(
        {
          ok: true,
          salesOrderId: result.salesOrderId,
          warning:
            `El pedido ${result.salesOrderId} se creó en Distecna pero no se pudo guardar localmente. ` +
            `Anotá el número: la API no permite recuperarlo.`,
        },
        { status: 200 }
      )
    }

    await supabase.from("order_items").insert(
      items.map((i) => {
        const p = info.get(i.code)
        return {
          order_id: order.id,
          code: i.code,
          product_type: types.get(i.code)!,
          quantity: i.quantity,
          unit_price: p?.price ?? null,
          currency: p?.currency ?? null,
          iva: p?.iva ?? null,
          name: p?.name ?? null,
        }
      })
    )

    return Response.json({
      ok: true,
      id: order.id,
      salesOrderId: result.salesOrderId,
      message: result.message,
    })
  } catch (err) {
    console.error("[/api/orders POST]", err)
    return Response.json({ error: "Error al crear el pedido" }, { status: 500 })
  }
}
