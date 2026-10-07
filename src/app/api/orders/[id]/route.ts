import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import { ESTADO_PEDIDO_LABEL, esEstadoElegible } from "@/lib/pedidos"

/**
 * Cambiar el estado de un pedido.
 *
 * Distecna no informa estados, así que esto es nuestro registro: alguien habló
 * con el proveedor y deja asentado qué pasó. Por eso se guarda quién y cuándo,
 * y una nota opcional con el motivo.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 })
  }

  if (!esEstadoElegible(body.status)) {
    return Response.json({ error: "Estado inválido" }, { status: 400 })
  }
  const nota = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null

  const { data: actual, error: errLectura } = await supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .maybeSingle()

  if (errLectura) {
    console.error("[/api/orders/[id] PATCH leer]", errLectura)
    return Response.json({ error: "No se pudo leer el pedido" }, { status: 500 })
  }
  if (!actual) return Response.json({ error: "Pedido no encontrado" }, { status: 404 })

  // Un pedido con error nunca llegó a Distecna: no hay nada que confirmar,
  // entregar ni cancelar del otro lado.
  if (actual.status === "error") {
    return Response.json(
      { error: "Ese pedido falló al enviarse: no existe en Distecna y no tiene estado que cambiar" },
      { status: 409 }
    )
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { error } = await supabase
    .from("orders")
    .update({
      status: body.status,
      status_note: nota,
      status_updated_at: new Date().toISOString(),
      status_updated_by: user?.id ?? null,
      status_updated_by_nombre: nombreDeUsuario(user),
    })
    .eq("id", id)

  if (error) {
    console.error("[/api/orders/[id] PATCH]", error)
    return Response.json(
      { error: `No se pudo marcar como ${ESTADO_PEDIDO_LABEL[body.status].toLowerCase()}` },
      { status: 500 }
    )
  }

  return Response.json({ ok: true })
}
