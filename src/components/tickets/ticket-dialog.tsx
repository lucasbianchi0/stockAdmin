"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ImagePlus, Loader2, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/tickets/avatar"
import { EtiquetaAgente } from "@/components/tickets/etiqueta-agente"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { claveDe, mensajeError, pedirJson, useInvalidar } from "@/lib/admin/query"
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_PISTA,
  LIMITES,
  TAMANO_MAX,
  borradorVacio,
  colorDe,
  faltaTitulo,
  fechaDeTicket,
  formatearTamano,
  tipoAceptado,
  type BorradorTicket,
  type Estado,
  type Imagen,
  type Proyecto,
  type Ticket,
  type Usuario,
  type Yo,
} from "@/lib/tickets"
import { cn } from "@/lib/utils"

/**
 * El detalle de un ticket, que es también su formulario.
 *
 * Un diálogo y no dos —uno para ver, otro para editar— porque el ticket entero
 * son cuatro campos: mostrarlos en modo lectura y pedir un click en "Editar"
 * para poder tocarlos agrega un paso a cada corrección sin proteger nada. Acá se
 * abre, se cambia lo que haga falta y se guarda.
 *
 * Lo único obligatorio es el título. Todo lo demás —proyecto, asignado,
 * descripción— se completa cuando se sabe: obligar a decidirlo al anotar es la
 * forma más rápida de que la gente deje de anotar.
 */
