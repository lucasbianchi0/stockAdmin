"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  Check,
  ImageIcon,
  KanbanSquare,
  Pencil,
  Plus,
  Undo2,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/tickets/avatar"
import { EtiquetaAgente } from "@/components/tickets/etiqueta-agente"
import { TicketDialog } from "@/components/tickets/ticket-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  COLORES,
  ESTADOS_TABLERO,
  ESTADO_LABEL,
  ESTADO_PISTA,
  LIMITES,
  colorDe,
  esEstadoTablero,
  fechaDeTicket,
  resumenDe,
  type Estado,
  type EstadoTablero,
  type Proyecto,
  type Ticket,
  type Usuario,
  type Yo,
} from "@/lib/tickets"
import { cn } from "@/lib/utils"

const URL_TICKETS = "/api/tickets"
const YO_POR_DEFECTO: Yo = { id: null, nombre: "vos" }
const SIN_TICKETS: Ticket[] = []
const SIN_PROYECTOS: Proyecto[] = []
const SIN_USUARIOS: Usuario[] = []

type Tablero = {
  tickets?: Ticket[]
  proyectos?: Proyecto[]
  usuarios?: Usuario[]
  yo?: Yo
}

/** "todos" · "sin" (sin asignar / sin proyecto) · el id de alguien o de algo. */
type Filtro = string

const TODOS = "todos"
const SIN = "sin"

/**
 * El tablero.
 *
 * Tres columnas, tarjetas que se arrastran y dos agrupadores arriba: por
 * persona y por proyecto. Eso es todo, y es a propósito — la versión con
 * prioridades, etiquetas, fechas de vencimiento y estimaciones existe en veinte
 * herramientas y en ninguna se usa: lo que se usa es lo que se puede cargar en
 * veinte segundos.
 *
 * DOS DECISIONES QUE EXPLICAN EL RESTO DEL ARCHIVO
 *
 * 1. **Se pide todo una vez y se filtra en memoria.** Son decenas de tickets.
 *    Filtrar por persona o por proyecto no vuelve a tocar el servidor, así que
 *    clickear un avatar es instantáneo y se puede ir y venir entre personas sin
 *    esperar nada. El día que sean miles, lo que cambia es el GET y nada de acá.
 *
 * 2. **Soltar una tarjeta se ve antes de guardarse.** El movimiento se aplica
 *    en la caché y recién después viaja; si el servidor falla, se avisa y se
 *    vuelve a pedir el tablero. Al revés —esperar la respuesta para mover la
 *    tarjeta— el arrastre se siente roto aunque tarde 200ms.
 */
