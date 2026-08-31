"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, FileUp, Loader2, Plus, RefreshCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BORRADOR_VACIO,
  LIMITES,
  SOLUCIONES,
  SOLUCION_LABEL,
  SOLUCION_PISTA,
  faltantesDe,
  formatearTamano,
  problemaDelArchivo,
  type BorradorBrochure,
  type Brochure,
} from "@/lib/marketing/brochures"
import { cn } from "@/lib/utils"

/**
 * Alta y edición de un brochure. Tres campos: el PDF, el título y la categoría.
 *
 *  1. **El PDF va primero.** No es un adjunto del formulario: es el brochure.
 *     El título y la categoría existen para poder encontrar ese archivo dentro
 *     de seis meses, y no hay un tercer motivo para pedir nada más.
 *
 *  2. **En la edición el PDF es opcional.** Corregirle una palabra al título no
 *     puede obligar a volver a elegir el mismo archivo. Cuando sí se elige uno
 *     nuevo, el diálogo dice en voz alta que el anterior se reemplaza: es la
 *     única acción destructiva de esta pantalla.
 */
export function BrochureDialog({
  abierto,
  brochure,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** `null` = alta. Con brochure = edición. */
  brochure: Brochure | null
  onCerrar: () => void
  onGuardado: (b: Brochure, esNuevo: boolean) => void
}) {
  const [f, setF] = useState<BorradorBrochure>(BORRADOR_VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editando = brochure !== null

  // Al abrir se rearma el borrador desde cero. Sin esto, cerrar una edición y
  // abrir un alta muestra los datos de la anterior — y peor, su archivo.
  useEffect(() => {
    if (!abierto) return
    setError(null)
    setArchivo(null)
    setF(
      brochure
        ? { titulo: brochure.titulo, solucion: brochure.solucion }
        : BORRADOR_VACIO
    )
  }, [abierto, brochure])

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, guardando, onCerrar])

  const faltantes = faltantesDe(f, archivo !== null || editando)

  /** El archivo se valida al elegirlo y no al guardar: enterarse de que el PDF
   *  pesa 40 MB después de completar el formulario es la peor versión de esto. */
  function elegirArchivo(nuevo: File | null) {
    if (!nuevo) return
    const problema = problemaDelArchivo(nuevo)
    if (problema) {
      setError(problema)
      setArchivo(null)
      return
    }
    setError(null)
    setArchivo(nuevo)
  }

  async function guardar() {
    if (faltantes.length > 0) {
      setError(`Falta ${faltantes.join(" y ")}.`)
      return
    }

    setGuardando(true)
    setError(null)

    try {
      // FormData y no JSON: el PDF viaja en el mismo pedido que los datos. Ver
      // el comentario del endpoint.
      const cuerpo = new FormData()
      cuerpo.set("titulo", f.titulo)
      cuerpo.set("solucion", f.solucion)
      if (archivo) cuerpo.set("archivo", archivo)

      const url = editando
        ? `/api/marketing/brochures/${brochure.id}`
        : "/api/marketing/brochures"

      const r = await fetch(url, { method: editando ? "PATCH" : "POST", body: cuerpo })

      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      onGuardado(d.brochure as Brochure, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar brochure" : "Nuevo brochure"}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
              {editando ? "Editar brochure" : "Nuevo brochure"}
            </h2>
          </div>
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* El archivo — primero: es el brochure, no un adjunto */}
          <ZonaArchivo
            archivo={archivo}
            actual={brochure}
            deshabilitado={guardando}
            onElegir={elegirArchivo}
            onQuitar={() => setArchivo(null)}
          />

          <div className="h-px bg-line" />

          <div>
            <label htmlFor="titulo" className="eyebrow">
              Título
            </label>
            <div className="mt-2">
              <Input
                id="titulo"
                value={f.titulo}
                maxLength={LIMITES.titulo}
                disabled={guardando}
                placeholder="Propuesta de firma biométrica para bancos"
                onChange={(e) => setF((prev) => ({ ...prev, titulo: e.target.value }))}
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
                Cómo lo vas a pedir en voz alta. “Propuesta bancos” se encuentra, “Brochure
                v4 final” no.
              </p>
            </div>
          </div>

          <div>
            <p className="eyebrow">Categoría</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOLUCIONES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={guardando}
                  aria-pressed={f.solucion === s}
                  onClick={() => setF((prev) => ({ ...prev, solucion: s }))}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
                    f.solucion === s
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                  )}
                >
                  {SOLUCION_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
              {SOLUCION_PISTA[f.solucion]}
            </p>
          </div>
        </div>

        {/* Pie */}
        <div className="shrink-0 border-t border-line px-5 py-4 sm:px-6">
          {error && (
            <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-[12px] text-danger-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button disabled={guardando || faltantes.length > 0} onClick={guardar}>
              {guardando ? <Loader2 className="animate-spin" /> : editando ? null : <Plus />}
              {editando ? "Guardar" : "Subir brochure"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── El PDF ───────────────────────────────────────────────────────────────── */

function ZonaArchivo({
  archivo,
  actual,
  deshabilitado,
  onElegir,
  onQuitar,
}: {
  archivo: File | null
  actual: Brochure | null
  deshabilitado: boolean
  onElegir: (f: File | null) => void
  onQuitar: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)

  const reemplaza = actual !== null

  return (
    <section>
      <p className="eyebrow">{reemplaza ? "El PDF" : "El PDF del brochure"}</p>

      {/* El archivo que ya está guardado, cuando se está editando */}
      {reemplaza && !archivo && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted">
            <FileText className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-ink">{actual.archivoNombre}</p>
            <p className="num mt-0.5 text-[11px] text-ink-muted">
              {formatearTamano(actual.archivoTamano)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={deshabilitado}
            onClick={() => input.current?.click()}
          >
            <RefreshCw />
            Reemplazar
          </Button>
        </div>
      )}

      {/* El PDF recién elegido */}
      {archivo && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-surface text-brand-600">
            <FileText className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-ink">{archivo.name}</p>
            <p className="num mt-0.5 text-[11px] text-ink-muted">
              {formatearTamano(archivo.size)}
              {reemplaza && ` · reemplaza a ${actual.archivoNombre}`}
            </p>
          </div>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => {
              onQuitar()
              if (input.current) input.current.value = ""
            }}
            aria-label="Quitar el PDF elegido"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* El recuadro para arrastrar, solo cuando no hay nada elegido */}
      {!archivo && !reemplaza && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setEncima(true)
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault()
            setEncima(false)
            onElegir(e.dataTransfer.files?.[0] ?? null)
          }}
          className={cn(
            "mt-2 rounded-xl border border-dashed px-5 py-8 text-center transition-colors",
            encima ? "border-brand-400 bg-brand-50" : "border-line-strong bg-surface-subtle"
          )}
        >
          <FileUp className="mx-auto h-6 w-6 text-ink-faint" strokeWidth={1.7} />
          <p className="mt-2.5 text-[12.5px] font-medium text-ink">Arrastrá el PDF acá</p>
          <p className="mt-1 text-[11.5px] text-ink-muted">
            Solo PDF, hasta 25 MB. Es el archivo que se le manda al cliente tal cual.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={deshabilitado}
            onClick={() => input.current?.click()}
          >
            Elegir archivo
          </Button>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => onElegir(e.target.files?.[0] ?? null)}
      />
    </section>
  )
}