export function TicketDialog({
  abierto,
  ticket,
  estadoInicial = "backlog",
  proyectoInicial = null,
  proyectos,
  usuarios,
  yo,
  onCerrar,
  onGuardado,
  onBorrado,
}: {
  abierto: boolean
  /** `null` = alta. Con ticket = detalle y edición. */
  ticket: Ticket | null
  /** En qué columna cae un ticket nuevo: la del botón "+" que se apretó. */
  estadoInicial?: Estado
  /** Con un proyecto filtrado arriba, el ticket nuevo nace en ese proyecto. */
  proyectoInicial?: string | null
  proyectos: Proyecto[]
  usuarios: Usuario[]
  yo: Yo
  onCerrar: () => void
  onGuardado: (t: Ticket, esNuevo: boolean) => void
  /** Se llama y listo: el borrado lo hace el tablero, que es el que tiene la
   *  lista y puede devolver la tarjeta a su lugar si el servidor falla. */
  onBorrado: (t: Ticket) => void
}) {
  const [f, setF] = useState<BorradorTicket>(borradorVacio())
  /** Las imágenes elegidas en un ticket que todavía no existe. No se pueden
   *  subir antes de tener el id, así que esperan acá y viajan apenas el POST
   *  contesta. La alternativa —"guardá primero y después adjuntá"— es pedirle a
   *  la persona que se acuerde de volver. */
  const [pendientes, setPendientes] = useState<File[]>([])
  const [guardando, setGuardando] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editando = ticket !== null
  const ocupado = guardando

  // Al abrir se rearma el borrador desde cero. Sin esto, cerrar una edición y
  // abrir un alta muestra el ticket anterior.
  const invalidar = useInvalidar("tickets")

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setPendientes([])
    // La bandera de guardado también se reinicia: si una petición anterior la
    // dejó prendida, el diálogo nuevo abriría con todo bloqueado y sin forma de
    // cerrarlo.
    setGuardando(false)
    setConfirmandoBorrar(false)
    setF(
      ticket
        ? {
            titulo: ticket.titulo,
            descripcion: ticket.descripcion ?? "",
            estado: ticket.estado,
            proyectoId: ticket.proyectoId,
            asignadoId: ticket.asignadoId,
          }
        : {
            ...borradorVacio(estadoInicial, yo.id),
            proyectoId: proyectoInicial,
          }
    )
  }, [abierto, ticket, estadoInicial, proyectoInicial, yo.id])

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, ocupado, onCerrar])

  function set<K extends keyof BorradorTicket>(k: K, v: BorradorTicket[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  async function guardar() {
    if (faltaTitulo(f)) {
      setError("Falta el título.")
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const r = await fetch(editando ? `/api/tickets/${ticket.id}` : "/api/tickets", {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")

      const creado = d.ticket as Ticket

      // Las imágenes elegidas antes de que el ticket existiera. Si alguna falla
      // se avisa pero el ticket queda creado igual: perder el ticket porque no
      // subió una captura sería el peor de los dos resultados.
      if (pendientes.length > 0) {
        let subidas = 0
        for (const archivo of pendientes) {
          try {
            await subirImagen(creado.id, archivo)
            subidas++
          } catch (e) {
            toast.error(mensajeError(e, `No se pudo subir «${archivo.name}»`))
          }
        }
        creado.imagenes = subidas
      }

      onGuardado(creado, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  /**
   * El paso destructivo, con su propia confirmación.
   *
   * No es `window.confirm`: el nativo congela el hilo del navegador —y con eso
   * la animación y el resto de la página, que se lee como que la app se
   * colgó—, y basta con que alguien tilde "impedir que esta página cree
   * diálogos" en el segundo borrado para que el botón deje de hacer nada, sin
   * error ni aviso. Es el mismo diálogo que usa Administración.
   *
   * No espera al servidor: confirma, cierra y le pasa el ticket al tablero, que
   * lo saca de la lista al instante y manda el pedido por detrás. Un borrado es
   * una operación que sale bien casi siempre; tener la pantalla trabada dos
   * segundos por si acaso es pagar en cada borrado un precio que corresponde al
   * caso raro. Si falla, la tarjeta vuelve a su lugar y el aviso lo explica.
   */
  function borrar() {
    if (!ticket) return
    setConfirmandoBorrar(false)
    onBorrado(ticket)
  }

  if (!abierto) return null

  const proyecto = proyectos.find((p) => p.id === f.proyectoId) ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Detalle del ticket" : "Ticket nuevo"}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !ocupado && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        {/* Cabecera: la franja de color del proyecto es lo primero que se ve, y
            es la única pista de contexto antes de leer el título. */}
        <div
          className={cn(
            "h-1 shrink-0 rounded-t-2xl",
            proyecto ? colorDe(proyecto.color).punto : "bg-n-200"
          )}
        />

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? "Detalle del ticket" : "Ticket nuevo"}
              </h2>
              {ticket?.origenAgente && <EtiquetaAgente origen={ticket.origenAgente} />}
            </span>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              {editando ? (
                <>
                  {ticket.origenAgente ? "Lo anotó un agente para " : "Lo pidió "}
                  {ticket.autorNombre} · {fechaDeTicket(ticket.createdAt)}
                </>
              ) : (
                <>Va a quedar pedido por {yo.nombre}</>
              )}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <Rotulo htmlFor="titulo">Título</Rotulo>
            <Input
              id="titulo"
              autoFocus={!editando}
              value={f.titulo}
              maxLength={LIMITES.titulo}
              disabled={ocupado}
              placeholder="Qué hay que hacer"
              onChange={(e) => set("titulo", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Rotulo htmlFor="descripcion">Descripción</Rotulo>
            <Textarea
              id="descripcion"
              value={f.descripcion}
              maxLength={LIMITES.descripcion}
              disabled={ocupado}
              rows={5}
              placeholder="El detalle: qué se espera, dónde está lo que hace falta, cómo se sabe que terminó."
              onChange={(e) => set("descripcion", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Rotulo>Columna</Rotulo>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={ocupado}
                  onClick={() => set("estado", e)}
                  aria-pressed={f.estado === e}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors disabled:opacity-60",
                    f.estado === e
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                  )}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
            {/* La pista importa sobre todo en Archivado: es el único estado que
                hace desaparecer el ticket de la pantalla, y eso hay que decirlo
                antes y no después. */}
            <p className="mt-1.5 text-[11.5px] text-ink-muted">{ESTADO_PISTA[f.estado]}</p>
          </div>

          <div>
            <Rotulo>Imágenes</Rotulo>
            <PanelImagenes
              ticketId={ticket?.id ?? null}
              pendientes={pendientes}
              onPendientes={setPendientes}
              deshabilitado={ocupado}
              onCambio={invalidar}
            />
          </div>

          <div>
            <Rotulo>Asignado a</Rotulo>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Opcion
                activo={f.asignadoId === null}
                disabled={ocupado}
                onClick={() => set("asignadoId", null)}
              >
                <Avatar id={null} nombre={null} size="xs" />
                Sin asignar
              </Opcion>
              {usuarios.map((u) => (
                <Opcion
                  key={u.id}
                  activo={f.asignadoId === u.id}
                  disabled={ocupado}
                  onClick={() => set("asignadoId", u.id)}
                >
                  <Avatar id={u.id} nombre={u.nombre} size="xs" />
                  {u.id === yo.id ? "Yo" : u.nombre}
                </Opcion>
              ))}
            </div>
          </div>

          <div>
            <Rotulo>Proyecto</Rotulo>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Opcion
                activo={f.proyectoId === null}
                disabled={ocupado}
                onClick={() => set("proyectoId", null)}
              >
                Sin proyecto
              </Opcion>
              {proyectos.map((p) => (
                <Opcion
                  key={p.id}
                  activo={f.proyectoId === p.id}
                  disabled={ocupado}
                  onClick={() => set("proyectoId", p.id)}
                >
                  <span className={cn("h-2 w-2 rounded-full", colorDe(p.color).punto)} />
                  {p.nombre}
                </Opcion>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger-text">
              {error}
            </p>
          )}
        </div>

        {/* Pie */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5">
          {editando ? (
            <button
              type="button"
              onClick={() => setConfirmandoBorrar(true)}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-danger-text disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </Button>
            <Button size="sm" onClick={guardar} disabled={ocupado || faltaTitulo(f)}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editando ? "Guardar" : "Crear ticket"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmarDialog
        abierto={confirmandoBorrar}
        titulo="¿Borrar el ticket?"
        descripcion={
          <>
            Se borra <strong className="font-semibold text-ink">{ticket?.titulo}</strong>
            {(ticket?.imagenes ?? 0) > 0 && " y sus imágenes"}. No se puede deshacer.
          </>
        }
        confirmar="Borrar"
        onCerrar={() => setConfirmandoBorrar(false)}
        onConfirmar={borrar}
      />
    </div>
  )
}

function Rotulo({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted"
    >
      {children}
    </label>
  )
}

/** Chip elegible. Es el mismo objeto para las tres listas del formulario —
 *  columna, persona y proyecto— para que elegir se sienta igual en las tres. */
function Opcion({
  activo,
  disabled,
  onClick,
  children,
}: {
  activo: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
        activo
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      {children}
    </button>
  )
}

/* ── Imágenes ─────────────────────────────────────────────────────────────── */

/** Sube un archivo y devuelve la imagen registrada. Fuera del componente porque
 *  el alta también la usa, para las que se eligieron antes de que el ticket
 *  existiera. */
async function subirImagen(ticketId: string, archivo: File): Promise<Imagen> {
  const form = new FormData()
  form.append("ticketId", ticketId)
  form.append("archivo", archivo)

  const r = await fetch("/api/tickets/imagenes", { method: "POST", body: form })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? "No se pudo subir")
  return d.imagen as Imagen
}

/**
 * Las capturas del ticket.
 *
 * Miniaturas y no una lista de nombres: en un ticket, ver la imagen **es** la
 * información —"el botón se corta en el móvil" se entiende de un vistazo y no
 * se entiende nunca leyendo `captura-2026-09-13.png`.
 *
 * El área entera acepta que se suelten archivos, no un recuadro chico: el gesto
 * real es arrastrar la captura desde el escritorio, y apuntarle a una zona de
 * 80px es más trabajo que abrir el selector.
 */
function PanelImagenes({
  ticketId,
  pendientes,
  onPendientes,
  deshabilitado,
  onCambio,
}: {
  /** `null` mientras el ticket no existe: ahí las imágenes esperan en `pendientes`. */
  ticketId: string | null
  pendientes: File[]
  onPendientes: (f: File[]) => void
  deshabilitado: boolean
  onCambio: () => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  // Las vistas previas de lo pendiente se arman una vez y se liberan al
  // cambiar. Hechas en el render, cada cambio de estado crearía un blob nuevo y
  // el navegador se los quedaría todos hasta recargar la página.
  const previas = useMemo(() => pendientes.map((a) => URL.createObjectURL(a)), [pendientes])
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas])

  const url = ticketId ? `/api/tickets/imagenes?ticketId=${ticketId}` : null
  const query = useQuery({
    queryKey: claveDe("tickets", url ?? ""),
    queryFn: ({ signal }) => pedirJson<{ imagenes?: Imagen[] }>(url!, { signal }),
    enabled: url !== null,
  })
  const imagenes = query.data?.imagenes ?? []

  /** Valida una tanda entera antes de subir nada: enterarse en el cuarto
   *  archivo de que el primero no servía es peor que enterarse al principio. */
  const validar = useCallback((lista: File[]) => {
    for (const a of lista) {
      if (!tipoAceptado(a.type)) {
        toast.error(`«${a.name}» no es una imagen`)
        return false
      }
      if (a.size > TAMANO_MAX) {
        toast.error(`«${a.name}» pesa ${formatearTamano(a.size)} — el máximo es 10 MB`)
        return false
      }
    }
    return true
  }, [])

  const agregar = useCallback(
    async (archivos: FileList | File[]) => {
      const lista = Array.from(archivos)
      if (lista.length === 0 || !validar(lista)) return

      // Sin ticket todavía: esperan y suben cuando se cree.
      if (!ticketId) {
        onPendientes([...pendientes, ...lista])
        return
      }

      setSubiendo(true)
      let ok = 0
      for (const archivo of lista) {
        try {
          await subirImagen(ticketId, archivo)
          ok++
        } catch (e) {
          toast.error(mensajeError(e, `No se pudo subir «${archivo.name}»`))
        }
      }
      setSubiendo(false)

      if (ok > 0) {
        await query.refetch()
        // El tablero dibuja el clip con el contador que vino en la lista: sin
        // esto, la tarjeta sigue diciendo que no hay imágenes.
        onCambio()
      }
    },
    [ticketId, pendientes, onPendientes, validar, query, onCambio]
  )

  async function borrar(imagen: Imagen) {
    setBorrando(imagen.id)
    try {
      const r = await fetch(`/api/tickets/imagenes/${imagen.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo borrar")
      await query.refetch()
      onCambio()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar la imagen"))
    } finally {
      setBorrando(null)
    }
  }

  const hayAlgo = imagenes.length > 0 || pendientes.length > 0

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        if (!deshabilitado) void agregar(e.dataTransfer.files)
      }}
      className={cn(
        "mt-1.5 rounded-lg border border-dashed p-2.5 transition-colors",
        encima ? "border-brand-400 bg-brand-50/60" : "border-line-strong bg-surface-subtle"
      )}
    >
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void agregar(e.target.files)
          // Se limpia para que elegir el mismo archivo dos veces vuelva a
          // disparar el evento.
          e.target.value = ""
        }}
      />

      {hayAlgo ? (
        <div className="flex flex-wrap gap-2">
          {imagenes.map((img) => (
            <figure key={img.id} className="group relative">
              {img.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={img.url}
                  alt={img.nombre}
                  title={`${img.nombre} — ${formatearTamano(img.tamano)}`}
                  onClick={() => window.open(img.url!, "_blank", "noopener")}
                  className="h-20 w-20 cursor-zoom-in rounded-md border border-line object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-md border border-line bg-surface-muted text-[10px] text-ink-faint">
                  sin vista
                </span>
              )}
              <button
                type="button"
                onClick={() => void borrar(img)}
                disabled={borrando === img.id || deshabilitado}
                aria-label={`Borrar ${img.nombre}`}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-e1 transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger-text group-hover:flex"
              >
                {borrando === img.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </figure>
          ))}

          {/* Las que todavía no existen en el servidor: se ven igual, con la
              marca de que suben al crear. */}
          {pendientes.map((archivo, i) => (
            <figure key={`${archivo.name}-${i}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previas[i]}
                alt={archivo.name}
                title={`${archivo.name} — sube al crear el ticket`}
                className="h-20 w-20 rounded-md border border-dashed border-brand-300 object-cover opacity-80"
              />
              <button
                type="button"
                onClick={() => onPendientes(pendientes.filter((_, j) => j !== i))}
                disabled={deshabilitado}
                aria-label={`Quitar ${archivo.name}`}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-e1 transition-colors hover:border-danger-line hover:bg-danger-soft hover:text-danger-text group-hover:flex"
              >
                <X className="h-3 w-3" />
              </button>
            </figure>
          ))}

          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={deshabilitado || subiendo}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-[10.5px] text-ink-faint transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
          >
            {subiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                Agregar
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={deshabilitado || subiendo}
          className="flex w-full flex-col items-center justify-center gap-1 py-4 text-[12px] text-ink-muted transition-colors hover:text-brand-700 disabled:opacity-50"
        >
          {subiendo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-4 w-4" />
              <span>
                Arrastrá una captura o <span className="font-medium text-brand-600">elegila del disco</span>
              </span>
              <span className="text-[10.5px] text-ink-faint">JPG, PNG, WEBP o GIF · hasta 10 MB</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
