"use client"

import { useEffect, useState } from "react"
import { Loader2, Megaphone, Pencil, Trash2, Users, X } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useQuery } from "@tanstack/react-query"

import { claveDe, pedirJson } from "@/lib/admin/query"
import type { Campana, Grupo } from "@/lib/marketing/contactos"
import type { Usuario } from "@/lib/tickets"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Las acciones en lote de Contactos que piden un dato: a qué AM, qué vertical,
 * a qué grupo. Un diálogo chico, con lo justo.
 */

export type ModoLote = "am" | "vertical" | "grupo"

export function LoteDialog({
  modo,
  cantidad,
  equipo,
  yoId,
  verticales,
  grupos,
  onCerrar,
  onConfirmar,
}: {
  /** `null` cierra el diálogo. */
  modo: ModoLote | null
  cantidad: number
  equipo: Usuario[]
  yoId: string | null
  verticales: string[]
  grupos: Grupo[]
  onCerrar: () => void
  /** am: id o null · vertical: texto · grupo: { grupoId } o { nuevoNombre } */
  onConfirmar: (valor: string | null | { grupoId?: string; nuevoNombre?: string }) => Promise<void>
}) {
  const { montado, saliendo } = usePresencia(modo !== null)
  const [mostrado, setMostrado] = useState(modo)
  if (modo && modo !== mostrado) setMostrado(modo)

  const [am, setAm] = useState<string>("")
  const [vertical, setVertical] = useState("")
  const [grupoId, setGrupoId] = useState("")
  const [nuevo, setNuevo] = useState("")
  const [trabajando, setTrabajando] = useState(false)

  // Cada apertura arranca limpia.
  const [abiertoPrevio, setAbiertoPrevio] = useState(modo)
  if (modo !== abiertoPrevio) {
    setAbiertoPrevio(modo)
    if (modo) {
      setAm(yoId ?? "")
      setVertical("")
      setGrupoId(grupos[0]?.id ?? "")
      setNuevo(grupos.length === 0 ? "" : "")
    }
  }

  useEffect(() => {
    if (!modo) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !trabajando && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modo, trabajando, onCerrar])

  if (!montado || !mostrado) return null

  const quien = `${cantidad.toLocaleString("es-AR")} ${cantidad === 1 ? "persona" : "personas"}`
  const titulo =
    mostrado === "am" ? "Asignar AM" : mostrado === "vertical" ? "Cambiar la vertical" : "Agregar a un grupo"
  const creandoGrupo = mostrado === "grupo" && (grupoId === "" || grupos.length === 0)
  const listo =
    mostrado === "am" ? true : mostrado === "vertical" ? vertical.trim() !== "" : creandoGrupo ? nuevo.trim() !== "" : !!grupoId

  const confirmar = async () => {
    if (!listo || trabajando) return
    setTrabajando(true)
    try {
      await onConfirmar(
        mostrado === "am"
          ? am || null
          : mostrado === "vertical"
            ? vertical.trim()
            : creandoGrupo
              ? { nuevoNombre: nuevo.trim() }
              : { grupoId }
      )
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !trabajando && onCerrar()}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void confirmar()
        }}
        className={cn(
          "relative w-full overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-md sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">A {quien}.</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="space-y-3 px-5 py-4">
          {mostrado === "am" && (
            <ul className="max-h-[300px] space-y-0.5 overflow-y-auto">
              {[...equipo, { id: "", nombre: "Sin AM" }].map((u) => (
                <li key={u.id || "sin"}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                      am === u.id ? "bg-brand-50 text-brand-700" : "hover:bg-surface-subtle"
                    )}
                  >
                    <input type="radio" name="am" className="sr-only" checked={am === u.id} onChange={() => setAm(u.id)} />
                    <Avatar id={u.id || null} nombre={u.id ? u.nombre : null} size="sm" />
                    <span className="flex-1">{u.nombre}</span>
                    {u.id === yoId && <span className="text-[11.5px] text-ink-faint">vos</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {mostrado === "vertical" && (
            <>
              <Input
                autoFocus
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                list="lote-verticales"
                placeholder="Servicios Financieros"
              />
              <datalist id="lote-verticales">
                {verticales.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}

          {mostrado === "grupo" && (
            <>
              {grupos.length > 0 && (
                <ul className="max-h-[240px] space-y-0.5 overflow-y-auto">
                  {grupos.map((g) => (
                    <li key={g.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                          grupoId === g.id ? "bg-brand-50 text-brand-700" : "hover:bg-surface-subtle"
                        )}
                      >
                        <input type="radio" name="grupo" className="sr-only" checked={grupoId === g.id} onChange={() => setGrupoId(g.id)} />
                        <Users className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                        <span className="flex-1 truncate">{g.nombre}</span>
                        <span className="num text-[12px] text-ink-faint">{g.miembros}</span>
                      </label>
                    </li>
                  ))}
                  <li>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                        grupoId === "" ? "bg-brand-50 text-brand-700" : "text-ink-secondary hover:bg-surface-subtle"
                      )}
                    >
                      <input type="radio" name="grupo" className="sr-only" checked={grupoId === ""} onChange={() => setGrupoId("")} />
                      <span className="w-3.5 text-center">+</span>
                      Grupo nuevo
                    </label>
                  </li>
                </ul>
              )}
              {creandoGrupo && (
                <Input
                  autoFocus
                  value={nuevo}
                  onChange={(e) => setNuevo(e.target.value)}
                  placeholder="Bancos — firma biométrica"
                  maxLength={80}
                />
              )}
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!listo || trabajando}>
            {trabajando && <Loader2 className="animate-spin" />}
            {mostrado === "grupo" ? (creandoGrupo ? "Crear y agregar" : "Agregar") : "Aplicar"}
          </Button>
        </footer>
      </form>
    </div>
  )
}

/**
 * La franja de un grupo, cuando se está filtrando por él: cuántos son, y lo que
 * se hace con el grupo entero. "Crear campaña" ya está en su lugar, apagado:
 * es por donde va a entrar lo que sigue.
 */
export function FranjaGrupo({
  grupo,
  onRenombrar,
  onBorrar,
  onCrearCampana,
}: {
  grupo: Grupo
  onRenombrar: (nombre: string) => Promise<void>
  onBorrar: () => void
  onCrearCampana: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(grupo.nombre)
  const url = `/api/contactos/campanas?grupo=${grupo.id}`
  const campanasQ = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<{ campanas: Campana[] }>(url, { signal }),
    staleTime: 60_000,
  })
  const campanas = campanasQ.data?.campanas ?? []

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-subtle px-4 py-2.5">
      <Users className="h-4 w-4 shrink-0 text-ink-muted" />
      {editando ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault()
            await onRenombrar(nombre)
            setEditando(false)
          }}
        >
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-7 w-56 text-[13px]" />
          <Button size="xs" type="submit">
            Guardar
          </Button>
          <Button size="xs" type="button" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-ink">
          <span className="font-medium">{grupo.nombre}</span>
          <span className="text-ink-muted">
            {" "}
            · {grupo.miembros.toLocaleString("es-AR")} {grupo.miembros === 1 ? "persona" : "personas"}
            {grupo.creadoPor && ` · armado por ${grupo.creadoPor.split(" ")[0]}`}
          </span>
        </p>
      )}
      <div className="ml-auto flex items-center gap-1">
        {!editando && (
          <Button size="xs" variant="ghost" onClick={() => setEditando(true)}>
            <Pencil />
            Renombrar
          </Button>
        )}
        <Button size="xs" variant="ghost" className="hover:text-danger-text" onClick={onBorrar}>
          <Trash2 />
          Borrar grupo
        </Button>
        <Button size="xs" variant="outline" onClick={onCrearCampana}>
          <Megaphone />
          Crear campaña
        </Button>
      </div>
      {campanas.length > 0 && (
        <ul className="flex w-full flex-wrap gap-1.5 pl-7">
          {campanas.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-ink-secondary"
              title={c.plantillaTitulo ? `Plantilla: ${c.plantillaTitulo}` : "Sin plantilla todavía"}
            >
              <Megaphone className="h-3 w-3 text-ink-faint" />
              {c.nombre}
              <span className="text-ink-faint">· {c.canal === "email" ? "mail" : "WhatsApp"} · {c.estado}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
