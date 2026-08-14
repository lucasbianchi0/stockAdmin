import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"

/**
 * Los documentos que el motor no pudo asentar.
 *
 * Es la lista de trabajo de la contabilidad. Cada fila acá es un documento que
 * está en los saldos pero **no en el mayor**, y por lo tanto un balance que no
 * cierra. Casi siempre la causa es la misma y se arregla en diez segundos: la
 * factura quedó sin cuenta contable imputada.
 *
 * Que esta lista exista es la contracara de haber decidido que un error del
 * motor no bloquee la carga de un documento. Si no se bloquea, tiene que verse.
 */

export const GET = ruta("pendientes contables GET", async () => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("documentos_sin_asiento")
    .select("origen, id, fecha, referencia, importe_ars, motivo")
    .order("fecha", { ascending: false })
    .limit(500)

  if (error) {
    console.error("[pendientes contables]", error)
    return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
  }

  const documentos: DocumentoSinAsiento[] = (data ?? []).map((d) => ({
    origen: d.origen as string,
    id: d.id as string,
    fecha: d.fecha as string,
    referencia: d.referencia as string,
    importeArs: Number(d.importe_ars ?? 0),
    motivo: d.motivo as string,
  }))

  return NextResponse.json({ documentos, cantidad: documentos.length })
})
