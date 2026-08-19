"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { BrochureDialog } from "@/components/marketing/brochure-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  INDUSTRIAS,
  INDUSTRIA_LABEL,
  SOLUCIONES,
  SOLUCION_LABEL,
  SOLUCION_PISTA,
  fechaDeBrochure,
  formatearTamano,
  industriaLabel,
  resumenDe,
  urlDeDescarga,
  type Brochure,
  type Industria,
  type Solucion,
  type Yo,
} from "@/lib/marketing/brochures"
import { inicialesDe } from "@/lib/usuario"
import { cn } from "@/lib/utils"

/**
 * El panel de brochures.
 *
 * Es la misma pantalla de dos columnas que las plantillas de mensajes, y a
 * propósito: quien ya sabe usar una sabe usar la otra. Pero lo que va en la
 * columna derecha no es texto para copiar sino el PDF embebido, porque acá la
 * pregunta es distinta —no "qué digo" sino "es este el que buscaba"—, y esa se
 * contesta mirando la primera página, no leyendo una descripción.
 *
 * En pantalla chica esa segunda columna se convierte en una hoja a pantalla
 * completa: es la misma pieza, ubicada distinto, y no un segundo componente que
 * mañana se desincroniza del primero.
 */
export function BrochuresClient() {
  const [brochures, setBrochures] = useState<Brochure[]>([])
  const [yo, setYo] = useState<Yo>({ id: null, nombre: "vos" })
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState("")
  const [solucion, setSolucion] = useState<Solucion | "todas">("todas")
  const [industria, setIndustria] = useState<Industria | "todas">("todas")

  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [editando, setEditando] = useState<Brochure | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  const buscador = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/brochures")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar los brochures")

      setBrochures(d.brochures ?? [])
      if (d.yo) setYo(d.yo)

      // Preseleccionar el primero solo donde hay dos columnas. En el celular la
      // ficha es una hoja a pantalla completa: abrirla sola taparía la lista
      // antes de que la persona haya elegido nada.
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setSeleccionId((prev) => prev ?? (d.brochures?.[0]?.id ?? null))
      }
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los brochures")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // "/" enfoca el buscador, salvo que ya se esté escribiendo en algún campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return
      const activo = document.activeElement
      if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement) return
      e.preventDefault()
      buscador.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ── Filtrado ───────────────────────────────────────────────────────────── */

  // La búsqueda entra también a la descripción y al nombre del archivo: uno se
  // acuerda de "el que tiene el caso de Andreani", casi nunca del título que le
  // puso otro.
  const porTexto = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return brochures
    return brochures.filter((b) =>
      [b.titulo, b.descripcion, b.cuandoUsar, b.archivoNombre, b.autorNombre, ...b.etiquetas]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(q))
    )
  }, [brochures, busqueda])

  /**
   * El filtro de industria incluye a los transversales.
   *
   * Es la decisión que hace que el filtro sirva: quien pregunta "qué tenemos
   * para bancos" quiere el material específico de bancos **y** el institucional
   * que también les sirve. Dejar afuera lo transversal daría una respuesta corta
   * y equivocada.
   */
  const visibles = useMemo(() => {
    return porTexto.filter((b) => {
      if (solucion !== "todas" && b.solucion !== solucion) return false
      if (industria !== "todas" && b.industria !== null && b.industria !== industria) {
        return false
      }
      return true
    })
  }, [porTexto, solucion, industria])

  const conteosSolucion = useMemo(() => {
    const mapa = new Map<Solucion, number>()
    for (const b of porTexto) mapa.set(b.solucion, (mapa.get(b.solucion) ?? 0) + 1)
    return mapa
  }, [porTexto])

  /**
   * Agrupados por solución, en el orden del sitio y no por fecha.
   *
   * Es la diferencia entre una carpeta y un catálogo: ordenado por fecha, lo
   * último que alguien subió queda arriba y la lista cambia de forma todas las
   * semanas. Agrupado por solución, el que busca "algo de firma biométrica" mira
   * un solo bloque.
   */
  const grupos = useMemo(() => {
    return SOLUCIONES.map((s) => ({
      solucion: s,
      items: visibles
        .filter((b) => b.solucion === s)
        .sort((a, b) => b.descargas - a.descargas || a.titulo.localeCompare(b.titulo, "es")),
    })).filter((g) => g.items.length > 0)
  }, [visibles])

  const seleccion = useMemo(
    () => brochures.find((b) => b.id === seleccionId) ?? null,
    [brochures, seleccionId]
  )

  /* ── Acciones ───────────────────────────────────────────────────────────── */

  function abrirAlta() {
    setEditando(null)
    setDialogoAbierto(true)
  }

  function abrirEdicion(b: Brochure) {
    setEditando(b)
    setDialogoAbierto(true)
  }

  function alGuardar(b: Brochure, esNuevo: boolean) {
    setBrochures((prev) => (esNuevo ? [b, ...prev] : prev.map((x) => (x.id === b.id ? b : x))))
    setSeleccionId(b.id)
    setDialogoAbierto(false)
    toast.success(esNuevo ? "Brochure subido" : "Brochure actualizado")
  }

  async function borrar(b: Brochure) {
    const r = await fetch(`/api/marketing/brochures/${b.id}`, { method: "DELETE" })
    if (!r.ok) {
      toast.error("No se pudo borrar")
      return
    }
    setBrochures((prev) => prev.filter((x) => x.id !== b.id))
    setSeleccionId((prev) => (prev === b.id ? null : prev))
    toast.success("Brochure eliminado")
  }

  /**
   * Registrar el uso no puede demorar la apertura del PDF: se navega, y el
   * conteo se manda sin esperar la respuesta. Si eso falla, el archivo ya está
   * abierto y a nadie le importa el número.
   */
  function registrarUso(b: Brochure) {
    fetch(`/api/marketing/brochures/${b.id}/descarga`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) return
        const d = await r.json()
        setBrochures((prev) =>
          prev.map((x) =>
            x.id === b.id ? { ...x, descargas: d.descargas ?? x.descargas + 1 } : x
          )
        )
      })
      .catch(() => {})
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (cargando) return <LoadingState label="Cargando brochures…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  const hayAlguno = brochures.length > 0
  const hayFiltro = busqueda.trim() !== "" || solucion !== "todas" || industria !== "todas"

  function limpiar() {
    setBusqueda("")
    setSolucion("todas")
    setIndustria("todas")
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <Filtros
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          solucion={solucion}
          onSolucion={setSolucion}
          industria={industria}
          onIndustria={setIndustria}
          conteos={conteosSolucion}
          total={porTexto.length}
          onNuevo={abrirAlta}
          ref={buscador}
        />

        {!hayAlguno ? (
          <div className="panel">
            <EmptyState
              icon={FileText}
              title="Todavía no hay brochures"
              description="Empezá por el material que más veces mandaste este mes. El institucional y la propuesta de la solución que más vendés son siempre los primeros dos."
              action={
                <Button onClick={abrirAlta}>
                  <Plus />
                  Subir el primero
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
            <Lista
              grupos={grupos}
              seleccionId={seleccionId}
              yo={yo}
              hayFiltro={hayFiltro}
              onLimpiar={limpiar}
              onSeleccionar={setSeleccionId}
            />

            <Ficha
              brochure={seleccion}
              yo={yo}
              onCerrar={() => setSeleccionId(null)}
              onUsar={registrarUso}
              onEditar={abrirEdicion}
              onBorrar={borrar}
            />
          </div>
        )}
      </div>

      <BrochureDialog
        abierto={dialogoAbierto}
        brochure={editando}
        yo={yo}
        onCerrar={() => setDialogoAbierto(false)}
        onGuardado={alGuardar}
      />
    </>
  )
}