export function TableroClient() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: claveDe("tickets", URL_TICKETS),
    queryFn: ({ signal }) => pedirJson<Tablero>(URL_TICKETS, { signal }),
  })

  const tickets = query.data?.tickets ?? SIN_TICKETS
  const proyectos = query.data?.proyectos ?? SIN_PROYECTOS
  const usuarios = query.data?.usuarios ?? SIN_USUARIOS
  const yo = query.data?.yo ?? YO_POR_DEFECTO

  const [persona, setPersona] = useState<Filtro>(TODOS)
  const [proyecto, setProyecto] = useState<Filtro>(TODOS)

  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Ticket | null>(null)
  const [columnaNueva, setColumnaNueva] = useState<Estado>("backlog")

  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [destino, setDestino] = useState<{ estado: EstadoTablero; idx: number } | null>(null)

  /** Retoca la caché para que el cambio se vea ya, sin esperar a que la lista
   *  se vuelva a pedir. */
  const retocar = useCallback(
    (cambio: (lista: Ticket[]) => Ticket[]) =>
      qc.setQueryData<Tablero>(claveDe("tickets", URL_TICKETS), (prev) =>
        prev ? { ...prev, tickets: cambio(prev.tickets ?? SIN_TICKETS) } : prev
      ),
    [qc]
  )

  const refrescar = useCallback(
    () => qc.invalidateQueries({ queryKey: ["tickets"] }),
    [qc]
  )

  /* ── Columnas ───────────────────────────────────────────────────────────── */

  // El orden de cada columna se resuelve acá y no en el servidor para que un
  // movimiento optimista sea nada más que reescribir `orden`: la pantalla se
  // reordena sola.
  //
  // Los archivados no entran: no son una cuarta columna, son los que ya salieron
  // del tablero. Se los ve en la lista de abajo.
  const porEstado = useMemo(() => {
    const m: Record<EstadoTablero, Ticket[]> = { backlog: [], progreso: [], hecho: [] }
    for (const t of tickets) if (esEstadoTablero(t.estado)) m[t.estado].push(t)
    for (const e of ESTADOS_TABLERO) {
      m[e].sort((a, b) => a.orden - b.orden || b.createdAt.localeCompare(a.createdAt))
    }
    return m
  }, [tickets])

  const pasa = useCallback(
    (t: Ticket) => {
      if (persona === SIN ? t.asignadoId !== null : persona !== TODOS && t.asignadoId !== persona) {
        return false
      }
      if (proyecto === SIN ? t.proyectoId !== null : proyecto !== TODOS && t.proyectoId !== proyecto) {
        return false
      }
      return true
    },
    [persona, proyecto]
  )

  const visibles = useMemo(() => {
    const m: Record<EstadoTablero, Ticket[]> = { backlog: [], progreso: [], hecho: [] }
    for (const e of ESTADOS_TABLERO) m[e] = porEstado[e].filter(pasa)
    return m
  }, [porEstado, pasa])

  /** Los archivados, del último al primero. Respetan los filtros de arriba: si
   *  estás mirando lo de una persona, el archivo también es el de ella. */
  const archivados = useMemo(
    () =>
      tickets
        .filter((t) => t.estado === "archivado" && pasa(t))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tickets, pasa]
  )

  /** Lo que tiene cada uno en la mano. Los terminados no cuentan: el número al
   *  lado del avatar es carga de trabajo, no historial. */
  const pendientesPorPersona = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tickets) {
      if (t.estado === "hecho" || t.estado === "archivado") continue
      const clave = t.asignadoId ?? SIN
      m.set(clave, (m.get(clave) ?? 0) + 1)
    }
    return m
  }, [tickets])

  /* ── Arrastre ───────────────────────────────────────────────────────────── */

  /**
   * Dónde caería la tarjeta: cuántas de las que están en pantalla quedan por
   * encima del cursor. Se cuentan todas, incluida la que se está arrastrando
   * —que sigue dibujada, en gris—, así el número coincide con la raya que se
   * muestra entre las tarjetas.
   */
  function indiceEn(cont: HTMLElement, y: number): number {
    let i = 0
    for (const c of cont.querySelectorAll<HTMLElement>("[data-card]")) {
      const r = c.getBoundingClientRect()
      if (y > r.top + r.height / 2) i++
    }
    return i
  }

  async function soltar(estadoDestino: EstadoTablero, idxVisible: number) {
    const id = arrastrando
    setArrastrando(null)
    setDestino(null)
    if (!id) return

    const movido = tickets.find((t) => t.id === id)
    if (!movido) return

    const completa = porEstado[estadoDestino]
    const alaVista = visibles[estadoDestino]

    // El índice de la pantalla es sobre lo que se ve; la posición que se guarda
    // es sobre la columna entera. Sin esta traducción, mover una tarjeta con un
    // filtro puesto reordenaría a ciegas las que están escondidas.
    let idx =
      idxVisible >= alaVista.length
        ? completa.length
        : completa.findIndex((t) => t.id === alaVista[idxVisible].id)

    const actual = completa.findIndex((t) => t.id === id)
    if (actual !== -1 && actual < idx) idx--

    const nuevaDestino = completa.filter((t) => t.id !== id)
    nuevaDestino.splice(idx, 0, movido)

    const cambioDeColumna = movido.estado !== estadoDestino
    const nuevaOrigen =
      cambioDeColumna && esEstadoTablero(movido.estado)
        ? porEstado[movido.estado].filter((t) => t.id !== id)
        : null

    // Nada se movió: ni se toca la caché ni se llama al servidor.
    if (!cambioDeColumna && nuevaDestino.every((t, i) => t.id === completa[i]?.id)) return

    const posicion = new Map<string, number>()
    nuevaDestino.forEach((t, i) => posicion.set(t.id, i))
    nuevaOrigen?.forEach((t, i) => posicion.set(t.id, i))

    retocar((lista) =>
      lista.map((t) => {
        const orden = posicion.get(t.id)
        if (orden === undefined) return t
        return {
          ...t,
          orden,
          estado: t.id === id ? estadoDestino : t.estado,
        }
      })
    )

    try {
      await Promise.all([
        mover(estadoDestino, nuevaDestino.map((t) => t.id)),
        nuevaOrigen ? mover(movido.estado as EstadoTablero, nuevaOrigen.map((t) => t.id)) : null,
      ])
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo mover el ticket"))
      void refrescar()
    }
  }

  /* ── Alta y edición ─────────────────────────────────────────────────────── */

  function abrirNuevo(estado: Estado) {
    setEditando(null)
    setColumnaNueva(estado)
    setAbierto(true)
  }

  function abrirTicket(t: Ticket) {
    setEditando(t)
    setAbierto(true)
  }

  function guardado(t: Ticket, esNuevo: boolean) {
    retocar((lista) => (esNuevo ? [t, ...lista] : lista.map((x) => (x.id === t.id ? t : x))))
    setAbierto(false)
    toast.success(esNuevo ? "Ticket creado" : "Ticket actualizado")
    // El alta trae el `orden` calculado en el servidor y una edición puede
    // haber cambiado de columna: se vuelve a pedir por detrás para que el
    // tablero coincida con la base sin parpadear.
    void refrescar()
  }

  /**
   * Borrar, sin esperar al servidor.
   *
   * La tarjeta desaparece y el diálogo se cierra en el mismo cuadro; el pedido
   * viaja por detrás. Si vuelve mal, el ticket se repone donde estaba —el
   * objeto entero sigue en memoria, con su `orden`, así que vuelve a su
   * posición y no al final— y el aviso dice qué pasó.
   */
  async function borrado(t: Ticket) {
    retocar((lista) => lista.filter((x) => x.id !== t.id))
    setAbierto(false)

    try {
      const r = await fetch(`/api/tickets/${t.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo borrar")
      toast.success("Ticket eliminado")
    } catch (e) {
      retocar((lista) => (lista.some((x) => x.id === t.id) ? lista : [...lista, t]))
      toast.error(mensajeError(e, "No se pudo borrar el ticket"))
    }
  }

  /**
   * Archivar y desarchivar, que son el mismo gesto en dos direcciones.
   *
   * Es un PATCH normal de estado: el servidor lo reubica arriba de la columna
   * de destino, igual que si se hubiera arrastrado. La tarjeta se mueve en la
   * pantalla antes de que conteste —un click que tarda 200ms en verse se siente
   * roto— y si falla, se avisa y se vuelve a pedir el tablero.
   */
  async function cambiarEstado(t: Ticket, estado: Estado) {
    retocar((lista) => lista.map((x) => (x.id === t.id ? { ...x, estado } : x)))

    try {
      const r = await fetch(`/api/tickets/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ estado }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo mover")
      retocar((lista) => lista.map((x) => (x.id === t.id ? (d.ticket as Ticket) : x)))
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo mover el ticket"))
      void refrescar()
    }
  }

  function proyectoCreado(p: Proyecto) {
    qc.setQueryData<Tablero>(claveDe("tickets", URL_TICKETS), (prev) =>
      prev
        ? {
            ...prev,
            proyectos: [...(prev.proyectos ?? SIN_PROYECTOS), p].sort((a, b) =>
              a.nombre.localeCompare(b.nombre, "es")
            ),
          }
        : prev
    )
    setProyecto(p.id)
  }

  function proyectoEditado(p: Proyecto) {
    qc.setQueryData<Tablero>(claveDe("tickets", URL_TICKETS), (prev) =>
      prev
        ? {
            ...prev,
            proyectos: (prev.proyectos ?? SIN_PROYECTOS)
              .map((x) => (x.id === p.id ? p : x))
              .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
          }
        : prev
    )
  }

  function proyectoBorrado(id: string) {
    qc.setQueryData<Tablero>(claveDe("tickets", URL_TICKETS), (prev) =>
      prev
        ? {
            ...prev,
            proyectos: (prev.proyectos ?? SIN_PROYECTOS).filter((p) => p.id !== id),
            // Los tickets no se borran: quedan sueltos.
            tickets: (prev.tickets ?? SIN_TICKETS).map((t) =>
              t.proyectoId === id ? { ...t, proyectoId: null } : t
            ),
          }
        : prev
    )
    if (proyecto === id) setProyecto(TODOS)
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (query.isPending) return <LoadingState label="Cargando el tablero…" />
  if (query.isError) {
    return (
      <ErrorState
        message={mensajeError(query.error, "No se pudo cargar el tablero")}
        onRetry={() => query.refetch()}
      />
    )
  }

  const personaElegida = usuarios.find((u) => u.id === persona) ?? null
  const hayFiltro = persona !== TODOS || proyecto !== TODOS

  return (
    <div className="space-y-5">
      <Filtros
        usuarios={usuarios}
        proyectos={proyectos}
        yo={yo}
        persona={persona}
        proyecto={proyecto}
        pendientes={pendientesPorPersona}
        onPersona={setPersona}
        onProyecto={setProyecto}
        onProyectoCreado={proyectoCreado}
        onProyectoEditado={proyectoEditado}
        onProyectoBorrado={proyectoBorrado}
      />

      {hayFiltro && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
          <span>
            Viendo{" "}
            <strong className="font-semibold text-ink">
              {persona === TODOS
                ? "los tickets de todo el equipo"
                : persona === SIN
                  ? "los tickets sin asignar"
                  : `los tickets de ${personaElegida?.id === yo.id ? "vos" : (personaElegida?.nombre ?? "alguien")}`}
            </strong>
            {proyecto !== TODOS && (
              <>
                {" en "}
                <strong className="font-semibold text-ink">
                  {proyecto === SIN
                    ? "tickets sin proyecto"
                    : (proyectos.find((p) => p.id === proyecto)?.nombre ?? "un proyecto")}
                </strong>
              </>
            )}
            .
          </span>
          <button
            onClick={() => {
              setPersona(TODOS)
              setProyecto(TODOS)
            }}
            className="font-medium text-brand-600 underline-offset-2 hover:underline"
          >
            Ver todo
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {ESTADOS_TABLERO.map((estado) => (
          <Columna
            key={estado}
            estado={estado}
            tickets={visibles[estado]}
            proyectos={proyectos}
            yo={yo}
            arrastrando={arrastrando}
            destino={destino?.estado === estado ? destino.idx : null}
            onDragOver={(cont, y) => setDestino({ estado, idx: indiceEn(cont, y) })}
            onDragLeave={() => setDestino((d) => (d?.estado === estado ? null : d))}
            onSoltar={(idx) => void soltar(estado, idx)}
            onArrastrar={setArrastrando}
            onAbrir={abrirTicket}
            onArchivar={(t) => void cambiarEstado(t, "archivado")}
            onNuevo={() => abrirNuevo(estado)}
          />
        ))}
      </div>

      {archivados.length > 0 && (
        <Archivados
          tickets={archivados}
          proyectos={proyectos}
          onAbrir={abrirTicket}
          onRestaurar={(t) => void cambiarEstado(t, "hecho")}
        />
      )}

      <TicketDialog
        abierto={abierto}
        ticket={editando}
        estadoInicial={columnaNueva}
        proyectoInicial={proyecto === TODOS || proyecto === SIN ? null : proyecto}
        proyectos={proyectos}
        usuarios={usuarios}
        yo={yo}
        onCerrar={() => setAbierto(false)}
        onGuardado={guardado}
        onBorrado={(t) => void borrado(t)}
      />
    </div>
  )
}

/** Guardar el orden de una columna. El body es la columna entera ya ordenada —
 *  ver el comentario del endpoint. */
async function mover(estado: EstadoTablero, ids: string[]) {
  const r = await fetch("/api/tickets/mover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ estado, ids }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo mover")
}

/* ── Filtros ──────────────────────────────────────────────────────────────── */

/**
 * Los dos agrupadores, en una sola pieza y arriba de todo.
 *
 * Arriba y no en una barra lateral porque son la pregunta con la que uno entra
 * —"¿en qué anda Juan?", "¿cómo va firma biométrica?"— y la respuesta tiene que
 * estar a un click de la puerta.
 */
function Filtros({
  usuarios,
  proyectos,
  yo,
  persona,
  proyecto,
  pendientes,
  onPersona,
  onProyecto,
  onProyectoCreado,
  onProyectoEditado,
  onProyectoBorrado,
}: {
  usuarios: Usuario[]
  proyectos: Proyecto[]
  yo: Yo
  persona: Filtro
  proyecto: Filtro
  pendientes: Map<string, number>
  onPersona: (v: Filtro) => void
  onProyecto: (v: Filtro) => void
  onProyectoCreado: (p: Proyecto) => void
  onProyectoEditado: (p: Proyecto) => void
  onProyectoBorrado: (id: string) => void
}) {
  /** El formulario de proyecto. `null` = ninguno abierto; `id: null` = uno
   *  nuevo. Es el mismo formulario para crear y para editar porque es el mismo
   *  par de campos: dos formularios distintos para un nombre y un color se
   *  separarían al primer cambio. */
  const [form, setForm] = useState<{ id: string | null; nombre: string; color: number } | null>(
    null
  )
  const [porBorrar, setPorBorrar] = useState<Proyecto | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!form) return
    const nombre = form.nombre.trim()
    if (!nombre || guardando) return

    setGuardando(true)
    try {
      const r = await fetch(
        form.id ? `/api/tickets/proyectos/${form.id}` : "/api/tickets/proyectos",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form.id ? { nombre, color: form.color } : { nombre }),
        }
      )
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      if (form.id) onProyectoEditado(d.proyecto as Proyecto)
      else onProyectoCreado(d.proyecto as Proyecto)
      setForm(null)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar el proyecto"))
    } finally {
      setGuardando(false)
    }
  }

  /** Igual que el borrado de un ticket: diálogo propio y no `window.confirm`,
   *  que congela la página y se desactiva solo después del segundo uso. */
  async function borrar(p: Proyecto) {
    setPorBorrar(null)
    setGuardando(true)
    try {
      const r = await fetch(`/api/tickets/proyectos/${p.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo borrar")
      onProyectoBorrado(p.id)
      setForm(null)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar el proyecto"))
    } finally {
      setGuardando(false)
    }
  }

  const editando = form?.id ? (proyectos.find((p) => p.id === form.id) ?? null) : null

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      {/* Equipo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Rotulo icon={<Users className="h-3.5 w-3.5" />}>Equipo</Rotulo>

        <Pastilla activo={persona === TODOS} onClick={() => onPersona(TODOS)}>
          Todos
        </Pastilla>

        <div className="flex flex-wrap items-center gap-1.5">
          {usuarios.map((u) => (
            <BotonPersona
              key={u.id}
              id={u.id}
              nombre={u.id === yo.id ? `${u.nombre} (vos)` : u.nombre}
              activo={persona === u.id}
              pendientes={pendientes.get(u.id) ?? 0}
              onClick={() => onPersona(persona === u.id ? TODOS : u.id)}
            />
          ))}
          {(pendientes.get(SIN) ?? 0) > 0 && (
            <BotonPersona
              id={null}
              nombre="Sin asignar"
              activo={persona === SIN}
              pendientes={pendientes.get(SIN) ?? 0}
              onClick={() => onPersona(persona === SIN ? TODOS : SIN)}
            />
          )}
        </div>
      </div>

      <div className="h-px bg-line" />

      {/* Proyectos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-subtle px-4 py-3">
        <Rotulo icon={<KanbanSquare className="h-3.5 w-3.5" />}>Proyectos</Rotulo>

        {form ? (
          /* Con el formulario abierto los chips se van: si no, la fila tiene a
             la vez los proyectos y el que se está editando, y no se entiende
             cuál de los dos estás tocando. */
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={form.nombre}
              maxLength={LIMITES.proyecto}
              disabled={guardando}
              placeholder="Nombre del proyecto"
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardar()
                if (e.key === "Escape") setForm(null)
              }}
              className="h-7 w-48 text-[12px]"
            />

            {/* El color sólo se elige al editar: al crear se asigna el primero
                libre, y una decisión menos en el camino de anotar algo. */}
            {form.id && (
              <div className="flex items-center gap-1">
                {COLORES.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={guardando}
                    onClick={() => setForm({ ...form, color: i })}
                    aria-label={`Color ${i + 1}`}
                    aria-pressed={form.color === i}
                    className={cn(
                      "h-4 w-4 rounded-full transition-transform hover:scale-110",
                      c.punto,
                      form.color === i && "ring-2 ring-ink ring-offset-1 ring-offset-surface-subtle"
                    )}
                  />
                ))}
              </div>
            )}

            <Button size="sm" onClick={() => void guardar()} disabled={guardando || !form.nombre.trim()}>
              <Check className="h-3.5 w-3.5" />
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={guardando}>
              Cancelar
            </Button>

            {editando && (
              <button
                type="button"
                onClick={() => setPorBorrar(editando)}
                disabled={guardando}
                className="text-[11.5px] font-medium text-ink-muted transition-colors hover:text-danger-text disabled:opacity-40"
              >
                Borrar proyecto
              </button>
            )}
          </div>
        ) : (
          <>
            <Pastilla activo={proyecto === TODOS} onClick={() => onProyecto(TODOS)}>
              Todos
            </Pastilla>

            {proyectos.map((p) => (
              <span key={p.id} className="group relative inline-flex">
                <Pastilla
                  activo={proyecto === p.id}
                  onClick={() => onProyecto(proyecto === p.id ? TODOS : p.id)}
                >
                  <span className={cn("h-2 w-2 rounded-full", colorDe(p.color).punto)} />
                  {p.nombre}
                </Pastilla>
                {/* El lápiz aparece al pasar por encima: el chip es un filtro
                    antes que un objeto editable, y un botón permanente al lado
                    de cada nombre convertiría la fila en una barra de
                    herramientas. */}
                <button
                  type="button"
                  onClick={() => setForm({ id: p.id, nombre: p.nombre, color: p.color })}
                  aria-label={`Editar ${p.nombre}`}
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-e1 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 group-hover:flex"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}

            <Pastilla
              activo={proyecto === SIN}
              onClick={() => onProyecto(proyecto === SIN ? TODOS : SIN)}
            >
              Sin proyecto
            </Pastilla>

            <button
              type="button"
              onClick={() => setForm({ id: null, nombre: "", color: 0 })}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus className="h-3 w-3" />
              Proyecto
            </button>
          </>
        )}
      </div>

      <ConfirmarDialog
        abierto={porBorrar !== null}
        titulo="¿Borrar el proyecto?"
        descripcion={
          <>
            Se borra <strong className="font-semibold text-ink">{porBorrar?.nombre}</strong> de la
            lista. Los tickets no se borran: quedan sin proyecto.
          </>
        }
        confirmar="Borrar proyecto"
        trabajando={guardando}
        onCerrar={() => setPorBorrar(null)}
        onConfirmar={() => porBorrar && void borrar(porBorrar)}
      />
    </div>
  )
}

function Rotulo({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="inline-flex w-[86px] shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
      {icon}
      {children}
    </span>
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        activo
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-muted"
      )}
    >
      {children}
    </button>
  )
}

/** El avatar como botón: el filtro por persona de la fila de arriba. El número
 *  es lo que tiene sin terminar — sin él, la fila dice quiénes son pero no
 *  quién está tapado. */
function BotonPersona({
  id,
  nombre,
  activo,
  pendientes,
  onClick,
}: {
  id: string | null
  nombre: string
  activo: boolean
  pendientes: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${nombre} — ${pendientes} sin terminar`}
      aria-pressed={activo}
      aria-label={nombre}
      className={cn(
        "relative rounded-full transition-transform duration-150 hover:-translate-y-0.5",
        activo
          ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface"
          : "ring-1 ring-transparent hover:ring-line-strong"
      )}
    >
      <Avatar id={id} nombre={id ? nombre : null} size="md" />
      {pendientes > 0 && (
        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[9.5px] font-bold tabular-nums leading-none text-n-25">
          {pendientes}
        </span>
      )}
    </button>
  )
}

