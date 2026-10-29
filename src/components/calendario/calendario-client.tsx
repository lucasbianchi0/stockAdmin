"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cog,
  Plus,
  User,
  Users,
  XCircle,
} from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Segmentado } from "@/components/calendario/controles"
import { EntradaDialog } from "@/components/calendario/entrada-dialog"
import { claveDe, pedirJson } from "@/lib/admin/query"
import {
  DIAS_CORTOS,
  EJECUTOR_LABEL,
  ESTADO_LABEL,
  MESES,
  ORDEN_SEMANA,
  TIPOS,
  TIPO_COLOR,
  TIPO_LABEL,
  ahoraArgentina,
  describirCorrida,
  describirRepeticion,
  estadoDeOcurrencia,
  fechaCorta,
  hoyArgentina,
  indexarCorridas,
  lunesDe,
  ocurrenciasDelRango,
  proxima,
  sumarDias,
  type Corrida,
  type Entrada,
  type EstadoOcurrencia,
  type Ocurrencia,
  type Tipo,
  type Usuario,
  type Yo,
} from "@/lib/calendario-equipo"
import { cn } from "@/lib/utils"

type Datos = { entradas?: Entrada[]; corridas?: Corrida[]; usuarios?: Usuario[]; yo?: Yo }
type Vista = "semana" | "quincena" | "mes"

/** De la más cercana a la más lejana. Cuantos menos días, más grande se ve
 *  cada uno: la semana es para leer el detalle, el mes para ver la forma. */
const VISTAS: { id: Vista; rotulo: string }[] = [
  { id: "semana", rotulo: "Semana" },
  { id: "quincena", rotulo: "15 días" },
  { id: "mes", rotulo: "Mes" },
]

const SIN_ENTRADAS: Entrada[] = []
const SIN_CORRIDAS: Corrida[] = []
const SIN_USUARIOS: Usuario[] = []
const YO_POR_DEFECTO: Yo = { id: null, nombre: "vos" }
const TODOS = "todos"

const ICONO_TIPO: Record<Tipo, typeof User> = { persona: User, agente: Bot, proceso: Cog }

/** Las dos grillas por días: el mes, compacto, y la quincena, con celdas del
 *  doble de alto y letra más grande. */
const TAMANO = {
  mes: { celda: "min-h-[118px]", porCelda: 4, chip: "px-1.5 py-[3px] text-[11px]", numero: "h-6 min-w-6 text-[12px]" },
  quincena: { celda: "min-h-[210px]", porCelda: 8, chip: "px-2 py-1 text-[12.5px]", numero: "h-7 min-w-7 text-[14px]" },
} as const
type Tamano = keyof typeof TAMANO

/** La quincena de un día: del 1 al 15 o del 16 a fin de mes. */
function quincenaDe(iso: string): [string, string] {
  const mes = iso.slice(0, 8)
  if (Number(iso.slice(8)) <= 15) return [`${mes}01`, `${mes}15`]
  const fin = sumarDias(`${sumarDias(`${mes}28`, 4).slice(0, 8)}01`, -1)
  return [`${mes}16`, fin]
}

/**
 * El calendario.
 *
 * Se pide todo de una y se despliega en memoria, como en la ticketera: son
 * decenas de entradas, y cambiar de capa o de persona no tiene por qué volver
 * a tocar el servidor. Lo único que viaja al moverse de mes es el rango de
 * corridas.
 *
 * El filtro por persona recorta sólo lo de las personas: "mi calendario" es lo
 * mío más lo que corren las máquinas, que es justo lo que hay que tener a la
 * vista para saber si el informe que tengo que leer el lunes va a estar.
 */
