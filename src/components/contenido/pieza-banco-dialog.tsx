"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BANCO_LABEL,
  CAMPOS_EDITABLES,
  textoParaPublicar,
  type CampoEditable,
  type PiezaBanco,
} from "@/lib/banco-context"
import { OBJETIVO_LABEL, fechaLarga, type Contenido } from "@/lib/calendario-context"

type Borrador = Record<CampoEditable, string>

const vacio = (): Borrador => ({ caption: "", captionCorto: "", hashtags: "", cta: "" })

function aBorrador(contenido: Contenido | null): Borrador {
  if (!contenido) return vacio()
  return {
    caption: contenido.caption ?? "",
    captionCorto: contenido.captionCorto ?? "",
    hashtags: contenido.hashtags ?? "",
    cta: contenido.cta ?? "",
  }
}

/**
 * Una pieza del banco, abierta.
 *
 * Dos columnas y no una: la imagen y el texto se revisan JUNTOS. El caption
 * tiene que sostener el titular que está impreso en el JPG, y para saber si lo
 * hace hay que estar viendo los dos al mismo tiempo — en una pantalla donde para
 * leer el texto haya que dejar de ver la imagen, esa revisión no ocurre.
 *
 * El titular no es editable, y eso se dice en pantalla en vez de simplemente no
 * estar: ya está compuesto dentro de la imagen, así que cambiarlo acá haría que
 * el post y la pieza digan cosas distintas.
 */