/* ── Columna ──────────────────────────────────────────────────────────────── */

const PUNTO_ESTADO: Record<EstadoTablero, string> = {
  backlog: "bg-n-400",
  progreso: "bg-brand-500",
  hecho: "bg-emerald-500",
}

function Columna({
  estado,
  tickets,
  proyectos,
  yo,
  arrastrando,
  destino,
  onDragOver,
  onDragLeave,
  onSoltar,
  onArrastrar,
  onAbrir,
  onArchivar,
  onNuevo,
}: {
  estado: EstadoTablero
  tickets: Ticket[]
  proyectos: Proyecto[]
  yo: Yo
  arrastrando: string | null
  /** Posición de la raya de inserción, o `null` si el arrastre no está acá. */
  destino: number | null
  onDragOver: (cont: HTMLElement, y: number) => void
  onDragLeave: () => void
  onSoltar: (idx: number) => void
  onArrastrar: (id: string | null) => void
  onAbrir: (t: Ticket) => void
  onArchivar: (t: Ticket) => void
  onNuevo: () => void
}) {
  const arrastreEncima = arrastrando !== null && destino !== null

  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border bg-surface-subtle transition-colors",
        arrastreEncima ? "border-brand-300 bg-brand-50/40" : "border-line"
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", PUNTO_ESTADO[estado])} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {ESTADO_LABEL[estado]}
            <span className="ml-1.5 text-[12px] font-medium tabular-nums text-ink-faint">
              {tickets.length}
            </span>
          </h2>
          <p className="truncate text-[11px] text-ink-faint">{ESTADO_PISTA[estado]}</p>
        </div>
        <button
          type="button"
          onClick={onNuevo}
          aria-label={`Nuevo ticket en ${ESTADO_LABEL[estado]}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      {/* La zona de soltar es la columna entera, no cada tarjeta: apuntarle a
          un hueco de 4px entre dos tarjetas sería imposible. */}
      <div
        className="flex min-h-[140px] flex-1 flex-col gap-2 p-2.5"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          onDragOver(e.currentTarget, e.clientY)
        }}
        onDragLeave={(e) => {
          // Sólo cuando el cursor sale de la columna de verdad: pasar de una
          // tarjeta a otra dispara `dragleave` en la de atrás y la raya
          // parpadearía en cada movimiento.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeave()
        }}
        onDrop={(e) => {
          e.preventDefault()
          onSoltar(destino ?? tickets.length)
        }}
      >
        {tickets.length === 0 && destino === null ? (
          <button
            type="button"
            onClick={onNuevo}
            className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong py-6 text-[12px] text-ink-faint transition-colors hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"
          >
            <Plus className="h-4 w-4" />
            Agregar un ticket
          </button>
        ) : (
          tickets.map((t, i) => (
            <div key={t.id} className="contents">
              {destino === i && <Raya />}
              <Tarjeta
                ticket={t}
                proyecto={proyectos.find((p) => p.id === t.proyectoId) ?? null}
                yo={yo}
                arrastrandose={arrastrando === t.id}
                onArrastrar={onArrastrar}
                onAbrir={() => onAbrir(t)}
                onArchivar={estado === "hecho" ? () => onArchivar(t) : undefined}
              />
            </div>
          ))
        )}
        {destino !== null && destino >= tickets.length && <Raya />}
      </div>
    </section>
  )
}

/** La raya de inserción. Es la única señal de dónde va a caer la tarjeta: sin
 *  ella, arrastrar dentro de la misma columna es adivinar. */
function Raya() {
  return <div className="h-[3px] shrink-0 rounded-full bg-brand-500" aria-hidden />
}

/* ── Tarjeta ──────────────────────────────────────────────────────────────── */

function Tarjeta({
  ticket,
  proyecto,
  yo,
  arrastrandose,
  onArrastrar,
  onAbrir,
  onArchivar,
}: {
  ticket: Ticket
  proyecto: Proyecto | null
  yo: Yo
  arrastrandose: boolean
  onArrastrar: (id: string | null) => void
  onAbrir: () => void
  /** Sólo en Hecho: es el único lugar desde donde tiene sentido archivar. */
  onArchivar?: () => void
}) {
  return (
    <article
      data-card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        // Firefox no arranca el arrastre si no hay datos en el portapapeles.
        e.dataTransfer.setData("text/plain", ticket.id)
        onArrastrar(ticket.id)
      }}
      onDragEnd={() => onArrastrar(null)}
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onAbrir()
        }
      }}
      className={cn(
        "group relative cursor-grab rounded-lg border border-line bg-surface p-3 text-left shadow-e1 transition-[box-shadow,border-color,opacity] hover:border-line-strong hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:cursor-grabbing",
        arrastrandose && "opacity-40"
      )}
    >
      {(proyecto || ticket.origenAgente) && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {proyecto && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] text-[10px] font-semibold",
                colorDe(proyecto.color).chip
              )}
            >
              {proyecto.nombre}
            </span>
          )}
          {ticket.origenAgente && <EtiquetaAgente origen={ticket.origenAgente} />}
        </div>
      )}

      <p className="text-[13px] font-medium leading-snug text-ink">{ticket.titulo}</p>

      {ticket.descripcion && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
          {resumenDe(ticket.descripcion)}
        </p>
      )}

      <footer className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-ink-faint">
          <span className="truncate">
            {ticket.autorId === yo.id ? "Lo pediste vos" : `Lo pidió ${ticket.autorNombre}`} ·{" "}
            {fechaDeTicket(ticket.createdAt)}
          </span>
          {/* El clip dice que hay algo que mirar adentro. Sin él, una captura
              subida es una captura que nadie abre. */}
          {ticket.imagenes > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 font-medium text-ink-muted"
              title={`${ticket.imagenes} ${ticket.imagenes === 1 ? "imagen" : "imágenes"}`}
            >
              <ImageIcon className="h-3 w-3" />
              {ticket.imagenes}
            </span>
          )}
        </span>
        <Avatar id={ticket.asignadoId} nombre={ticket.asignadoNombre} size="sm" />
      </footer>

      {/* Archivar aparece al pasar por encima y sólo en Hecho. Es la acción que
          vacía la columna, así que tiene que estar a mano —pero no tanto como
          para apretarla sin querer al ir a arrastrar. */}
      {onArchivar && (
        <button
          type="button"
          onClick={(e) => {
            // Sin esto, archivar abriría además el diálogo del ticket.
            e.stopPropagation()
            onArchivar()
          }}
          title="Archivar — sale del tablero"
          aria-label="Archivar"
          className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-ink-muted shadow-e1 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 group-hover:flex"
        >
          <Archive className="h-3 w-3" />
        </button>
      )}
    </article>
  )
}

/* ── Archivados ───────────────────────────────────────────────────────────── */

/**
 * Lo que salió del tablero, plegado.
 *
 * Arranca cerrado y se abre con un click: si estuviera siempre abierto, el
 * archivo volvería a ocupar la pantalla que archivar liberó, y la función no
 * serviría para nada. Pero tiene que estar a la vista —con su número— porque un
 * archivo al que no se puede llegar no es un archivo, es un borrado disimulado.
 */
function Archivados({
  tickets,
  proyectos,
  onAbrir,
  onRestaurar,
}: {
  tickets: Ticket[]
  proyectos: Proyecto[]
  onAbrir: (t: Ticket) => void
  onRestaurar: (t: Ticket) => void
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-subtle">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
      >
        <Archive className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="text-[12.5px] font-semibold text-ink-secondary">
          Archivados
          <span className="ml-1.5 font-medium tabular-nums text-ink-faint">{tickets.length}</span>
        </span>
        <span className="ml-auto text-[11.5px] text-ink-faint">
          {abierto ? "Ocultar" : "Ver"}
        </span>
      </button>

      {abierto && (
        <ul className="divide-y divide-line border-t border-line">
          {tickets.map((t) => {
            const proyecto = proyectos.find((p) => p.id === t.proyectoId) ?? null
            return (
              <li key={t.id} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onAbrir(t)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    {proyecto && (
                      <span
                        className={cn("h-2 w-2 shrink-0 rounded-full", colorDe(proyecto.color).punto)}
                        title={proyecto.nombre}
                      />
                    )}
                    <span className="truncate text-[12.5px] text-ink-secondary">{t.titulo}</span>
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                    Archivado el {fechaDeTicket(t.updatedAt)}
                  </span>
                </button>

                <Avatar id={t.asignadoId} nombre={t.asignadoNombre} size="xs" />

                <button
                  type="button"
                  onClick={() => onRestaurar(t)}
                  title="Devolver a Hecho"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Undo2 className="h-3 w-3" />
                  Restaurar
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