/* ── Filtros ──────────────────────────────────────────────────────────────── */

function Filtros({
  busqueda,
  onBusqueda,
  solucion,
  onSolucion,
  industria,
  onIndustria,
  conteos,
  total,
  onNuevo,
  ref,
}: {
  busqueda: string
  onBusqueda: (v: string) => void
  solucion: Solucion | "todas"
  onSolucion: (v: Solucion | "todas") => void
  industria: Industria | "todas"
  onIndustria: (v: Industria | "todas") => void
  conteos: Map<Solucion, number>
  total: number
  onNuevo: () => void
  ref: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            strokeWidth={2}
          />
          <Input
            ref={ref}
            type="search"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar por título, contenido o archivo…"
            aria-label="Buscar brochures"
            className="pl-9"
          />
        </div>

        <Button onClick={onNuevo} className="shrink-0">
          <Plus />
          Nuevo brochure
        </Button>
      </div>

      {/* Los conteos son parte del filtro, no decoración: un rótulo sin número
          obliga a probarlo para descubrir que no hay nada de eso todavía. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip activo={solucion === "todas"} onClick={() => onSolucion("todas")} conteo={total}>
          Todas
        </Chip>
        {SOLUCIONES.map((s) => {
          const conteo = conteos.get(s) ?? 0
          if (conteo === 0 && solucion !== s) return null
          return (
            <Chip
              key={s}
              activo={solucion === s}
              onClick={() => onSolucion(solucion === s ? "todas" : s)}
              conteo={conteo}
              title={SOLUCION_PISTA[s]}
            >
              {SOLUCION_LABEL[s]}
            </Chip>
          )
        })}
      </div>

      {/* La industria va en su propia fila y sin conteo: es un segundo corte
          sobre el primero, y numerarlo también convertiría la cabecera en una
          tabla de números que nadie lee. */}
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        <span className="eyebrow shrink-0 pr-1">Industria</span>
        <Pastilla activo={industria === "todas"} onClick={() => onIndustria("todas")}>
          Cualquiera
        </Pastilla>
        {INDUSTRIAS.map((i) => (
          <Pastilla
            key={i}
            activo={industria === i}
            onClick={() => onIndustria(industria === i ? "todas" : i)}
          >
            {INDUSTRIA_LABEL[i]}
          </Pastilla>
        ))}
      </div>
    </div>
  )
}

