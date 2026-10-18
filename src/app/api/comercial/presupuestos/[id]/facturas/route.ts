import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { createSupabaseServer } from "@/lib/supabase-server"
import {
  conciliarSinFallar,
  desvincularFactura,
  facturasDelPresupuesto,
  vincularFactura,
} from "@/lib/comercial/presupuesto-facturas-server"

type Ctx = { params: Promise<{ id: string }> }

/** Las facturas de venta de un presupuesto: las vinculadas y las que se pueden vincular. */
export const GET = ruta("presupuesto facturas GET", async (_req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await params
  const [conciliacion, primera] = await Promise.all([conciliarSinFallar(id), facturasDelPresupuesto(id)])
  const faltan = conciliacion.faltan[id] ?? []
  const datos = conciliacion.nuevos ? await facturasDelPresupuesto(id) : primera
  if (!datos) return NextResponse.json({ error: "El presupuesto no existe" }, { status: 404 })
  return NextResponse.json({ ...datos, faltan })
})

export const POST = ruta("presupuesto facturas POST", async (req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await params
  const { comprobanteId } = (await req.json().catch(() => ({}))) as { comprobanteId?: string }
  if (!comprobanteId) return NextResponse.json({ error: "Elegí la factura" }, { status: 400 })
  const usuario = await (await createSupabaseServer()).auth.getUser()
  const problema = await vincularFactura(id, comprobanteId, usuario.data.user?.id ?? null)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })
  return NextResponse.json({ ok: true })
})

export const DELETE = ruta("presupuesto facturas DELETE", async (req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await params
  const comprobanteId = new URL(req.url).searchParams.get("comprobanteId")
  if (!comprobanteId) return NextResponse.json({ error: "Falta la factura" }, { status: 400 })
  await desvincularFactura(id, comprobanteId)
  return NextResponse.json({ ok: true })
})
