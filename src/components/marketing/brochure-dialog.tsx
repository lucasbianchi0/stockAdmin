"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, FileUp, Loader2, Plus, RefreshCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BORRADOR_VACIO,
  INDUSTRIAS,
  INDUSTRIA_LABEL,
  INDUSTRIA_TRANSVERSAL,
  LIMITES,
  SOLUCIONES,
  SOLUCION_LABEL,
  SOLUCION_PISTA,
  faltantesDe,
  formatearTamano,
  normalizarEtiquetas,
  problemaDelArchivo,
  type BorradorBrochure,
  type Brochure,
  type Yo,
} from "@/lib/marketing/brochures"
import { cn } from "@/lib/utils"

/**
 * Alta y edición de un brochure.
 *
 * Tres decisiones gobiernan el formulario:
 *
 *  1. **El PDF va primero.** No es un adjunto del formulario: es el brochure.
 *     Todo lo demás —la descripción, el cuándo usar, las etiquetas— existe para
 *     poder encontrar ese archivo dentro de seis meses.
 *
 *  2. **En la edición el PDF es opcional.** Corregirle una palabra al título no
 *     puede obligar a volver a elegir el mismo archivo. Cuando sí se elige uno
 *     nuevo, el diálogo dice en voz alta que el anterior se reemplaza: es la
 *     única acción destructiva de esta pantalla.
 *
 *  3. **Dos campos obligatorios y nada más**: el título y el archivo. Un
 *     brochure cargado a medias es infinitamente mejor que uno perfecto que
 *     quedó en el Drive de alguien.
 */
