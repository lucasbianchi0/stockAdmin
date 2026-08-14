"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileText, ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  TAMANO_MAX,
  TIPOS_ADJUNTO,
  esImagen,
  formatearTamano,
  tipoAceptado,
  type Adjunto,
} from "@/lib/admin/adjuntos"
import { cn } from "@/lib/utils"

/**
 * Los archivos de un comprobante: el PDF de AFIP, la foto del ticket.
 *
 * Acepta arrastrar y soltar además del selector, porque el gesto real es
 * arrastrar el PDF desde el mail. El área entera es la zona de drop —no un
 * recuadro chiquito— para que no haya que apuntar.
 *
 * Las miniaturas de las imágenes se muestran directo: en un comprobante, ver la
 * foto es reconocerlo, y una lista de nombres de archivo obliga a abrir cada uno
 * para saber cuál es cuál.
 */
export function AdjuntosPanel({ comprobanteId }: { comprobanteId: string }) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch(`/api/admin/adjuntos?comprobanteId=${comprobanteId}`)
      const data = await res.json()
      setAdjuntos(data.adjuntos ?? [])
    } catch {
      setAdjuntos([])
    } finally {
      setCargando(false)
    }
  }, [comprobanteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const subir = useCallback(
    async (archivos: FileList | File[]) => {
      const lista = Array.from(archivos)
      if (lista.length === 0) return

      // Se validan todos antes de subir ninguno: enterarse en el cuarto archivo
      // de que el primero no servía es peor que enterarse al principio.
      for (const a of lista) {
        if (!tipoAceptado(a.type)) {
          toast.error(`«${a.name}» no es un PDF ni una imagen`)
          return
        }
        if (a.size > TAMANO_MAX) {
          toast.error(`«${a.name}» pesa más de 15 MB`)
          return
        }
      }

      setSubiendo(true)
      let ok = 0

      for (const archivo of lista) {
        try {
          const form = new FormData()
          form.append("comprobanteId", comprobanteId)
          form.append("archivo", archivo)

          const res = await fetch("/api/admin/adjuntos", { method: "POST", body: form })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "No se pudo subir")
          ok++
        } catch (e) {
          toast.error(
            `${archivo.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`
          )
        }
      }

      if (ok > 0) {
        toast.success(ok === 1 ? "Archivo adjuntado" : `${ok} archivos adjuntados`)
        cargar()
      }
      setSubiendo(false)
    },
    [comprobanteId, cargar]
  )

  const borrar = async (a: Adjunto) => {
    setBorrando(a.id)
    try {
      const res = await fetch(`/api/admin/adjuntos/${a.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo borrar")
      setAdjuntos((prev) => prev.filter((x) => x.id !== a.id))
      toast.success("Archivo borrado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        subir(e.dataTransfer.files)
      }}
      className={cn(
        "rounded-lg border border-dashed p-3 transition-colors",
        encima ? "border-brand-400 bg-brand-50" : "border-line"
      )}
    >
      {cargando ? (
        <p className="py-2 text-center text-[12px] text-ink-muted">Cargando archivos…</p>
      ) : adjuntos.length === 0 ? (
        <p className="py-2 text-center text-[12px] text-ink-muted">
          Arrastrá acá el PDF de la factura, o
          <button
            onClick={() => entrada.current?.click()}
            className="ml-1 font-medium text-brand-600 hover:underline"
          >
            elegilo del disco
          </button>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {adjuntos.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2.5 rounded-md bg-surface px-2 py-1.5"
            >
              {/* La miniatura cuando es imagen; el ícono cuando es PDF. */}
              {esImagen(a.tipoMime) && a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt={a.nombre}
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-muted text-ink-muted">
                  {esImagen(a.tipoMime) ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
              )}

              <span className="min-w-0 flex-1">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[12.5px] font-medium text-ink hover:text-brand-600 hover:underline"
                    title={a.nombre}
                  >
                    {a.nombre}
                  </a>
                ) : (
                  <span className="block truncate text-[12.5px] text-ink">{a.nombre}</span>
                )}
                <span className="num block text-[11px] text-ink-muted">
                  {formatearTamano(a.tamano)}
                </span>
              </span>

              <Button
                variant="ghost"
                size="icon-sm"
                disabled={borrando === a.id}
                onClick={() => borrar(a)}
                aria-label={`Borrar ${a.nombre}`}
                className="shrink-0 text-ink-faint hover:bg-danger-soft hover:text-danger-text"
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
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10.5px] text-ink-faint">PDF o imagen · hasta 15 MB</p>
        <Button
          variant="outline"
          size="sm"
          disabled={subiendo}
          onClick={() => entrada.current?.click()}
        >
          {subiendo ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : adjuntos.length > 0 ? (
            <Paperclip className="h-3.5 w-3.5" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {subiendo ? "Subiendo…" : "Adjuntar"}
        </Button>
      </div>

      <input
        ref={entrada}
        type="file"
        multiple
        accept={TIPOS_ADJUNTO.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) subir(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