export function CalendarioClient() {
  const hoy = hoyArgentina()
  const [vista, setVista] = useState<Vista>("mes")
  const [cursor, setCursor] = useState(hoy)
  const [capas, setCapas] = useState<Record<Tipo, boolean>>({ persona: true, agente: true, proceso: true })
  const [persona, setPersona] = useState<string>(TODOS)

  const [dialogo, setDialogo] = useState<{ entrada: Entrada | null; fecha: string; tipo: Tipo } | null>(null)

  // El rango visible. El mes arranca el lunes de su primera semana y son
  // siempre seis filas, para que la grilla no salte de alto entre meses. La
  // quincena completa sus semanas de lunes a domingo, con los días de afuera
  // apagados, igual que el mes.
  const [desde, hasta] = useMemo(() => {
    if (vista === "semana") {
      const l = lunesDe(cursor)
      return [l, sumarDias(l, 6)]
    }
    if (vista === "quincena") {
      const [i, f] = quincenaDe(cursor)
      return [lunesDe(i), sumarDias(lunesDe(f), 6)]
    }
    const l = lunesDe(`${cursor.slice(0, 8)}01`)
    return [l, sumarDias(l, 41)]
  }, [vista, cursor])

  const [inicioQuincena, finQuincena] = quincenaDe(cursor)

  const url = `/api/calendario?desde=${desde}&hasta=${hasta}`
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: claveDe("calendario", url),
    queryFn: ({ signal }) => pedirJson<Datos>(url, { signal }),
    // Al moverse de mes, la grilla anterior queda hasta que llega la nueva.
    placeholderData: (prev) => prev,
  })
  const refrescar = useCallback(() => qc.invalidateQueries({ queryKey: ["calendario"] }), [qc])

  const entradas = query.data?.entradas ?? SIN_ENTRADAS
  const corridas = query.data?.corridas ?? SIN_CORRIDAS
  const usuarios = query.data?.usuarios ?? SIN_USUARIOS
  const yo = query.data?.yo ?? YO_POR_DEFECTO

  const visibles = useMemo(
    () =>
      entradas.filter(
        (e) =>
          capas[e.tipo] &&
          (e.tipo !== "persona" || persona === TODOS || e.personas.some((p) => p.id === persona))
      ),
    [entradas, capas, persona]
  )

  const porDia = useMemo(() => {
    const mapa = new Map<string, Ocurrencia[]>()
    for (const o of ocurrenciasDelRango(visibles, desde, hasta)) {
      const lista = mapa.get(o.fecha)
      if (lista) lista.push(o)
      else mapa.set(o.fecha, [o])
    }
    return mapa
  }, [visibles, desde, hasta])

  const corridasIdx = useMemo(() => indexarCorridas(corridas), [corridas])
  const ahora = ahoraArgentina()
  const estadoDe = (o: Ocurrencia): EstadoOcurrencia =>
    estadoDeOcurrencia(o.entrada, o.fecha, corridasIdx.get(`${o.entrada.clave}|${o.fecha}`) ?? [], ahora)

  const maquinas = useMemo(() => entradas.filter((e) => e.tipo !== "persona"), [entradas])

  function mover(paso: number) {
    if (vista === "semana") setCursor((c) => sumarDias(c, 7 * paso))
    // Un día antes del inicio es la quincena anterior; uno después del fin, la
    // siguiente.
    else if (vista === "quincena") setCursor(paso < 0 ? sumarDias(inicioQuincena, -1) : sumarDias(finQuincena, 1))
    else {
      const [a, m] = cursor.split("-").map(Number)
      const d = new Date(Date.UTC(a, m - 1 + paso, 1))
      setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`)
    }
  }

  const titulo =
    vista === "mes"
      ? `${MESES[Number(cursor.slice(5, 7)) - 1]} ${cursor.slice(0, 4)}`
      : vista === "quincena"
        ? `${Number(inicioQuincena.slice(8))} al ${fechaCorta(finQuincena)} ${cursor.slice(0, 4)}`
        : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`

  if (query.isLoading) return <LoadingState />
  if (query.isError && !query.data) {
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      {/* Navegación */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => mover(-1)} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(hoy)}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => mover(1)} aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className={cn("text-[17px] font-semibold tracking-[-0.015em] text-ink", vista === "mes" && "capitalize")}>
          {titulo}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          <Segmentado
            opciones={VISTAS.map((v) => ({ valor: v.id, rotulo: v.rotulo }))}
            valor={vista}
            onCambio={setVista}
          />
          <Button size="sm" onClick={() => setDialogo({ entrada: null, fecha: hoy, tipo: "persona" })}>
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </Button>
        </div>
      </div>

      {/* Capas y personas */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIPOS.map((t) => {
            const Icono = ICONO_TIPO[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => setCapas((c) => ({ ...c, [t]: !c[t] }))}
                aria-pressed={capas[t]}
                title={capas[t] ? `Ocultar ${TIPO_LABEL[t].toLowerCase()}` : `Mostrar ${TIPO_LABEL[t].toLowerCase()}`}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                  capas[t]
                    ? cn(TIPO_COLOR[t].chip, TIPO_COLOR[t].anillo)
                    : "border-dashed border-line-strong bg-surface text-ink-faint hover:text-ink-muted"
                )}
              >
                {capas[t] ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Icono className="h-3.5 w-3.5" />}
                {TIPO_LABEL[t]}
              </button>
            )
          })}
        </div>

        <span className="hidden h-5 w-px bg-line sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-ink-muted" />
          <button
            type="button"
            onClick={() => setPersona(TODOS)}
            aria-pressed={persona === TODOS}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
              persona === TODOS
                ? "border-brand-600 bg-brand-600 text-white shadow-e1"
                : "border-line-strong bg-surface text-ink-secondary hover:border-n-400 hover:text-ink"
            )}
          >
            Todo el equipo
          </button>
          {usuarios.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setPersona(persona === u.id ? TODOS : u.id)}
              aria-pressed={persona === u.id}
              title={u.id === yo.id ? `${u.nombre} (vos)` : u.nombre}
              className={cn(
                "rounded-full transition-transform duration-150 hover:-translate-y-0.5",
                persona === u.id
                  ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface"
                  : "ring-1 ring-transparent hover:ring-line-strong"
              )}
            >
              <Avatar id={u.id} nombre={u.nombre} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {/* En la semana la grilla se queda con todo el ancho y el panel baja:
          son siete días y cada uno tiene que leerse entero. */}
      <div className={cn("grid gap-4", vista !== "semana" && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
        {vista !== "semana" ? (
          <GrillaDias
            desde={desde}
            hasta={hasta}
            enRango={(f) =>
              vista === "mes" ? f.slice(0, 7) === cursor.slice(0, 7) : f >= inicioQuincena && f <= finQuincena
            }
            tamano={vista}
            hoy={hoy}
            porDia={porDia}
            estadoDe={estadoDe}
            onAbrir={(e) => setDialogo({ entrada: e, fecha: e.fecha, tipo: e.tipo })}
            onNueva={(fecha) => setDialogo({ entrada: null, fecha, tipo: "persona" })}
          />
        ) : (
          <GrillaSemana
            desde={desde}
            hoy={hoy}
            porDia={porDia}
            estadoDe={estadoDe}
            onAbrir={(e) => setDialogo({ entrada: e, fecha: e.fecha, tipo: e.tipo })}
            onNueva={(fecha) => setDialogo({ entrada: null, fecha, tipo: "persona" })}
          />
        )}

        <PanelMaquinas
          maquinas={maquinas}
          corridas={corridas}
          ahora={ahora}
          ancho={vista === "semana"}
          onAbrir={(e) => setDialogo({ entrada: e, fecha: e.fecha, tipo: e.tipo })}
          onNueva={() => setDialogo({ entrada: null, fecha: hoy, tipo: "agente" })}
        />
      </div>

      <EntradaDialog
        abierto={dialogo !== null}
        entrada={dialogo?.entrada ?? null}
        fechaInicial={dialogo?.fecha ?? hoy}
        tipoInicial={dialogo?.tipo ?? "persona"}
        usuarios={usuarios}
        yo={yo}
        corridas={corridas}
        onCerrar={() => setDialogo(null)}
        onCambio={() => {
          setDialogo(null)
          void refrescar()
        }}
      />
    </div>
  )
}