export function BrochureDialog({
  abierto,
  brochure,
  yo,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** `null` = alta. Con brochure = edición. */
  brochure: Brochure | null
  yo: Yo
  onCerrar: () => void
  onGuardado: (b: Brochure, esNuevo: boolean) => void
}) {
  const [f, setF] = useState<BorradorBrochure>(BORRADOR_VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [etiquetaNueva, setEtiquetaNueva] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editando = brochure !== null

  // Al abrir se rearma el borrador desde cero. Sin esto, cerrar una edición y
  // abrir un alta muestra los datos de la anterior — y peor, su archivo.
  useEffect(() => {
    if (!abierto) return
    setError(null)
    setEtiquetaNueva("")
    setArchivo(null)
    setF(
      brochure
        ? {
            titulo: brochure.titulo,
            solucion: brochure.solucion,
            industria: brochure.industria,
            descripcion: brochure.descripcion ?? "",
            cuandoUsar: brochure.cuandoUsar ?? "",
            etiquetas: brochure.etiquetas,
          }
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

  function set<K extends keyof BorradorBrochure>(k: K, v: BorradorBrochure[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  /** El archivo se valida al elegirlo y no al guardar: enterarse de que el PDF
   *  pesa 40 MB después de completar seis campos es la peor versión de este
   *  formulario. */
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

  function agregarEtiqueta(bruta: string) {
    const [limpia] = normalizarEtiquetas([bruta])
    setEtiquetaNueva("")
    if (!limpia || f.etiquetas.includes(limpia)) return
    if (f.etiquetas.length >= LIMITES.etiquetas) return
    set("etiquetas", [...f.etiquetas, limpia])
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
      cuerpo.set("industria", f.industria ?? "")
      cuerpo.set("descripcion", f.descripcion)
      cuerpo.set("cuandoUsar", f.cuandoUsar)
      cuerpo.set("etiquetas", JSON.stringify(f.etiquetas))
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

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? "Editar brochure" : "Nuevo brochure"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {editando ? (
                  <>
                    Sigue a nombre de {brochure.autorNombre}
                    {brochure.autorId !== yo.id && " — vos quedás como último editor"}
                  </>
                ) : (
                  <>Va a quedar a nombre de {yo.nombre}</>
                )}
              </p>
            </div>
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

          <Campo id="titulo" rotulo="Título">
            <Input
              id="titulo"
              value={f.titulo}
              maxLength={LIMITES.titulo}
              disabled={guardando}
              placeholder="Propuesta de firma biométrica para bancos"
              onChange={(e) => set("titulo", e.target.value)}
            />
            <Ayuda>
              Cómo lo vas a pedir en voz alta. Describí el material y a quién va: “Propuesta
              bancos” se encuentra, “Brochure v4 final” no.
            </Ayuda>
          </Campo>

          {/* Solución */}
          <section>
            <Rotulo>¿De qué solución habla?</Rotulo>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOLUCIONES.map((s) => (
                <Opcion
                  key={s}
                  activa={f.solucion === s}
                  disabled={guardando}
                  onClick={() => set("solucion", s)}
                >
                  {SOLUCION_LABEL[s]}
                </Opcion>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-muted">{SOLUCION_PISTA[f.solucion]}</p>
          </section>

          {/* Industria */}
          <section>
            <Rotulo>¿A qué industria le habla?</Rotulo>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* "Todas" es la primera y es el default: la mayoría del material
                  sirve para cualquiera, y forzar una industria inventada lo
                  esconde justo cuando serviría. */}
              <Opcion
                activa={f.industria === null}
                disabled={guardando}
                onClick={() => set("industria", null)}
              >
                {INDUSTRIA_TRANSVERSAL}
              </Opcion>
              {INDUSTRIAS.map((i) => (
                <Opcion
                  key={i}
                  activa={f.industria === i}
                  disabled={guardando}
                  onClick={() => set("industria", f.industria === i ? null : i)}
                >
                  {INDUSTRIA_LABEL[i]}
                </Opcion>
              ))}
            </div>
          </section>

          <Campo id="descripcion" rotulo="Qué dice adentro" opcional>
            <Textarea
              id="descripcion"
              value={f.descripcion}
              maxLength={LIMITES.descripcion}
              disabled={guardando}
              rows={4}
              placeholder="Ocho páginas: el problema del papel en sucursales, el caso Banco Provincia con las métricas, el detalle técnico de eSignAnywhere y el esquema de despliegue."
              onChange={(e) => set("descripcion", e.target.value)}
            />
            <Ayuda>
              Es lo que evita abrir cuatro PDF para encontrar el que tiene el caso que
              buscabas.
            </Ayuda>
          </Campo>

          <Campo id="cuandoUsar" rotulo="Cuándo mandar este y no otro" opcional>
            <Textarea
              id="cuandoUsar"
              value={f.cuandoUsar}
              maxLength={LIMITES.cuandoUsar}
              disabled={guardando}
              rows={3}
              placeholder="Después de la primera reunión, cuando ya saben qué hacemos. De entrada es demasiado: para el primer contacto va el one-pager."
              onChange={(e) => set("cuandoUsar", e.target.value)}
            />
          </Campo>

          <Campo id="etiqueta" rotulo="Etiquetas" opcional>
            {f.etiquetas.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {f.etiquetas.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted py-1 pl-2 pr-1 text-[11.5px] text-ink-secondary"
                  >
                    {e}
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => set("etiquetas", f.etiquetas.filter((x) => x !== e))}
                      aria-label={`Quitar ${e}`}
                      className="rounded p-0.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="etiqueta"
                value={etiquetaNueva}
                maxLength={LIMITES.etiqueta}
                disabled={guardando || f.etiquetas.length >= LIMITES.etiquetas}
                placeholder={
                  f.etiquetas.length >= LIMITES.etiquetas
                    ? `Máximo ${LIMITES.etiquetas} etiquetas`
                    : "one-pager, caso de éxito, precios…"
                }
                onChange={(e) => setEtiquetaNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    agregarEtiqueta(etiquetaNueva)
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={guardando || !etiquetaNueva.trim()}
                onClick={() => agregarEtiqueta(etiquetaNueva)}
              >
                <Plus />
                Agregar
              </Button>
            </div>
          </Campo>
        </div>

        {/* Pie */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="min-w-0 text-[11.5px] leading-snug text-danger-text">{error}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || faltantes.length > 0}>
              {guardando && <Loader2 className="animate-spin" />}
              {editando ? "Guardar cambios" : "Subir brochure"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── La zona del archivo ──────────────────────────────────────────────────── */

/**
 * Arrastrar o elegir, con tres estados distintos: vacío, con un PDF nuevo
 * elegido, y —solo en la edición— con el archivo que ya está guardado.
 *
 * El tercero es el que importa. Al editar, la zona muestra el PDF vigente y no
 * un recuadro vacío: un recuadro vacío se lee como "no hay archivo" y hace que
 * la persona vuelva a subir el mismo por las dudas.
 */
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
      <Rotulo>{reemplaza ? "El PDF" : "El PDF del brochure"}</Rotulo>

      {/* El archivo que ya está guardado, cuando se está editando */}
      {reemplaza && !archivo && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted">
            <FileText className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-ink">{actual.archivoNombre}</p>
            <p className="num mt-0.5 text-[11px] text-ink-muted">
              v{actual.version} · {formatearTamano(actual.archivoTamano)}
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
          <p className="mt-2.5 text-[12.5px] font-medium text-ink">
            Arrastrá el PDF acá
          </p>
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

/* ── Piezas del formulario ────────────────────────────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow">{children}</p>
}

function Opcion({
  activa,
  disabled,
  onClick,
  children,
}: {
  activa: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
        activa
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Al revés que de costumbre: se marca lo opcional en gris en vez de lo
 * obligatorio con asterisco. Con dos campos requeridos de seis, el asterisco
 * solitario no se ve — el "opcional" sí.
 */
function Campo({
  id,
  rotulo,
  opcional,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2">
        <span className="eyebrow">{rotulo}</span>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Ayuda({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{children}</p>
}
