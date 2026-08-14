"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  Copy,
  Eraser,
  MessageSquareQuote,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { CanalIcono } from "@/components/marketing/canal-icono"
import { MensajeDialog } from "@/components/marketing/mensaje-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  CANAL_LABEL,
  CIRCUNSTANCIAS,
  CIRCUNSTANCIA_LABEL,
  CIRCUNSTANCIA_PISTA,
  aplicarVariables,
  fechaDeMensaje,
  partirPorVariables,
  resumenDe,
  rotuloDeVariable,
  variablesDe,
  type Circunstancia,
  type MensajePlantilla,
  type Yo,
} from "@/lib/marketing/mensajes"
import { inicialesDe } from "@/lib/usuario"
import { cn } from "@/lib/utils"

/**
 * El panel de plantillas de mensajes.
 *
 * Es una pantalla de dos columnas y no una grilla de tarjetas por una razón
 * concreta: acá se viene a **leer** un mensaje entero antes de mandarlo, no a
 * mirar cuántos hay. Con tarjetas, cada plantilla se muestra recortada a tres
 * líneas y hay que abrir un modal para ver el texto real — o sea, un modal por
 * cada plantilla que uno compara. La lista a la izquierda y el texto completo a
 * la derecha dejan comparar cuatro con cuatro clicks y sin perder el contexto.
 *
 * En pantalla chica esa segunda columna se convierte en una hoja a pantalla
 * completa: es la misma pieza, ubicada distinto, y no un segundo componente que
 * mañana se desincroniza del primero.
 */
