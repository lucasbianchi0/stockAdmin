"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/states"
import { DescargarImagen } from "@/components/contenido/pieza-banco-dialog"
import {
  BANCO_LABEL,
  textoParaPublicar,
  type PiezaBanco,
} from "@/lib/banco-context"
import {
  aFecha,
  aISO,
  fechaLarga,
  hoyISO,
  sumarDias,
  type Contenido,
} from "@/lib/calendario-context"
import { cn } from "@/lib/utils"

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/**
 * La grilla del mes, arrancando el lunes.
 *
 * Seis semanas SIEMPRE, no las que haga falta. Un mes que a veces dibuja cinco
 * filas y a veces seis cambia de alto al navegar, y el calendario da un salto en
 * cada click — que es la clase de detalle que hace que una pantalla se sienta
 * hecha a mano y no construida.
 */
function grillaDelMes(anio: number, mes: number): string[] {
  const primero = new Date(Date.UTC(anio, mes, 1, 12))
  // getUTCDay(): 0 es domingo. La semana acá arranca el lunes, así que el
  // domingo es el sexto y no el primero.
  const corrimiento = (primero.getUTCDay() + 6) % 7
  const inicio = aISO(new Date(primero.getTime() - corrimiento * 86400000))

  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i))
}

/**
 * El calendario de contenido: lo que ya está programado, mes por mes.
 *
 * Muestra sólo las piezas que salieron del banco con fecha. Es a propósito que
 * no muestre el banco entero: una pieza sin fecha no es una decisión pendiente
 * del calendario, es material esperando en la otra pantalla, y mezclar las dos
 * cosas convierte el calendario en una lista de tareas.
 */
