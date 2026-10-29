"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Trash2, X, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DIAS_CORTOS,
  EJECUTORES,
  EJECUTOR_LABEL,
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_PISTA,
  LIMITES,
  ORDEN_SEMANA,
  REPETICIONES,
  REPETICION_LABEL,
  TIPOS,
  TIPO_COLOR,
  TIPO_PISTA,
  borradorVacio,
  describirCorrida,
  diaSemana,
  type Borrador,
  type Corrida,
  type Entrada,
  type Tipo,
  type Usuario,
  type Yo,
} from "@/lib/calendario-equipo"
import { cn } from "@/lib/utils"

/** El singular, para el título del diálogo. */
const TIPO_SINGULAR: Record<Tipo, string> = { persona: "Tarea o reunión", agente: "Agente", proceso: "Proceso" }
const TIPO_CORTO: Record<Tipo, string> = { persona: "Persona", agente: "Agente", proceso: "Proceso" }

/**
 * El detalle de una entrada, que es también su formulario — como el ticket.
 *
 * Una sola pantalla para los tres tipos: la forma es la misma (qué, cuándo,
 * cada cuánto, quiénes) y lo que cambia aparece sólo cuando aplica. A un agente
 * o proceso se le suman con qué corre, su estado y la clave con la que avisa,
 * y abajo sus últimas corridas.
 */
