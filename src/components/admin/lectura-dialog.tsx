"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Sparkles, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * La cáscara de cualquier carga inteligente de un solo documento.
 *
 * Es el mismo flujo que la importación de facturas —adjuntar, leer, revisar,
 * confirmar— para lo que no es una factura: la constancia de un cliente nuevo,
 * el ticket de un gasto. Lo que cambia entre uno y otro es el endpoint y cómo se
 * dibuja lo leído; todo lo demás (arrastrar, validar el formato, el estado de
 * "leyendo", el error) es idéntico y vive acá.
 *
 * La regla que no se negocia: **esto no guarda nada**. Devuelve un borrador que
 * cae en el formulario de siempre, con sus validaciones y su botón de guardar.
 * Quien carga sigue siendo quien decide.
 */
export function LecturaDialog<T>({
  abierto,
  titulo,
  descripcion,
  endpoint,
  ayuda,
  onCerrar,
  children,
}: {
  abierto: boolean
  titulo: string
  descripcion: string
  endpoint: string
  /** Qué conviene adjuntar. Sin esto, la zona de carga no dice qué espera. */
  ayuda: string
  onCerrar: () => void
  children: (datos: T, reiniciar: () => void) => React.ReactNode
}) {
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datos, setDatos] = useState<T | null>(null)

  useEffect(() => {
    if (abierto) {
      setDatos(null)
      setError(null)
    }
  }, [abierto])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !leyendo) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, leyendo])

  const subir = async (archivos: FileList | null) => {
    const archivo = archivos?.[0]
    if (!archivo) return

    setLeyendo(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("archivo", archivo)
      const res = await fetch(endpoint, { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el documento")
      setDatos(data as T)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el documento")
    } finally {
      setLeyendo(false)
    }
  }

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !leyendo && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-4 fade-in-0 duration-200 sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Sparkles className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">{descripcion}</p>
          </div>
          <button
            onClick={onCerrar}
            disabled={leyendo}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {datos ? (
            children(datos, () => setDatos(null))
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastrando(false)
                if (!leyendo) subir(e.dataTransfer.files)
              }}
              className={cn(
                "rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                arrastrando ? "border-brand-400 bg-brand-50" : "border-line bg-surface-subtle"
              )}
            >
              <input
                ref={inputArchivo}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) subir(e.target.files)
                  e.target.value = ""
                }}
              />

              {leyendo ? (
                <div className="flex flex-col items-center gap-2.5">
                  <Sparkles className="h-6 w-6 animate-pulse text-brand-500" />
                  <p className="text-[13px] font-medium text-ink">Leyendo el documento…</p>
                  <p className="text-[11.5px] text-ink-muted">Puede tardar unos segundos</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5">
                  <Upload className="h-6 w-6 text-ink-faint" strokeWidth={1.7} />
                  <p className="text-[13px] text-ink-secondary">
                    Arrastrá el PDF o la foto acá, o
                  </p>
                  <Button variant="outline" size="sm" onClick={() => inputArchivo.current?.click()}>
                    Elegir archivo
                  </Button>
                  <p className="mt-1 text-[11.5px] text-ink-muted">{ayuda}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-text">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Lo que hay que mirar antes de confirmar.
 *
 * Van arriba de los datos y no abajo: un aviso debajo de un formulario largo se
 * lee después de haber decidido, que es cuando ya no sirve.
 */
export function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null

  return (
    <div className="space-y-1.5 rounded-lg border border-warning-line bg-warning-soft px-3.5 py-3">
      {avisos.map((a, i) => (
        <p key={i} className="flex gap-2 text-[12px] leading-relaxed text-warning-text">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{a}</span>
        </p>
      ))}
    </div>
  )
}

/** Un campo leído. Los dudosos van en ámbar: es lo que hace que el ojo vaya
 *  primero donde hay que mirar. */
export function CampoLeido({
  rotulo,
  valor,
  dudoso = false,
}: {
  rotulo: string
  valor: string | null
  dudoso?: boolean
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-line-soft py-1.5 last:border-b-0">
      <span className="text-[12px] text-ink-muted">{rotulo}</span>
      <span
        className={cn(
          "text-[12.5px]",
          !valor ? "text-ink-faint" : dudoso ? "font-medium text-warning-text" : "text-ink"
        )}
      >
        {valor || "—"}
        {dudoso && valor && <span className="ml-1.5 text-[10.5px]">· revisar</span>}
      </span>
    </div>
  )
}