export function AgendaClient() {
  const hoy = hoyISO()
  const [ancla, setAncla] = useState(() => {
    const d = aFecha(hoy)
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() }
  })
  const [piezas, setPiezas] = useState<PiezaBanco[]>([])
  const [cargando, setCargando] = useState(true)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)

  const dias = useMemo(() => grillaDelMes(ancla.anio, ancla.mes), [ancla])

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch(
        `/api/contenido/agenda?desde=${dias[0]}&hasta=${dias[dias.length - 1]}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPiezas((data.piezas ?? []) as PiezaBanco[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el calendario")
    } finally {
      setCargando(false)
    }
  }, [dias])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /** Las piezas de cada día, indexadas una vez y no filtradas 42 veces. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, PiezaBanco[]>()
    for (const p of piezas) {
      if (!p.programada) continue
      const lista = mapa.get(p.programada)
      if (lista) lista.push(p)
      else mapa.set(p.programada, [p])
    }
    return mapa
  }, [piezas])

  const mover = useCallback((n: number) => {
    setAncla(({ anio, mes }) => {
      const d = new Date(Date.UTC(anio, mes + n, 1, 12))
      return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() }
    })
  }, [])

  const volverAlBanco = useCallback(
    async (pieza: PiezaBanco) => {
      try {
        const res = await fetch("/api/contenido/banco/exportar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ piezaId: pieza.id, fecha: null }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        setPiezas((prev) => prev.filter((p) => p.id !== pieza.id))
        toast.success("Volvió al banco, con su imagen y su copy")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo mover")
      }
    },
    []
  )

  const delDia = diaAbierto ? (porDia.get(diaAbierto) ?? []) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => mover(1)} aria-label="Mes siguiente">
            <ChevronRight />
          </Button>
          <p className="ml-1.5 text-[14px] font-semibold capitalize tracking-[-0.015em] text-ink">
            {MESES[ancla.mes]} {ancla.anio}
          </p>
          {cargando && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-ink-faint" />}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = aFecha(hoy)
              setAncla({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() })
            }}
          >
            Hoy
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/contenido/generacion">
              <Sparkles />
              Generar contenido
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
        <div className="grid grid-cols-7 border-b border-line bg-surface-subtle">
          {DIAS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {dias.map((iso) => (
            <Celda
              key={iso}
              iso={iso}
              hoy={hoy}
              delMes={aFecha(iso).getUTCMonth() === ancla.mes}
              piezas={porDia.get(iso) ?? []}
              onAbrir={() => setDiaAbierto(iso)}
            />
          ))}
        </div>
      </div>

      {cargando && piezas.length === 0 && <LoadingState label="Cargando el calendario…" />}

      {diaAbierto && (
        <DiaDialog
          iso={diaAbierto}
          piezas={delDia}
          onCerrar={() => setDiaAbierto(null)}
          onVolverAlBanco={volverAlBanco}
        />
      )}
    </div>
  )
}

function Celda({
  iso,
  hoy,
  delMes,
  piezas,
  onAbrir,
}: {
  iso: string
  hoy: string
  /** Si el día pertenece al mes que se está mirando o es relleno. */
  delMes: boolean
  piezas: PiezaBanco[]
  onAbrir: () => void
}) {
  const numero = aFecha(iso).getUTCDate()
  const esHoy = iso === hoy

  return (
    <button
      onClick={onAbrir}
      disabled={piezas.length === 0}
      className={cn(
        "flex min-h-[104px] flex-col gap-1 border-b border-r border-line p-1.5 text-left align-top",
        "transition-colors duration-150",
        delMes ? "bg-surface" : "bg-surface-subtle",
        piezas.length > 0
          ? "cursor-pointer hover:bg-surface-muted"
          : "cursor-default",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      )}
    >
      <span
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold tabular-nums",
          esHoy
            ? "bg-brand-600 text-white"
            : delMes
              ? "text-ink-secondary"
              : "text-ink-faint"
        )}
      >
        {numero}
      </span>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {piezas.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface-muted px-1 py-1"
          >
            {p.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- firma temporal de Supabase
              <img
                src={p.imagenUrl}
                alt=""
                className="h-6 w-6 shrink-0 rounded object-cover"
              />
            ) : (
              <span className="h-6 w-6 shrink-0 rounded bg-surface-sunken" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] font-medium leading-tight text-ink">
                {p.idea.titulo}
              </span>
              <span className="block text-[9.5px] leading-tight text-ink-faint">
                {BANCO_LABEL[p.canal]}
              </span>
            </span>
          </span>
        ))}
      </div>
    </button>
  )
}

/**
 * Un día del calendario, abierto.
 *
 * Es la pantalla del momento de publicar, y por eso no hay nada que editar acá:
 * imagen para descargar, texto para copiar, y el botón para devolver la pieza al
 * banco si ese día ya no va. Editar el copy es trabajo de la otra pantalla, con
 * la imagen al lado.
 */
function DiaDialog({
  iso,
  piezas,
  onCerrar,
  onVolverAlBanco,
}: {
  iso: string
  piezas: PiezaBanco[]
  onCerrar: () => void
  onVolverAlBanco: (p: PiezaBanco) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Publicaciones del ${fechaLarga(iso)}`}
    >
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />

      <div className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e3 sm:rounded-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {/* `first-letter` y no `capitalize`: "lun 24 de ago" con capitalize
                sale "Lun 24 De Ago" — mayúscula en cada palabra, incluida la
                preposición. Sólo la primera letra de la frase. */}
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink first-letter:uppercase">
              {fechaLarga(iso)}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {piezas.length === 1 ? "Una publicación" : `${piezas.length} publicaciones`}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {piezas.map((p) => (
            <PublicacionDelDia key={p.id} pieza={p} onVolverAlBanco={() => onVolverAlBanco(p)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PublicacionDelDia({
  pieza,
  onVolverAlBanco,
}: {
  pieza: PiezaBanco
  onVolverAlBanco: () => void
}) {
  const [copiado, setCopiado] = useState<string | null>(null)

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

  const contenido: Contenido | null = pieza.contenido

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-[200px_1fr]">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border border-line bg-surface-muted">
          {pieza.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- firma temporal de Supabase
            <img src={pieza.imagenUrl} alt={pieza.idea.titulo} className="h-auto w-full" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-[11.5px] text-ink-faint">
              Sin imagen
            </div>
          )}
        </div>
        {pieza.imagenUrl && (
          <DescargarImagen url={pieza.imagenUrl} nombre={pieza.idea.titulo} />
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand" size="sm">
            {BANCO_LABEL[pieza.canal]}
          </Badge>
          <p className="truncate text-[13px] font-semibold text-ink">{pieza.idea.titulo}</p>
        </div>

        <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface-subtle p-3 text-[12px] leading-relaxed text-ink-secondary">
          {contenido?.caption || "Esta pieza no tiene copy."}
        </p>

        {contenido?.hashtags && (
          <p className="text-[11.5px] leading-relaxed text-brand-700">{contenido.hashtags}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => copiar(`todo-${pieza.id}`, textoParaPublicar(contenido))}
            disabled={!contenido}
          >
            {copiado === `todo-${pieza.id}` ? <Check /> : <Copy />}
            Copiar el post
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copiar(`tags-${pieza.id}`, contenido?.hashtags ?? "")}
            disabled={!contenido?.hashtags}
          >
            {copiado === `tags-${pieza.id}` ? <Check /> : <Copy />}
            Hashtags
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolverAlBanco}>
            <Undo2 />
            Volver al banco
          </Button>
        </div>
      </div>
    </div>
  )
}

/** El atajo a la generación, para la cabecera de la página. */
export function EnlaceBanco() {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href="/contenido/generacion">
        <CalendarDays />
        Generación de contenido
      </Link>
    </Button>
  )
}