export function PiezaBancoDialog({
  pieza,
  onCerrar,
  onGuardada,
  onDescartada,
  onProgramada,
}: {
  /** `null` cierra el diálogo. */
  pieza: PiezaBanco | null
  onCerrar: () => void
  onGuardada: (p: PiezaBanco) => void
  onDescartada: (id: string) => void
  onProgramada: (p: PiezaBanco) => void
}) {
  const [borrador, setBorrador] = useState<Borrador>(vacio)
  const [guardando, setGuardando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [fecha, setFecha] = useState("")
  const [copiado, setCopiado] = useState<string | null>(null)

  const piezaId = pieza?.id ?? null

  // El borrador se rearma cuando cambia la pieza, no en cada render: si no, cada
  // tecla se perdería contra el valor que viene de arriba.
  useEffect(() => {
    setBorrador(aBorrador(pieza?.contenido ?? null))
  }, [piezaId, pieza?.contenido])

  /* La fecha propuesta se pide al abrir. La calcula el servidor porque depende
     de todo lo ya programado, que esta pantalla no tiene cargado. */
  useEffect(() => {
    if (!piezaId) return
    let vigente = true

    fetch("/api/contenido/banco/exportar")
      .then((r) => r.json())
      .then((d) => vigente && typeof d.fecha === "string" && setFecha(d.fecha))
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [piezaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar])

  const copiar = useCallback(async (clave: string, texto: string) => {
    if (!texto.trim()) return
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(clave)
      setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 1600)
    } catch {
      toast.error("El navegador no dejó copiar")
    }
  }, [])

  if (!pieza) return null

  const sucio = JSON.stringify(borrador) !== JSON.stringify(aBorrador(pieza.contenido))
  const listaParaProgramar = Boolean(pieza.contenido?.caption && pieza.imagenUrl)

  async function guardar(): Promise<PiezaBanco | null> {
    if (!pieza) return null
    setGuardando(true)
    try {
      const res = await fetch("/api/contenido/banco/pieza", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piezaId: pieza.id, contenido: borrador }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onGuardada(data.pieza as PiezaBanco)
      return data.pieza as PiezaBanco
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      return null
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Exportar guarda primero si hay cambios sin guardar.
   *
   * Es la trampa obvia de esta pantalla: alguien corrige una palabra y aprieta
   * "Exportar", y sin esto la pieza se va al calendario con el texto viejo. Que
   * el botón guarde solo es más honesto que deshabilitarlo hasta que guarden.
   */
  async function exportar() {
    if (!pieza) return
    setExportando(true)
    try {
      if (sucio && !(await guardar())) return

      const res = await fetch("/api/contenido/banco/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piezaId: pieza.id, fecha: fecha || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      onProgramada(data.pieza as PiezaBanco)
      toast.success(`Programada para el ${fechaLarga((data.pieza as PiezaBanco).programada ?? fecha)}`)
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo programar")
    } finally {
      setExportando(false)
    }
  }

  async function descartar() {
    if (!pieza) return
    setDescartando(true)
    try {
      const res = await fetch("/api/contenido/banco/pieza", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piezaId: pieza.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onDescartada(pieza.id)
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descartar")
    } finally {
      setDescartando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={pieza.idea.titulo}
    >
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />

      <div className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e3 sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="brand" size="sm">
                {BANCO_LABEL[pieza.canal]}
              </Badge>
              <Badge size="sm">{OBJETIVO_LABEL[pieza.idea.objetivo]}</Badge>
              {!pieza.imagenUrl && (
                <Badge tone="warning" size="sm">
                  Sin imagen
                </Badge>
              )}
            </div>
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
              {pieza.idea.titulo}
            </h2>
          </div>

          <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[380px_1fr]">
          {/* ── La imagen y lo que la explica ───────────────────────────── */}
          <div className="space-y-4 border-b border-line p-5 lg:border-b-0 lg:border-r">
            <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
              {pieza.imagenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- firma temporal de Supabase
                <img src={pieza.imagenUrl} alt={pieza.idea.titulo} className="h-auto w-full" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-[12px] text-ink-faint">
                  Todavía sin imagen
                </div>
              )}
            </div>

            {pieza.imagenUrl && (
              <DescargarImagen url={pieza.imagenUrl} nombre={pieza.idea.titulo} />
            )}

            <div className="space-y-2.5 rounded-xl border border-line bg-surface-subtle p-3.5">
              <Dato
                label="Titular impreso en la imagen"
                nota="No se edita: está compuesto dentro del JPG"
                valor={pieza.idea.headline || "—"}
              />
              {pieza.idea.tesis && <Dato label="Tesis que defiende" valor={pieza.idea.tesis} />}
              {pieza.idea.porQue && <Dato label="Por qué esta pieza" valor={pieza.idea.porQue} />}
            </div>
          </div>

          {/* ── El copy editable ────────────────────────────────────────── */}
          <div className="space-y-4 p-5">
            {pieza.contenido ? (
              CAMPOS_EDITABLES.map((campo) => (
                <div key={campo.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor={`campo-${campo.id}`}
                      className="text-[11.5px] font-semibold text-ink-secondary"
                    >
                      {campo.label}
                    </label>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => copiar(campo.id, borrador[campo.id])}
                    >
                      {copiado === campo.id ? <Check /> : <Copy />}
                      {copiado === campo.id ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <Textarea
                    id={`campo-${campo.id}`}
                    rows={campo.filas}
                    maxLength={campo.max}
                    value={borrador[campo.id]}
                    onChange={(e) =>
                      setBorrador((b) => ({ ...b, [campo.id]: e.target.value }))
                    }
                  />
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink-muted">
                Esta pieza todavía no tiene copy. Volvé a generarla desde el banco.
              </p>
            )}

            {pieza.contenido && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  copiar("todo", textoParaPublicar({ ...pieza.contenido!, ...borrador }))
                }
              >
                {copiado === "todo" ? <Check /> : <Copy />}
                {copiado === "todo" ? "Copiado" : "Copiar el post entero"}
              </Button>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={descartar}
            disabled={descartando || exportando}
            className="text-danger-text hover:bg-danger-soft"
          >
            {descartando ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Descartar
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="fecha-publicacion" className="text-[11.5px] text-ink-muted">
              Publicar el
            </label>
            <Input
              id="fecha-publicacion"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-8 w-[150px] text-[12px]"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={guardar}
              disabled={!sucio || guardando || exportando}
            >
              {guardando ? <Loader2 className="animate-spin" /> : <Check />}
              {sucio ? "Guardar" : "Guardado"}
            </Button>

            <Button
              size="sm"
              onClick={exportar}
              disabled={!listaParaProgramar || exportando}
              title={
                listaParaProgramar
                  ? undefined
                  : "Le falta el copy o la imagen: una fecha con media pieza no se puede publicar"
              }
            >
              {exportando ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              Exportar al calendario
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Dato({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] italic text-ink-faint">{nota}</p>}
    </div>
  )
}

/**
 * Descarga la imagen al disco.
 *
 * Pasa por un blob y no por un `<a download>` sobre la URL firmada: la firma
 * apunta al dominio de Supabase, y `download` no manda en descargas de otro
 * origen — el navegador abriría la imagen en una pestaña en vez de bajarla.
 */
export function DescargarImagen({ url, nombre }: { url: string; nombre: string }) {
  const [bajando, setBajando] = useState(false)

  const bajar = useCallback(async () => {
    setBajando(true)
    try {
      const blob = await (await fetch(url)).blob()
      const objeto = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objeto
      a.download = `accedra-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objeto)
    } catch {
      toast.error("No se pudo descargar la imagen")
    } finally {
      setBajando(false)
    }
  }, [url, nombre])

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={bajar} disabled={bajando}>
      {bajando ? <Loader2 className="animate-spin" /> : <Download />}
      Descargar la imagen
    </Button>
  )
}
