"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { BrochureDialog } from "@/components/marketing/brochure-dialog"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  SOLUCIONES,
  SOLUCION_LABEL,
  formatearTamano,
  urlDeDescarga,
  type Brochure,
  type Solucion,
} from "@/lib/marketing/brochures"
import { cn } from "@/lib/utils"

/**
 * El panel de brochures: los filtros de categoría y los PDF. Nada más.
 *
 * Hubo una versión de dos columnas con buscador, filtro por industria, ficha con
 * descripción, etiquetas, autor, versión y visor embebido. Se sacó entera. Lo
 * que se viene a hacer acá es una sola cosa —encontrar un PDF y abrirlo para
 * mandarlo— y cada control que no servía a eso ponía un paso en el medio. Con
 * media docena de archivos, buscar por texto tampoco tenía a quién servir: los
 * chips de arriba ya dejan cualquier categoría a un clic.
 *
 * Abrir es un enlace de verdad y no un visor: el PDF se ve en la pestaña nueva
 * con el lector del navegador, que imprime, busca y guarda mejor que cualquier
 * cosa que pongamos acá adentro.
 */
export function BrochuresClient() {
  const [brochures, setBrochures] = useState<Brochure[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [solucion, setSolucion] = useState<Solucion | "todas">("todas")

  const [editando, setEditando] = useState<Brochure | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/brochures")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar los brochures")
      setBrochures(d.brochures ?? [])
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los brochures")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /* ── Filtrado ───────────────────────────────────────────────────────────── */

  const conteos = useMemo(() => {
    const m = new Map<Solucion, number>()
    for (const b of brochures) m.set(b.solucion, (m.get(b.solucion) ?? 0) + 1)
    return m
  }, [brochures])

  const visibles = useMemo(() => {
    const lista =
      solucion === "todas" ? brochures : brochures.filter((b) => b.solucion === solucion)
    return [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo, "es"))
  }, [brochures, solucion])

  /* ── Acciones ───────────────────────────────────────────────────────────── */

  // El contador vive en la base y no se muestra en ningún lado: es la única
  // medición de qué material usa alguien de verdad. No se espera la respuesta —
  // que se pierda un conteo es irrelevante; que se demore el PDF, no.
  function registrarApertura(b: Brochure) {
    fetch(`/api/marketing/brochures/${b.id}/descarga`, { method: "POST" }).catch(() => {})
  }

  async function borrar(b: Brochure) {
    if (!confirm(`¿Borrar “${b.titulo}”? El PDF se elimina y no se puede deshacer.`)) return
    try {
      const r = await fetch(`/api/marketing/brochures/${b.id}`, { method: "DELETE" })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? "No se pudo borrar")
      }
      setBrochures((prev) => prev.filter((x) => x.id !== b.id))
      toast.success("Brochure borrado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    }
  }

  function alGuardar(b: Brochure, esNuevo: boolean) {
    setBrochures((prev) => (esNuevo ? [b, ...prev] : prev.map((x) => (x.id === b.id ? b : x))))
    setDialogoAbierto(false)
    setEditando(null)
    toast.success(esNuevo ? "Brochure subido" : "Brochure actualizado")
  }

  function abrirAlta() {
    setEditando(null)
    setDialogoAbierto(true)
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (cargando) return <LoadingState label="Cargando brochures…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  return (
    <>
      <div className="space-y-5">
        {/* Categorías */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            activo={solucion === "todas"}
            conteo={brochures.length}
            onClick={() => setSolucion("todas")}
          >
            Todas
          </Chip>

          {/* Solo las categorías que tienen material: un chip en cero es un
              filtro que promete algo y devuelve una pantalla vacía. */}
          {SOLUCIONES.filter((s) => (conteos.get(s) ?? 0) > 0).map((s) => (
            <Chip
              key={s}
              activo={solucion === s}
              conteo={conteos.get(s) ?? 0}
              onClick={() => setSolucion(s)}
            >
              {SOLUCION_LABEL[s]}
            </Chip>
          ))}

          <Button size="sm" className="ml-auto" onClick={abrirAlta}>
            <Plus />
            Nuevo brochure
          </Button>
        </div>

        {/* Los PDF */}
        {visibles.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={
              brochures.length === 0 ? "Todavía no hay brochures" : "Nada en esta categoría"
            }
            description={
              brochures.length === 0
                ? "Subí el primer PDF y va a quedar disponible para todo el equipo."
                : "Probá con otra categoría o subí el material que falta."
            }
            action={
              <Button size="sm" onClick={abrirAlta}>
                <Plus />
                Nuevo brochure
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map((b) => (
              <Tarjeta
                key={b.id}
                brochure={b}
                onAbrir={() => registrarApertura(b)}
                onEditar={() => {
                  setEditando(b)
                  setDialogoAbierto(true)
                }}
                onBorrar={() => borrar(b)}
              />
            ))}
          </div>
        )}
      </div>

      <BrochureDialog
        abierto={dialogoAbierto}
        brochure={editando}
        onCerrar={() => {
          setDialogoAbierto(false)
          setEditando(null)
        }}
        onGuardado={alGuardar}
      />
    </>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Chip({
  activo,
  conteo,
  onClick,
  children,
}: {
  activo: boolean
  conteo: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
        activo
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle hover:text-ink"
      )}
    >
      {children}
      <span
        className={cn("num text-[11px] font-semibold", activo ? "text-brand-600" : "text-ink-faint")}
      >
        {conteo}
      </span>
    </button>
  )
}