function Chip({
  activo,
  conteo,
  onClick,
  title,
  children,
}: {
  activo: boolean
  conteo: number
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
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
        className={cn(
          "num text-[11px] font-semibold",
          activo ? "text-brand-600" : "text-ink-faint"
        )}
      >
        {conteo}
      </span>
    </button>
  )
}

function Pastilla({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "shrink-0 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors",
        activo
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-transparent bg-surface-muted text-ink-muted hover:bg-surface-sunken hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

/* ── Lista ────────────────────────────────────────────────────────────────── */

function Lista({
  grupos,
  seleccionId,
  yo,
  hayFiltro,
  onLimpiar,
  onSeleccionar,
}: {
  grupos: { solucion: Solucion; items: Brochure[] }[]
  seleccionId: string | null
  yo: Yo
  hayFiltro: boolean
  onLimpiar: () => void
  onSeleccionar: (id: string) => void
}) {
  if (grupos.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          icon={Search}
          title="Ninguno coincide"
          description="Probá con una palabra de lo que dice el material en vez del título."
          action={
            hayFiltro && (
              <Button variant="outline" size="sm" onClick={onLimpiar}>
                <Eraser />
                Limpiar filtros
              </Button>
            )
          }
          className="py-14"
        />
      </div>
    )
  }

  return (
    <nav
      aria-label="Brochures"
      className="lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-124px)] lg:overflow-y-auto lg:pr-1"
    >
      <div className="space-y-5">
        {grupos.map((g) => (
          <section key={g.solucion}>
            <h2 className="eyebrow mb-2 flex items-baseline gap-2 px-1">
              {SOLUCION_LABEL[g.solucion]}
              <span className="num text-[10px] font-semibold text-ink-faint">
                {g.items.length}
              </span>
            </h2>
            <ul className="space-y-1.5">
              {g.items.map((b) => (
                <li key={b.id}>
                  <FilaBrochure
                    brochure={b}
                    activa={b.id === seleccionId}
                    mio={b.autorId !== null && b.autorId === yo.id}
                    onClick={() => onSeleccionar(b.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}

function FilaBrochure({
  brochure,
  activa,
  mio,
  onClick,
}: {
  brochure: Brochure
  activa: boolean
  mio: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "true" : undefined}
      className={cn(
        // El riel del estado activo es absoluto y no un border-l: un borde de
        // 3px empujaría el texto y la fila bailaría al seleccionarla.
        "relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all duration-150",
        activa
          ? "border-brand-200 bg-brand-50/70 shadow-e1"
          : "border-line bg-surface hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      {activa && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand-600"
        />
      )}

      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
            activa
              ? "border-brand-200 bg-surface text-brand-600"
              : "border-line bg-surface-muted text-ink-muted"
          )}
        >
          <FileText className="h-[13px] w-[13px]" strokeWidth={1.9} />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] font-semibold tracking-[-0.01em]",
              activa ? "text-brand-800" : "text-ink"
            )}
          >
            {brochure.titulo}
          </p>

          <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
            {industriaLabel(brochure.industria)}
          </p>

          {brochure.descripcion && (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-muted">
              {resumenDe(brochure.descripcion, 90)}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Avatar nombre={brochure.autorNombre} mio={mio} />
            <span className="truncate text-[11px] text-ink-subtle">
              {mio ? "Vos" : brochure.autorNombre}
            </span>
            {brochure.version > 1 && (
              <span className="num shrink-0 rounded border border-line bg-surface-muted px-1 text-[10px] font-semibold text-ink-muted">
                v{brochure.version}
              </span>
            )}
            {brochure.descargas > 0 && (
              <span className="num ml-auto shrink-0 text-[10.5px] text-ink-faint">
                {brochure.descargas} {brochure.descargas === 1 ? "envío" : "envíos"}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function Avatar({ nombre, mio }: { nombre: string; mio: boolean }) {
  return (
    <span
      aria-hidden
      title={nombre}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[8.5px] font-bold leading-none",
        mio
          ? "border-brand-200 bg-brand-100 text-brand-700"
          : "border-line bg-surface-muted text-ink-muted"
      )}
    >
      {inicialesDe(nombre)}
    </span>
  )
}

/* ── Ficha ────────────────────────────────────────────────────────────────── */

function Ficha({
  brochure,
  yo,
  onCerrar,
  onUsar,
  onEditar,
  onBorrar,
}: {
  brochure: Brochure | null
  yo: Yo
  onCerrar: () => void
  onUsar: (b: Brochure) => void
  onEditar: (b: Brochure) => void
  onBorrar: (b: Brochure) => void
}) {
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    setConfirmando(false)
  }, [brochure?.id])

  if (!brochure) {
    return (
      <div className="panel hidden lg:block">
        <EmptyState
          icon={Layers}
          title="Elegí un brochure"
          description="Se abre acá, con la primera página a la vista. Es la forma más rápida de confirmar que es el material que buscabas antes de mandarlo."
        />
      </div>
    )
  }

  const mio = brochure.autorId !== null && brochure.autorId === yo.id

  return (
    <article
      // En pantalla chica la ficha tapa la pantalla; de lg para arriba vuelve a
      // ser la segunda columna, pegada al scroll. Una sola pieza para los dos
      // casos: dos componentes se desincronizan a la tercera edición.
      className={cn(
        "fixed inset-0 z-40 overflow-y-auto bg-background p-4 sm:p-6",
        "lg:sticky lg:inset-auto lg:top-[92px] lg:z-auto lg:max-h-[calc(100vh-124px)] lg:bg-transparent lg:p-0"
      )}
    >
      <div className="panel mx-auto flex max-w-3xl flex-col lg:max-h-[calc(100vh-124px)] lg:max-w-none">
        {/* Cabecera */}
        <header className="shrink-0 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={onCerrar}
            className="group mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:text-ink lg:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Volver a la lista
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-2">
                {SOLUCION_LABEL[brochure.solucion]}
                <span className="h-2.5 w-px bg-line-strong" />
                <span className="normal-case tracking-normal text-ink-muted">
                  {industriaLabel(brochure.industria)}
                </span>
              </p>
              <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-ink">
                {brochure.titulo}
              </h2>
            </div>

            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink lg:flex"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {brochure.cuandoUsar && (
            <p className="mt-3 border-l-2 border-brand-200 pl-3 text-[12.5px] italic leading-[1.65] text-ink-secondary">
              {brochure.cuandoUsar}
            </p>
          )}

          {brochure.descripcion && (
            <p className="mt-3 text-[12.5px] leading-[1.7] text-ink-secondary">
              {brochure.descripcion}
            </p>
          )}

          {brochure.etiquetas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brochure.etiquetas.map((e) => (
                <span
                  key={e}
                  className="rounded-md border border-line bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-muted"
                >
                  {e}
                </span>
              ))}
            </div>
          )}
        </header>

        <Visor brochure={brochure} />

        {/* Acciones */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          {brochure.url ? (
            <>
              {/* El nombre del archivo lo fuerza la URL y no un atributo
                  `download` — ver `urlDeDescarga`. Sin eso el PDF llega al disco
                  con el uuid de la ruta y el cliente recibe un adjunto
                  ilegible. */}
              <Button asChild onClick={() => onUsar(brochure)}>
                <a href={urlDeDescarga(brochure) ?? brochure.url}>
                  <Download />
                  Descargar PDF
                </a>
              </Button>
              <Button asChild variant="outline" onClick={() => onUsar(brochure)}>
                <a href={brochure.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Abrir aparte
                </a>
              </Button>
            </>
          ) : (
            <p className="text-[11.5px] text-danger-text">
              El archivo no está disponible. Volvé a subir el PDF desde “Editar”.
            </p>
          )}

          <span className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEditar(brochure)}>
              <Pencil />
              Editar
            </Button>

            {confirmando ? (
              <span className="flex items-center gap-1.5">
                <Button variant="destructive" size="sm" onClick={() => onBorrar(brochure)}>
                  Borrar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmando(true)}
                aria-label="Borrar brochure"
              >
                <Trash2 />
              </Button>
            )}
          </span>
        </div>

        {/* Firma */}
        <footer className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-5 py-3 text-[11.5px] text-ink-muted sm:px-6">
          <Avatar nombre={brochure.autorNombre} mio={mio} />
          <span>
            Subido por{" "}
            <span className="font-medium text-ink-secondary">
              {mio ? "vos" : brochure.autorNombre}
            </span>{" "}
            el {fechaDeBrochure(brochure.createdAt)}
          </span>
          {brochure.version > 1 && (
            <span className="text-ink-faint">
              · v{brochure.version} del {fechaDeBrochure(brochure.updatedAt)}
              {brochure.editorNombre && ` por ${brochure.editorNombre}`}
            </span>
          )}
          <span className="num ml-auto text-ink-faint">
            {brochure.archivoNombre} · {formatearTamano(brochure.archivoTamano)}
          </span>
        </footer>
      </div>
    </article>
  )
}

/**
 * El PDF embebido.
 *
 * Va en un `iframe` con la URL firmada y no en un visor propio: el navegador ya
 * trae uno, con zoom, búsqueda e impresión, y meter una librería de renderizado
 * para lograr algo peor no se justifica. El único costo es que el `iframe` no
 * avisa si el enlace venció; para eso está el botón de abrir aparte.
 *
 * `#toolbar=0` esconde la barra del visor nativo dentro de la ficha: acá el PDF
 * se mira, no se opera — descargar e imprimir tienen su propio botón abajo, con
 * el nombre de archivo correcto.
 *
 * Mirar la vista previa **no** cuenta como uso, a propósito. El contador tiene
 * que contestar "cuál de estos se manda de verdad", y si sumara con solo
 * recorrer la lista con las flechas, en una semana todos tendrían el mismo
 * número y no diría nada. Suman los dos botones de abajo, que son las dos formas
 * de sacar el archivo de esta pantalla.
 */
function Visor({ brochure }: { brochure: Brochure }) {
  if (!brochure.url) {
    return (
      <div className="flex-1 px-5 py-10 sm:px-6">
        <EmptyState
          icon={FileText}
          title="El PDF no se pudo abrir"
          description="El archivo no está en el bucket o el enlace no se pudo firmar. Subilo de nuevo desde “Editar”."
          className="py-8"
        />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 bg-surface-sunken">
      <iframe
        // La `key` fuerza el remonte al cambiar de brochure: sin ella, algunos
        // navegadores dejan renderizado el PDF anterior porque la URL firmada
        // cambia en la query y el visor no la considera una navegación.
        key={brochure.id}
        src={`${brochure.url}#toolbar=0&navpanes=0&view=FitH`}
        title={`${brochure.titulo} — vista previa`}
        className="h-[52vh] w-full border-0 lg:h-full lg:min-h-[420px]"
      />
    </div>
  )
}
