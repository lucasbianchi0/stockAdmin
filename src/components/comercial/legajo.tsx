"use client"

import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatearTamano } from "@/lib/admin/adjuntos"
import { formatearFecha } from "@/lib/admin/fecha"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import {
  CLASES_ADJUNTO,
  CLASE_ADJUNTO_LABEL,
  type AdjuntoPresupuesto,
  type ClaseAdjunto,
} from "@/lib/comercial/presupuestos"

/**
 * El legajo del presupuesto.
 *
 * Lo pidió Administración con su motivo, que es el que define la pantalla: «si
 * con el tiempo te piden el N° de serie de un producto que entregaste, buscando
 * ahí la factura es más fácil». O sea que esto no es un adjuntador de archivos:
 * es un archivador que se consulta meses después, cuando nadie se acuerda de
 * nada.
 *
 * De ahí las dos decisiones. Cada archivo se clasifica al subir —la OC no es el
 * remito aunque los dos sean un PDF—, y la lista se agrupa por esa clase, así
 * buscar "la factura de compra" es mirar un renglón y no abrir seis archivos.
 */
export function Legajo({ presupuestoId }: { presupuestoId: string }) {
  const invalidar = useInvalidarAdmin()
  const url = `/api/comercial/presupuestos/${presupuestoId}/adjuntos`
  const [clase, setClase] = useState<ClaseAdjunto>("factura_proveedor")
  const [subiendo, setSubiendo] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ adjuntos?: AdjuntoPresupuesto[] }>(url, { signal }),
  })

  const adjuntos = consulta.data?.adjuntos ?? []

  const subir = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return
    setSubiendo(true)
    try {
      // De a uno y en orden: si se cae el tercero, los dos primeros ya están
      // guardados y se ve cuál falló.
      for (const archivo of Array.from(archivos)) {
        const form = new FormData()
        form.append("archivo", archivo)
        form.append("clase", clase)
        await pedirJson(url, { method: "POST", body: form })
      }
      await invalidar()
      toast.success(archivos.length === 1 ? "Archivo guardado" : `${archivos.length} archivos guardados`)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo subir el archivo"))
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ""
    }
  }

  const borrar = async (a: AdjuntoPresupuesto) => {
    setBorrando(a.id)
    try {
      await pedirJson(`/api/comercial/adjuntos/${a.id}`, { method: "DELETE" })
      await invalidar()
      toast.success("Archivo borrado")
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar"))
    } finally {
      setBorrando(null)
    }
  }

  // Agrupados por clase, en el orden en que se declaran: es el orden en que
  // aparecen los papeles de una operación, de la OC a la factura de venta.
  const porClase = CLASES_ADJUNTO.map((c) => ({
    clase: c,
    archivos: adjuntos.filter((a) => a.clase === c),
  })).filter((g) => g.archivos.length > 0)

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3">
        <div>
          <p className="eyebrow">Legajo</p>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            Remitos, órdenes de compra, facturas y fotos de esta operación
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={clase}
            onChange={(e) => setClase(e.target.value as ClaseAdjunto)}
            disabled={subiendo}
            aria-label="Qué se está subiendo"
            className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
          >
            {CLASES_ADJUNTO.map((c) => (
              <option key={c} value={c}>
                {CLASE_ADJUNTO_LABEL[c]}
              </option>
            ))}
          </select>

          <input
            ref={input}
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={(e) => subir(e.target.files)}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={subiendo}
          >
            {subiendo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            Subir
          </Button>
        </div>
      </div>

      {consulta.isPending ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">Cargando el legajo…</p>
      ) : adjuntos.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-ink-muted">
          Todavía no hay papeles. Elegí qué es y subilo: PDF o foto, hasta 15 MB.
        </p>
      ) : (
        <div className="divide-y divide-line-soft">
          {porClase.map(({ clase: c, archivos }) => (
            <div key={c} className="px-4 py-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge tone="neutral" size="sm">
                  {CLASE_ADJUNTO_LABEL[c]}
                </Badge>
                <span className="text-[11px] text-ink-muted">
                  {archivos.length} archivo{archivos.length === 1 ? "" : "s"}
                </span>
              </div>

              <ul className="space-y-0.5">
                {archivos.map((a) => (
                  <li
                    key={a.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-[12.5px] text-ink hover:text-brand-600 hover:underline"
                      >
                        {a.nombre}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
                        {a.nombre}
                      </span>
                    )}
                    <span className="num shrink-0 text-[11px] text-ink-faint">
                      {formatearTamano(a.tamano)}
                    </span>
                    <span className="num shrink-0 text-[11px] text-ink-faint">
                      {formatearFecha(a.createdAt.slice(0, 10))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => borrar(a)}
                      disabled={borrando === a.id}
                      aria-label={`Borrar ${a.nombre}`}
                      className="acciones-fila shrink-0"
                    >
                      {borrando === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