export function MensajesClient() {
  const [mensajes, setMensajes] = useState<MensajePlantilla[]>([])
  const [yo, setYo] = useState<Yo>({ id: null, nombre: "vos" })
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Circunstancia | "todas">("todas")
  const [soloMias, setSoloMias] = useState(false)

  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [editando, setEditando] = useState<MensajePlantilla | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  const buscador = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/mensajes")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar las plantillas")

      setMensajes(d.mensajes ?? [])
      if (d.yo) setYo(d.yo)

      // Preseleccionar la primera solo donde hay dos columnas. En el celular la
      // ficha es una hoja a pantalla completa: abrirla sola taparía la lista
      // antes de que la persona haya elegido nada.
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setSeleccionId((prev) => prev ?? (d.mensajes?.[0]?.id ?? null))
      }
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar las plantillas")
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

  // La búsqueda entra al cuerpo entero, no solo al título: uno se acuerda de la
  // frase ("validez de la propuesta"), casi nunca del nombre que le puso otro.
  const porTexto = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return mensajes.filter((m) => {
      if (soloMias && m.autorId !== yo.id) return false
      if (!q) return true
      return [m.titulo, m.cuerpo, m.asunto, m.cuandoUsar, m.autorNombre, ...m.etiquetas]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(q))
    })
  }, [mensajes, busqueda, soloMias, yo.id])

  const conteos = useMemo(() => {
    const mapa = new Map<Circunstancia, number>()
    for (const m of porTexto) mapa.set(m.circunstancia, (mapa.get(m.circunstancia) ?? 0) + 1)
    return mapa
  }, [porTexto])

  const visibles = useMemo(
    () => (filtro === "todas" ? porTexto : porTexto.filter((m) => m.circunstancia === filtro)),
    [porTexto, filtro]
  )

  /**
   * Agrupadas por circunstancia, en el orden del trato —del primer contacto a la
   * cobranza— y no por fecha.
   *
   * Es la diferencia entre un archivo y un repertorio: ordenado por fecha, lo
   * último que alguien tocó queda arriba y la lista cambia de forma todos los
   * días. Agrupado por momento, el que busca "algo para reclamar una factura"
   * mira un solo bloque.
   */
  const grupos = useMemo(() => {
    return CIRCUNSTANCIAS.map((c) => ({
      circunstancia: c,
      items: visibles
        .filter((m) => m.circunstancia === c)
        .sort((a, b) => b.usos - a.usos || a.titulo.localeCompare(b.titulo, "es")),
    })).filter((g) => g.items.length > 0)
  }, [visibles])

  const seleccion = useMemo(
    () => mensajes.find((m) => m.id === seleccionId) ?? null,
    [mensajes, seleccionId]
  )

  /* ── Acciones ───────────────────────────────────────────────────────────── */

  function abrirAlta() {
    setEditando(null)
    setDialogoAbierto(true)
  }

  function abrirEdicion(m: MensajePlantilla) {
    setEditando(m)
    setDialogoAbierto(true)
  }

  function alGuardar(m: MensajePlantilla, esNuevo: boolean) {
    setMensajes((prev) =>
      esNuevo ? [m, ...prev] : prev.map((x) => (x.id === m.id ? m : x))
    )
    setSeleccionId(m.id)
    setDialogoAbierto(false)
    toast.success(esNuevo ? "Plantilla creada" : "Plantilla actualizada")
  }

  async function borrar(m: MensajePlantilla) {
    const r = await fetch(`/api/marketing/mensajes/${m.id}`, { method: "DELETE" })
    if (!r.ok) {
      toast.error("No se pudo borrar")
      return
    }
    setMensajes((prev) => prev.filter((x) => x.id !== m.id))
    setSeleccionId((prev) => (prev === m.id ? null : prev))
    toast.success("Plantilla eliminada")
  }

  /**
   * Copiar es la acción principal de la pantalla, así que no puede depender de
   * que el contador de usos ande: se copia, se avisa, y recién después se
   * registra el uso sin esperar la respuesta. Si eso falla, el mensaje ya está
   * en el portapapeles y a nadie le importa el número.
   */
  async function copiar(m: MensajePlantilla, texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      toast.error("El navegador no dejó copiar. Seleccioná el texto a mano.")
      return
    }

    toast.success(`${que} copiado`)

    fetch(`/api/marketing/mensajes/${m.id}/uso`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) return
        const d = await r.json()
        setMensajes((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, usos: d.usos ?? x.usos + 1 } : x))
        )
      })
      .catch(() => {})
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (cargando) return <LoadingState label="Cargando plantillas…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  const hayAlgunaCargada = mensajes.length > 0

  return (
    <>
      <div className="flex flex-col gap-4">
        <Filtros
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          filtro={filtro}
          onFiltro={setFiltro}
          conteos={conteos}
          total={porTexto.length}
          soloMias={soloMias}
          onSoloMias={setSoloMias}
          onNueva={abrirAlta}
          ref={buscador}
        />

        {!hayAlgunaCargada ? (
          <div className="panel">
            <EmptyState
              icon={MessageSquareQuote}
              title="Todavía no hay plantillas"
              description="Empezá por el mensaje que más veces escribiste esta semana. El de “te paso el presupuesto” o el de “te recuerdo la factura” son siempre los primeros dos."
              action={
                <Button onClick={abrirAlta}>
                  <Plus />
                  Escribir la primera
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
              hayFiltro={busqueda.trim() !== "" || filtro !== "todas" || soloMias}
              onLimpiar={() => {
                setBusqueda("")
                setFiltro("todas")
                setSoloMias(false)
              }}
              onSeleccionar={setSeleccionId}
            />

            <Ficha
              mensaje={seleccion}
              yo={yo}
              onCerrar={() => setSeleccionId(null)}
              onCopiar={copiar}
              onEditar={abrirEdicion}
              onBorrar={borrar}
            />
          </div>
        )}
      </div>

      <MensajeDialog
        abierto={dialogoAbierto}
        mensaje={editando}
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
  filtro,
  onFiltro,
  conteos,
  total,
  soloMias,
  onSoloMias,
  onNueva,
  ref,
}: {
  busqueda: string
  onBusqueda: (v: string) => void
  filtro: Circunstancia | "todas"
  onFiltro: (v: Circunstancia | "todas") => void
  conteos: Map<Circunstancia, number>
  total: number
  soloMias: boolean
  onSoloMias: (v: boolean) => void
  onNueva: () => void
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
            placeholder="Buscar en el título, el texto o el autor…"
            aria-label="Buscar plantillas"
            className="pl-9"
          />
        </div>

        <button
          type="button"
          onClick={() => onSoloMias(!soloMias)}
          aria-pressed={soloMias}
          className={cn(
            "h-9 shrink-0 rounded-lg border px-3 text-[12.5px] font-medium transition-colors",
            soloMias
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-line-strong bg-surface text-ink-secondary hover:bg-surface-subtle hover:text-ink"
          )}
        >
          Solo mías
        </button>

        <Button onClick={onNueva} className="shrink-0">
          <Plus />
          Nueva plantilla
        </Button>
      </div>

      {/* Los conteos son parte del filtro, no decoración: un rótulo sin número
          obliga a probarlo para descubrir que no hay nada de eso todavía. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip activo={filtro === "todas"} onClick={() => onFiltro("todas")} conteo={total}>
          Todas
        </Chip>
        {CIRCUNSTANCIAS.map((c) => {
          const conteo = conteos.get(c) ?? 0
          if (conteo === 0 && filtro !== c) return null
          return (
            <Chip
              key={c}
              activo={filtro === c}
              onClick={() => onFiltro(filtro === c ? "todas" : c)}
              conteo={conteo}
              title={CIRCUNSTANCIA_PISTA[c]}
            >
              {CIRCUNSTANCIA_LABEL[c]}
            </Chip>
          )
        })}
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

/* ── Lista ────────────────────────────────────────────────────────────────── */

function Lista({
  grupos,
  seleccionId,
  yo,
  hayFiltro,
  onLimpiar,
  onSeleccionar,
}: {
  grupos: { circunstancia: Circunstancia; items: MensajePlantilla[] }[]
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
          title="Ninguna coincide"
          description="Probá con una palabra del texto del mensaje en vez del título."
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
      aria-label="Plantillas"
      className="lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-124px)] lg:overflow-y-auto lg:pr-1"
    >
      <div className="space-y-5">
        {grupos.map((g) => (
          <section key={g.circunstancia}>
            <h2 className="eyebrow mb-2 flex items-baseline gap-2 px-1">
              {CIRCUNSTANCIA_LABEL[g.circunstancia]}
              <span className="num text-[10px] font-semibold text-ink-faint">
                {g.items.length}
              </span>
            </h2>
            <ul className="space-y-1.5">
              {g.items.map((m) => (
                <li key={m.id}>
                  <FilaMensaje
                    mensaje={m}
                    activa={m.id === seleccionId}
                    mia={m.autorId !== null && m.autorId === yo.id}
                    onClick={() => onSeleccionar(m.id)}
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

function FilaMensaje({
  mensaje,
  activa,
  mia,
  onClick,
}: {
  mensaje: MensajePlantilla
  activa: boolean
  mia: boolean
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
          <CanalIcono canal={mensaje.canal} className="h-[13px] w-[13px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] font-semibold tracking-[-0.01em]",
              activa ? "text-brand-800" : "text-ink"
            )}
          >
            {mensaje.titulo}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.55] text-ink-muted">
            {resumenDe(mensaje.cuerpo, 90)}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <Avatar nombre={mensaje.autorNombre} mia={mia} />
            <span className="truncate text-[11px] text-ink-subtle">
              {mia ? "Vos" : mensaje.autorNombre}
            </span>
            {mensaje.usos > 0 && (
              <span className="num ml-auto shrink-0 text-[10.5px] text-ink-faint">
                {mensaje.usos} {mensaje.usos === 1 ? "uso" : "usos"}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function Avatar({ nombre, mia }: { nombre: string; mia: boolean }) {
  return (
    <span
      aria-hidden
      title={nombre}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[8.5px] font-bold leading-none",
        mia
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
  mensaje,
  yo,
  onCerrar,
  onCopiar,
  onEditar,
  onBorrar,
}: {
  mensaje: MensajePlantilla | null
  yo: Yo
  onCerrar: () => void
  onCopiar: (m: MensajePlantilla, texto: string, que: string) => void
  onEditar: (m: MensajePlantilla) => void
  onBorrar: (m: MensajePlantilla) => void
}) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const id = mensaje?.id ?? null

  // Los huecos completados son de esta plantilla y de ninguna otra: al cambiar
  // de mensaje se vacían, o el "{{nombre}}" del cliente anterior se colaría en
  // el siguiente sin que se vea.
  useEffect(() => {
    setValores({})
    setConfirmando(false)
    setCopiado(false)
  }, [id])

  const variables = useMemo(
    () => (mensaje ? variablesDe(mensaje.cuerpo, mensaje.asunto) : []),
    [mensaje]
  )

  if (!mensaje) {
    return (
      <div className="panel hidden lg:block">
        <EmptyState
          icon={MessageSquareQuote}
          title="Elegí una plantilla"
          description="Se abre acá, entera y lista para copiar. Los huecos entre llaves se completan antes de copiar."
        />
      </div>
    )
  }

  const mia = mensaje.autorId !== null && mensaje.autorId === yo.id
  const cuerpoFinal = aplicarVariables(mensaje.cuerpo, valores)
  const asuntoFinal = mensaje.asunto ? aplicarVariables(mensaje.asunto, valores) : null
  const completadas = variables.filter((v) => valores[v]?.trim()).length

  function copiarCuerpo() {
    if (!mensaje) return
    onCopiar(mensaje, cuerpoFinal, "Mensaje")
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1600)
  }

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
      <div className="panel mx-auto max-w-3xl lg:max-w-none">
        {/* Cabecera */}
        <header className="border-b border-line px-5 py-4 sm:px-6 sm:py-5">
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
                {CIRCUNSTANCIA_LABEL[mensaje.circunstancia]}
                <span className="h-2.5 w-px bg-line-strong" />
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-ink-muted">
                  <CanalIcono canal={mensaje.canal} className="h-3 w-3" />
                  {CANAL_LABEL[mensaje.canal]}
                </span>
              </p>
              <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-ink">
                {mensaje.titulo}
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

          {mensaje.cuandoUsar && (
            <p className="mt-3 border-l-2 border-brand-200 pl-3 text-[12.5px] italic leading-[1.65] text-ink-secondary">
              {mensaje.cuandoUsar}
            </p>
          )}

          {mensaje.etiquetas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {mensaje.etiquetas.map((e) => (
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

        {/* Huecos a completar */}
        {variables.length > 0 && (
          <section className="border-b border-line bg-surface-subtle px-5 py-4 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">
                Completar antes de copiar
                <span className="num ml-2 font-semibold text-ink-faint">
                  {completadas}/{variables.length}
                </span>
              </p>
              {completadas > 0 && (
                <button
                  type="button"
                  onClick={() => setValores({})}
                  className="text-[11.5px] font-medium text-ink-muted transition-colors hover:text-ink"
                >
                  Vaciar
                </button>
              )}
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {variables.map((v) => (
                <label key={v} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-ink-muted">
                    {rotuloDeVariable(v)}
                  </span>
                  <Input
                    value={valores[v] ?? ""}
                    onChange={(e) => setValores((prev) => ({ ...prev, [v]: e.target.value }))}
                    placeholder={`{{${v}}}`}
                    className="h-8 text-[12.5px]"
                  />
                </label>
              ))}
            </div>

            <p className="mt-2.5 text-[11px] leading-relaxed text-ink-muted">
              Lo que dejes vacío se copia con las llaves puestas, a propósito: un hueco
              visible se corrige antes de mandar; uno borrado, no.
            </p>
          </section>
        )}

        {/* El mensaje */}
        <div className="px-5 py-5 sm:px-6">
          {asuntoFinal !== null && (
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-line bg-surface-subtle px-3.5 py-2.5">
              <span className="eyebrow">Asunto</span>
              <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                <Resaltado texto={mensaje.asunto ?? ""} valores={valores} />
              </span>
            </div>
          )}

          {/* Medida corta a propósito: un mensaje de WhatsApp leído en líneas de
              120 caracteres no se parece en nada a como lo va a ver el cliente. */}
          <div className="max-w-[64ch] whitespace-pre-wrap text-[13.5px] leading-[1.75] text-ink-secondary">
            <Resaltado texto={mensaje.cuerpo} valores={valores} />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <Button onClick={copiarCuerpo}>
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar mensaje"}
          </Button>

          {asuntoFinal && (
            <Button
              variant="outline"
              onClick={() => onCopiar(mensaje, asuntoFinal, "Asunto")}
            >
              <Copy />
              Asunto
            </Button>
          )}

          <span className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEditar(mensaje)}>
              <Pencil />
              Editar
            </Button>

            {confirmando ? (
              <span className="flex items-center gap-1.5">
                <Button variant="destructive" size="sm" onClick={() => onBorrar(mensaje)}>
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
                aria-label="Borrar plantilla"
              >
                <Trash2 />
              </Button>
            )}
          </span>
        </div>

        {/* Firma */}
        <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-5 py-3 text-[11.5px] text-ink-muted sm:px-6">
          <Avatar nombre={mensaje.autorNombre} mia={mia} />
          <span>
            Escrita por{" "}
            <span className="font-medium text-ink-secondary">
              {mia ? "vos" : mensaje.autorNombre}
            </span>{" "}
            el {fechaDeMensaje(mensaje.createdAt)}
          </span>
          {mensaje.editorNombre && (
            <span className="text-ink-faint">
              · editada por {mensaje.editorNombre} el {fechaDeMensaje(mensaje.updatedAt)}
            </span>
          )}
          {mensaje.usos > 0 && (
            <span className="num ml-auto text-ink-faint">
              copiada {mensaje.usos} {mensaje.usos === 1 ? "vez" : "veces"}
            </span>
          )}
        </footer>
      </div>
    </article>
  )
}

/**
 * El texto con los huecos pintados.
 *
 * Los que todavía están vacíos van como chip de marca —se ven de lejos, que es
 * el punto—; los completados van con el valor en tinta plena y un subrayado
 * punteado, para que se note que ahí hubo un reemplazo sin que el mensaje se
 * lea como un formulario.
 */
function Resaltado({
  texto,
  valores,
}: {
  texto: string
  valores: Record<string, string>
}) {
  return (
    <>
      {partirPorVariables(texto).map((t, i) => {
        if (t.tipo === "texto") return <span key={i}>{t.valor}</span>

        const valor = valores[t.valor]?.trim()
        if (valor) {
          return (
            <span
              key={i}
              title={rotuloDeVariable(t.valor)}
              className="font-medium text-ink underline decoration-brand-300 decoration-dotted underline-offset-[3px]"
            >
              {valor}
            </span>
          )
        }

        return (
          <span
            key={i}
            className="rounded border border-brand-200 bg-brand-50 px-1 py-px font-mono text-[11.5px] text-brand-700"
          >
            {t.valor}
          </span>
        )
      })}
    </>
  )
}
