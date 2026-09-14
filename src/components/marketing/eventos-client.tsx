"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Award, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Segmentado } from "@/components/marketing/form-campos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  ESTADO_LABEL,
  MODALIDAD_LABEL,
  TIPO_LABEL,
  ZONA,
  estadoDe,
  fechaCorta,
  type Estado,
  type Evento,
} from "@/lib/marketing/eventos"
import { cn } from "@/lib/utils"

type Filtro = "proximos" | "realizados" | "borradores" | "todos"

const TONO: Record<Estado, "success" | "brand" | "neutral" | "warning"> = {
  proximo: "brand",
  "en-curso": "success",
  realizado: "neutral",
  borrador: "warning",
}

/**
 * La lista de eventos. Arranca en "Próximos" porque es la pregunta con la que
 * se entra: qué está anunciado en el sitio. Los realizados son los que tienen
 * certificados pendientes, y por eso el conteo de asistentes está en la fila.
 */
export function EventosClient() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>("todos")

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/eventos")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar los eventos")
      setEventos(d.eventos ?? [])
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los eventos")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    const ahora = new Date()
    const lista = eventos.filter((e) => {
      const estado = estadoDe(e, ahora)
      if (filtro === "proximos") return estado === "proximo" || estado === "en-curso"
      if (filtro === "realizados") return estado === "realizado"
      if (filtro === "borradores") return estado === "borrador"
      return true
    })
    // Los próximos, del más cercano al más lejano; el resto, del más nuevo al más viejo.
    return filtro === "proximos"
      ? [...lista].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      : lista
  }, [eventos, filtro])

  async function borrar(e: Evento) {
    const aviso =
      e.asistentes > 0
        ? `\n\nTiene ${e.asistentes} certificado${e.asistentes === 1 ? "" : "s"} emitido${e.asistentes === 1 ? "" : "s"}: sus códigos dejan de verificar. Si es sólo para sacarlo del sitio, despublicalo.`
        : ""
    if (!confirm(`¿Borrar “${e.titulo}”? No se puede deshacer.${aviso}`)) return
    try {
      const r = await fetch(`/api/marketing/eventos/${e.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo borrar")
      setEventos((prev) => prev.filter((x) => x.id !== e.id))
      toast.success("Evento borrado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar")
    }
  }

  if (cargando) return <LoadingState label="Cargando eventos…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  if (eventos.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Todavía no hay ningún evento"
        description="Un workshop, un webinar, una capacitación. Lo que se carga acá sale en la sección de eventos de accedra.com.ar, y cuando pasa, desde la misma ficha se emiten los certificados de asistencia."
        action={
          <Button asChild>
            <Link href="/marketing/eventos/nuevo">
              <Plus />
              Cargar el primero
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado
          opciones={[
            { v: "todos", label: "Todos" },
            { v: "proximos", label: "Próximos" },
            { v: "realizados", label: "Realizados" },
            { v: "borradores", label: "Borradores" },
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
        <Button asChild>
          <Link href="/marketing/eventos/nuevo">
            <Plus />
            Nuevo evento
          </Link>
        </Button>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink-muted">
          No hay eventos en esta vista.
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map((e) => (
            <Fila key={e.id} evento={e} onBorrar={() => borrar(e)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Fila({ evento: e, onBorrar }: { evento: Evento; onBorrar: () => void }) {
  const estado = estadoDe(e)
  const d = new Date(e.inicio)
  const dia = d.toLocaleDateString("es-AR", { day: "2-digit", timeZone: ZONA })
  const mes = d.toLocaleDateString("es-AR", { month: "short", timeZone: ZONA }).replace(".", "")

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-3 shadow-e1 transition-colors hover:border-line-strong">
      <Link href={`/marketing/eventos/${e.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-navy-900">
          {e.portadaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.portadaUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
          )}
          <div className="relative grid h-full place-items-center text-center leading-none text-white">
            <div>
              <div className="text-[18px] font-semibold tabular-nums">{dia}</div>
              <div className="mt-0.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/75">{mes}</div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-ink">{e.titulo}</p>
            <Badge tone={TONO[estado]} size="sm">
              {ESTADO_LABEL[estado]}
            </Badge>
            {e.destacado && (
              <Badge tone="brand" size="sm">
                Destacado
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-faint">
            {[TIPO_LABEL[e.tipo], MODALIDAD_LABEL[e.modalidad], fechaCorta(e.inicio), e.lugar].filter(Boolean).join(" · ")}
          </p>
          {e.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {e.tags.map((t) => (
                <span key={t} className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-muted">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/marketing/eventos/${e.id}?tab=asistentes`}
          className={cn(
            "mr-1 hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors sm:inline-flex",
            e.asistentes > 0 ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line text-ink-muted hover:text-ink"
          )}
          title="Certificados"
        >
          <Award className="h-3.5 w-3.5" />
          {e.asistentes > 0 ? `${e.asistentes} certificado${e.asistentes === 1 ? "" : "s"}` : "Certificados"}
        </Link>
        <Button variant="ghost" size="icon-sm" asChild title="Editar">
          <Link href={`/marketing/eventos/${e.id}`}>
            <Pencil />
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onBorrar} title="Borrar">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