/**
 * Un brochure: su título, su categoría y el botón de abrir.
 *
 * Editar y borrar están, pero apagados hasta que el mouse pasa por encima. Son
 * el mantenimiento del material, no lo que se viene a hacer — y con seis
 * tarjetas en pantalla, doce botones grises compiten con los seis que importan.
 */
function Tarjeta({
  brochure,
  onAbrir,
  onEditar,
  onBorrar,
}: {
  brochure: Brochure
  onAbrir: () => void
  onEditar: () => void
  onBorrar: () => void
}) {
  const descarga = urlDeDescarga(brochure)

  return (
    <article className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-e1">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <FileText className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{SOLUCION_LABEL[brochure.solucion]}</p>
          <h3 className="mt-1 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {brochure.titulo}
          </h3>
          <p className="num mt-1 text-[11px] text-ink-faint">
            {formatearTamano(brochure.archivoTamano)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <Button asChild size="sm" variant="outline" className="flex-1" disabled={!brochure.url}>
          <a href={brochure.url ?? "#"} target="_blank" rel="noreferrer" onClick={onAbrir}>
            <ExternalLink />
            Abrir
          </a>
        </Button>

        {descarga && (
          <IconoAccion href={descarga} label="Descargar" onClick={onAbrir}>
            <Download className="h-[15px] w-[15px]" strokeWidth={1.8} />
          </IconoAccion>
        )}
        <IconoAccion label="Editar" onClick={onEditar}>
          <Pencil className="h-[15px] w-[15px]" strokeWidth={1.8} />
        </IconoAccion>
        <IconoAccion label="Borrar" peligro onClick={onBorrar}>
          <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
        </IconoAccion>
      </div>
    </article>
  )
}

function IconoAccion({
  href,
  label,
  peligro,
  onClick,
  children,
}: {
  href?: string
  label: string
  peligro?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const clases = cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors",
    // Visibles siempre en táctil, donde no hay hover que las revele.
    "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
    peligro ? "hover:bg-danger-bg hover:text-danger-text" : "hover:bg-surface-muted hover:text-ink"
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={label}
        aria-label={label}
        onClick={onClick}
        className={clases}
      >
        {children}
      </a>
    )
  }

  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={clases}>
      {children}
    </button>
  )
}