export function EntradaDialog({
  abierto,
  entrada,
  fechaInicial,
  tipoInicial,
  usuarios,
  yo,
  corridas,
  onCerrar,
  onCambio,
}: {
  abierto: boolean
  entrada: Entrada | null
  fechaInicial: string
  tipoInicial: Tipo
  usuarios: Usuario[]
  yo: Yo
  corridas: Corrida[]
  onCerrar: () => void
  onCambio: () => void
}) {
  const [f, setF] = useState<Borrador>(borradorVacio(fechaInicial))
  const [guardando, setGuardando] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editando = entrada !== null

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setGuardando(false)
    setConfirmandoBorrar(false)
    setF(
      entrada
        ? {
            tipo: entrada.tipo,
            titulo: entrada.titulo,
            descripcion: entrada.descripcion ?? "",
            fecha: entrada.fecha,
            hora: entrada.hora ?? "",
            duracionMin: entrada.duracionMin,
            repeticion: entrada.repeticion,
            diasSemana: entrada.diasSemana,
            intervaloMin: entrada.intervaloMin,
            hasta: entrada.hasta ?? "",
            personas: entrada.personas.map((p) => p.id),
            ejecutor: entrada.ejecutor,
            clave: entrada.clave ?? "",
            estado: entrada.estado,
          }
        : borradorVacio(fechaInicial, tipoInicial, yo.id)
    )
  }, [abierto, entrada, fechaInicial, tipoInicial, yo.id])

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, guardando, onCerrar])

  function set<K extends keyof Borrador>(k: K, v: Borrador[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  /** Cambiar de tipo en un alta rearma lo que depende de él; editando, sólo
   *  el tipo. */
  function cambiarTipo(t: Tipo) {
    if (editando) set("tipo", t)
    else setF((prev) => ({ ...borradorVacio(prev.fecha, t, yo.id), titulo: prev.titulo, descripcion: prev.descripcion }))
  }

  async function guardar() {
    if (!f.titulo.trim()) {
      setError("Falta el título.")
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch(editando ? `/api/calendario/${entrada.id}` : "/api/calendario", {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, hora: f.hora || null, hasta: f.hasta || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")
      toast.success(editando ? "Guardado" : "Agregado al calendario")
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!entrada) return
    setGuardando(true)
    try {
      const r = await fetch(`/api/calendario/${entrada.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo borrar")
      toast.success("Borrado")
      setConfirmandoBorrar(false)
      onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
      setGuardando(false)
    }
  }

  if (!abierto) return null

  const maquina = f.tipo !== "persona"
  const historial = entrada?.clave ? corridas.filter((c) => c.clave === entrada.clave).slice(0, 8) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Detalle" : "Nueva entrada"}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <div className={cn("h-1 shrink-0 rounded-t-2xl", TIPO_COLOR[f.tipo].punto)} />

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
              {editando ? TIPO_SINGULAR[f.tipo] : "Nueva en el calendario"}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              {editando ? `Lo cargó ${entrada.autorNombre}` : TIPO_PISTA[f.tipo]}
            </p>
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

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <Rotulo>Qué es</Rotulo>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {TIPOS.map((t) => (
                <Opcion key={t} activo={f.tipo === t} disabled={guardando} onClick={() => cambiarTipo(t)}>
                  <span className={cn("h-2 w-2 rounded-full", TIPO_COLOR[t].punto)} />
                  {TIPO_CORTO[t]}
                </Opcion>
              ))}
            </div>
          </div>

          <div>
            <Rotulo htmlFor="titulo">Título</Rotulo>
            <Input
              id="titulo"
              autoFocus={!editando}
              value={f.titulo}
              maxLength={LIMITES.titulo}
              disabled={guardando}
              placeholder={
                f.tipo === "persona"
                  ? "Reunión de marketing, mandar el informe…"
                  : f.tipo === "agente"
                    ? "Revisión semanal de Google Ads"
                    : "Inventario de Distecna"
              }
              onChange={(e) => set("titulo", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Rotulo htmlFor="descripcion">{maquina ? "Qué hace" : "Detalle"}</Rotulo>
            <Textarea
              id="descripcion"
              value={f.descripcion}
              maxLength={LIMITES.descripcion}
              disabled={guardando}
              rows={3}
              placeholder={maquina ? "Qué trae o analiza, y qué deja hecho." : "Opcional"}
              onChange={(e) => set("descripcion", e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Cuándo */}
          <div>
            <Rotulo>Se repite</Rotulo>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REPETICIONES.filter((r) => maquina || r !== "continua").map((r) => (
                <Opcion
                  key={r}
                  activo={f.repeticion === r}
                  disabled={guardando}
                  onClick={() => {
                    set("repeticion", r)
                    if (r === "semanal" && f.diasSemana.length === 0) set("diasSemana", [diaSemana(f.fecha)])
                    if (r === "continua" && !f.intervaloMin) set("intervaloMin", 15)
                  }}
                >
                  {REPETICION_LABEL[r]}
                </Opcion>
              ))}
            </div>
          </div>

          {f.repeticion === "semanal" && (
            <div>
              <Rotulo>Qué días</Rotulo>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ORDEN_SEMANA.map((d) => (
                  <Opcion
                    key={d}
                    activo={f.diasSemana.includes(d)}
                    disabled={guardando}
                    onClick={() =>
                      set(
                        "diasSemana",
                        f.diasSemana.includes(d) ? f.diasSemana.filter((x) => x !== d) : [...f.diasSemana, d]
                      )
                    }
                  >
                    {DIAS_CORTOS[d]}
                  </Opcion>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Rotulo htmlFor="fecha">{f.repeticion === "nunca" ? "Fecha" : "Desde"}</Rotulo>
              <Input
                id="fecha"
                type="date"
                value={f.fecha}
                disabled={guardando}
                onChange={(e) => e.target.value && set("fecha", e.target.value)}
                className="mt-1.5"
              />
            </div>
            {f.repeticion === "continua" ? (
              <div>
                <Rotulo htmlFor="intervalo">Cada (minutos)</Rotulo>
                <Input
                  id="intervalo"
                  type="number"
                  min={1}
                  max={1440}
                  value={f.intervaloMin ?? 15}
                  disabled={guardando}
                  onChange={(e) => set("intervaloMin", Number(e.target.value) || null)}
                  className="mt-1.5"
                />
              </div>
            ) : (
              <div>
                <Rotulo htmlFor="hora">Hora</Rotulo>
                <Input
                  id="hora"
                  type="time"
                  value={f.hora}
                  disabled={guardando}
                  onChange={(e) => set("hora", e.target.value)}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-ink-faint">Vacía = todo el día</p>
              </div>
            )}
            {f.repeticion !== "nunca" && (
              <div>
                <Rotulo htmlFor="hasta">Hasta</Rotulo>
                <Input
                  id="hasta"
                  type="date"
                  value={f.hasta}
                  min={f.fecha}
                  disabled={guardando}
                  onChange={(e) => set("hasta", e.target.value)}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-ink-faint">Vacía = sin fin</p>
              </div>
            )}
          </div>

          {/* Quiénes */}
          <div>
            <Rotulo>{maquina ? "Quién lo mira" : "Quiénes"}</Rotulo>
            {maquina && (
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Quien lee lo que deja y responde si un día no corre.
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {usuarios.map((u) => (
                <Opcion
                  key={u.id}
                  activo={f.personas.includes(u.id)}
                  disabled={guardando}
                  onClick={() =>
                    set(
                      "personas",
                      f.personas.includes(u.id) ? f.personas.filter((x) => x !== u.id) : [...f.personas, u.id]
                    )
                  }
                >
                  <Avatar id={u.id} nombre={u.nombre} size="xs" />
                  {u.id === yo.id ? "Yo" : u.nombre}
                </Opcion>
              ))}
            </div>
          </div>

          {maquina && (
            <>
              <div>
                <Rotulo>Estado</Rotulo>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {ESTADOS.map((s) => (
                    <Opcion key={s} activo={f.estado === s} disabled={guardando} onClick={() => set("estado", s)}>
                      {ESTADO_LABEL[s]}
                    </Opcion>
                  ))}
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-muted">{ESTADO_PISTA[f.estado]}</p>
              </div>

              <div>
                <Rotulo>Con qué corre</Rotulo>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {EJECUTORES.map((x) => (
                    <Opcion key={x} activo={f.ejecutor === x} disabled={guardando} onClick={() => set("ejecutor", x)}>
                      {EJECUTOR_LABEL[x]}
                    </Opcion>
                  ))}
                </div>
              </div>

              <div>
                <Rotulo htmlFor="clave">Clave</Rotulo>
                <Input
                  id="clave"
                  value={f.clave}
                  disabled={guardando}
                  placeholder="agente-ads"
                  onChange={(e) => set("clave", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="mt-1.5 font-mono text-[12.5px]"
                />
                <p className="mt-1 text-[11.5px] text-ink-muted">
                  Con este nombre avisa cada vez que corre (POST a{" "}
                  <code className="rounded bg-surface-muted px-1">/api/calendario/corridas</code>). Sin clave, el
                  calendario no puede decir si corrió.
                </p>
              </div>

              {editando && entrada.clave && (
                <div>
                  <Rotulo>Últimas corridas</Rotulo>
                  {historial.length === 0 ? (
                    <p className="mt-1.5 text-[12px] text-ink-muted">Ninguna en las últimas dos semanas.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {historial.map((c) => (
                        <li
                          key={c.id}
                          className={cn(
                            "flex items-start gap-1.5 text-[12px]",
                            c.ok ? "text-ink-secondary" : "text-danger-text"
                          )}
                        >
                          {c.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                          )}
                          <span>
                            {describirCorrida(c)}
                            {c.origen !== "cron" && <span className="text-ink-faint"> · {c.origen}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger-text">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5">
          {editando ? (
            <button
              type="button"
              onClick={() => setConfirmandoBorrar(true)}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-danger-text disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void guardar()} disabled={guardando || !f.titulo.trim()}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editando ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmarDialog
        abierto={confirmandoBorrar}
        titulo="¿Borrar del calendario?"
        descripcion={
          entrada?.repeticion !== "nunca"
            ? "Se borran todas las repeticiones. Si es un agente o proceso, sus corridas quedan guardadas."
            : "Se borra esta entrada."
        }
        confirmar="Borrar"
        tono="danger"
        trabajando={guardando}
        onCerrar={() => setConfirmandoBorrar(false)}
        onConfirmar={() => void borrar()}
      />
    </div>
  )
}

function Rotulo({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">
      {children}
    </label>
  )
}

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
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
        activo
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
      )}
    >
      {children}
    </button>
  )
}