/* ── Mes y quincena ───────────────────────────────────────────────────────── */

function GrillaDias({
  desde,
  hasta,
  enRango,
  tamano,
  hoy,
  porDia,
  estadoDe,
  onAbrir,
  onNueva,
}: {
  desde: string
  hasta: string
  /** Los días del mes o de la quincena; el resto completa la semana, apagado. */
  enRango: (fecha: string) => boolean
  tamano: Tamano
  hoy: string
  porDia: Map<string, Ocurrencia[]>
  estadoDe: (o: Ocurrencia) => EstadoOcurrencia
  onAbrir: (e: Entrada) => void
  onNueva: (fecha: string) => void
}) {
  const dias: string[] = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f)
  const t = TAMANO[tamano]
  const POR_CELDA = t.porCelda
  const [expandido, setExpandido] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="grid grid-cols-7 border-b border-line bg-surface-subtle">
        {ORDEN_SEMANA.map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
            {DIAS_CORTOS[d]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((f, i) => {
          const lista = porDia.get(f) ?? []
          const abierto = expandido === f
          const mostradas = abierto ? lista : lista.slice(0, POR_CELDA)
          return (
            <div
              key={f}
              onClick={(ev) => {
                // Sólo el fondo de la celda crea: una tarjeta abre lo suyo.
                if (ev.target === ev.currentTarget) onNueva(f)
              }}
              className={cn(
                "group cursor-pointer border-line p-1.5 transition-colors hover:bg-surface-subtle/60",
                t.celda,
                i % 7 !== 6 && "border-r",
                i < dias.length - 7 && "border-b",
                !enRango(f) && "bg-surface-subtle/50"
              )}
            >
              <div className="pointer-events-none mb-1 flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-1 tabular-nums",
                    t.numero,
                    f === hoy
                      ? "bg-brand-600 font-semibold text-white"
                      : enRango(f)
                        ? "text-ink-secondary"
                        : "text-ink-faint"
                  )}
                >
                  {Number(f.slice(8))}
                </span>
                <Plus className="h-3.5 w-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className={tamano === "quincena" ? "space-y-1" : "space-y-0.5"}>
                {mostradas.map((o) => (
                  <Chip
                    key={`${o.entrada.id}-${f}`}
                    o={o}
                    estado={estadoDe(o)}
                    tamano={tamano}
                    onClick={() => onAbrir(o.entrada)}
                  />
                ))}
                {lista.length > POR_CELDA && (
                  <button
                    type="button"
                    onClick={() => setExpandido(abierto ? null : f)}
                    className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
                  >
                    {abierto ? "Ver menos" : `+${lista.length - POR_CELDA} más`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Una ocurrencia en la celda del mes o la quincena: hora, título y cómo salió. */
function Chip({
  o,
  estado,
  tamano,
  onClick,
}: {
  o: Ocurrencia
  estado: EstadoOcurrencia
  tamano: Tamano
  onClick: () => void
}) {
  const e = o.entrada
  const reservado = e.estado !== "activo"
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${e.titulo}${reservado ? ` · ${ESTADO_LABEL[e.estado]}` : ""}`}
      className={cn(
        "flex w-full items-start gap-1 rounded-md border-l-[3px] text-left leading-tight transition-colors",
        TAMANO[tamano].chip,
        TIPO_COLOR[e.tipo].chip,
        TIPO_COLOR[e.tipo].borde,
        reservado && "border-dashed opacity-60"
      )}
    >
      {e.hora && <span className="shrink-0 tabular-nums opacity-70">{e.hora}</span>}
      {/* En la quincena hay lugar para dos renglones: el título entero vale
          más que una celda pareja. */}
      <span className={cn("min-w-0 flex-1 font-medium", tamano === "quincena" ? "line-clamp-2" : "truncate")}>
        {e.titulo}
      </span>
      <IconoEstado estado={estado} className={tamano === "quincena" ? "h-3.5 w-3.5" : undefined} />
    </button>
  )
}

function IconoEstado({ estado, className }: { estado: EstadoOcurrencia; className?: string }) {
  const c = cn("h-3 w-3 shrink-0", className)
  if (estado === "ok") return <CheckCircle2 className={cn(c, "text-success")} aria-label="Corrió bien" />
  if (estado === "fallo") return <XCircle className={cn(c, "text-danger")} aria-label="Falló" />
  if (estado === "falta") return <AlertTriangle className={cn(c, "text-warning")} aria-label="No corrió" />
  return null
}

const ESTADO_TEXTO: Record<EstadoOcurrencia, string | null> = {
  ok: "Corrió bien",
  fallo: "Falló",
  falta: "No corrió",
  pendiente: null,
  "sin-dato": null,
}

/* ── Semana ───────────────────────────────────────────────────────────────── */

function GrillaSemana({
  desde,
  hoy,
  porDia,
  estadoDe,
  onAbrir,
  onNueva,
}: {
  desde: string
  hoy: string
  porDia: Map<string, Ocurrencia[]>
  estadoDe: (o: Ocurrencia) => EstadoOcurrencia
  onAbrir: (e: Entrada) => void
  onNueva: (fecha: string) => void
}) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i))
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {dias.map((f, i) => {
        const lista = porDia.get(f) ?? []
        return (
          <div
            key={f}
            className={cn(
              "flex min-h-[460px] flex-col rounded-xl border bg-surface shadow-e1",
              f === hoy ? "border-brand-300" : "border-line"
            )}
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[14px] font-semibold text-ink">
                {DIAS_CORTOS[ORDEN_SEMANA[i]]}{" "}
                <span className={cn("tabular-nums", f === hoy ? "text-brand-600" : "text-ink-muted")}>
                  {Number(f.slice(8))}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onNueva(f)}
                aria-label={`Nueva el ${fechaCorta(f)}`}
                className="rounded p-0.5 text-ink-faint hover:bg-surface-muted hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 space-y-1.5 p-2">
              {lista.length === 0 && <p className="px-1 pt-1 text-[11.5px] text-ink-faint">Nada</p>}
              {lista.map((o) => {
                const e = o.entrada
                const estado = estadoDe(o)
                const texto = ESTADO_TEXTO[estado]
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onAbrir(e)}
                    className={cn(
                      "w-full rounded-lg border-l-[3px] px-2.5 py-2 text-left transition-colors",
                      TIPO_COLOR[e.tipo].chip,
                      TIPO_COLOR[e.tipo].borde,
                      e.estado !== "activo" && "border-dashed opacity-60"
                    )}
                  >
                    <span className="block text-[12px] tabular-nums opacity-70">
                      {e.hora ?? "Todo el día"}
                      {e.estado !== "activo" && ` · ${ESTADO_LABEL[e.estado]}`}
                    </span>
                    <span className="block text-[14px] font-medium leading-snug">{e.titulo}</span>
                    {(texto || e.personas.length > 0) && (
                      <span className="mt-1 flex items-center gap-1.5">
                        {texto && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium">
                            <IconoEstado estado={estado} />
                            {texto}
                          </span>
                        )}
                        <span className="ml-auto flex -space-x-1">
                          {e.personas.slice(0, 3).map((p) => (
                            <Avatar key={p.id} id={p.id} nombre={p.nombre} size="sm" className="ring-1 ring-surface" />
                          ))}
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Panel de agentes y procesos ──────────────────────────────────────────── */

/**
 * Las máquinas de un vistazo: qué hay, cada cuánto corre, cuándo le toca y
 * cómo salió la última vez. Va aparte de la grilla porque es la pregunta que
 * se hace sin importar qué semana se esté mirando — y porque las continuas no
 * se dibujan en la grilla y éste es su único lugar.
 */
function PanelMaquinas({
  maquinas,
  corridas,
  ahora,
  ancho,
  onAbrir,
  onNueva,
}: {
  maquinas: Entrada[]
  corridas: Corrida[]
  ahora: [string, string]
  /** Abajo de la semana, a todo el ancho: en columnas, no una lista estirada. */
  ancho: boolean
  onAbrir: (e: Entrada) => void
  onNueva: () => void
}) {
  // Las corridas vienen de la más nueva a la más vieja.
  const ultima = new Map<string, Corrida>()
  for (const c of corridas) if (!ultima.has(c.clave)) ultima.set(c.clave, c)

  const orden = { activo: 0, planificado: 1, pausado: 2 }
  const lista = [...maquinas].sort(
    (a, b) => orden[a.estado] - orden[b.estado] || a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo, "es")
  )

  return (
    <aside className="h-fit rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-ink">Agentes y procesos</h3>
        <button
          type="button"
          onClick={onNueva}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-muted">Todavía no hay ninguno cargado.</p>
      ) : (
        <ul className={ancho ? "grid sm:grid-cols-2 lg:grid-cols-3 [&>li]:border-b [&>li]:border-line" : "divide-y divide-line"}>
          {lista.map((e) => {
            const Icono = ICONO_TIPO[e.tipo]
            const u = e.clave ? ultima.get(e.clave) : undefined
            const prox = proxima(e, ahora)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(e)}
                  className="flex w-full gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      TIPO_COLOR[e.tipo].chip
                    )}
                  >
                    <Icono className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-ink">{e.titulo}</span>
                      {e.estado !== "activo" && (
                        <span className="shrink-0 rounded border border-dashed border-line-strong px-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-muted">
                          {ESTADO_LABEL[e.estado]}
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {describirRepeticion(e)}
                      {e.ejecutor && ` · ${EJECUTOR_LABEL[e.ejecutor]}`}
                    </span>
                    {u ? (
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[11px]",
                          u.ok ? "text-success-text" : "text-danger-text"
                        )}
                      >
                        {u.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {describirCorrida(u)}
                      </span>
                    ) : e.estado === "activo" && e.clave ? (
                      <span className="mt-1 block text-[11px] text-ink-faint">Sin corridas en las últimas dos semanas</span>
                    ) : null}
                    {prox && e.estado === "activo" && (
                      <span className="block text-[11px] text-ink-faint">
                        Próxima: {prox === ahora[0] ? "hoy" : fechaCorta(prox)}
                        {e.hora && ` · ${e.hora}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
