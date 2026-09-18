"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Segmentado } from "@/components/marketing/form-campos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  ESTADO_LABEL,
  TIPO_LABEL,
  estadoDe,
  fechaCorta,
  type Estado,
  type Nota,
} from "@/lib/marketing/notas"

type Filtro = "todas" | "publicadas" | "borradores"

const TONO: Record<Estado, "success" | "brand" | "warning"> = {
  publicada: "success",
  programada: "brand",
  borrador: "warning",
}

/**
 * La lista de notas, de la más nueva a la más vieja.
 *
 * Arranca en "Todas" y no en "Publicadas" porque la pregunta con la que se
 * entra acá es "¿qué tengo a medio escribir?": a diferencia de los eventos, una
 * nota vive semanas en borrador antes de salir.
 */
export function NotasClient() {
  const [notas, setNotas] = useState<Nota[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>("todas")

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch("/api/marketing/notas")
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar las notas")
      setNotas(d.notas ?? [])
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar las notas")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    const ahora = new Date()
    return notas.filter((n) => {
      const estado = estadoDe(n, ahora)
      if (filtro === "publicadas") return estado === "publicada" || estado === "programada"
      if (filtro === "borradores") return estado === "borrador"
      return true
    })
  }, [notas, filtro])

  const publicadas = notas.filter((n) => estadoDe(n) === "publicada").length

  async function borrar(n: Nota) {
    const aviso = n.publicado
      ? "\n\nEstá publicada: su dirección puede estar indexada en Google y enlazada desde otras notas, y va a quedar en 404. Si es sólo para sacarla del sitio, despublicala."
      : ""
    if (!confirm(`¿Borrar “${n.titulo}”? No se puede deshacer.${aviso}`)) return
    try {
      const r = await fetch(`/api/marketing/notas/${n.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo borrar")
      setNotas((prev) => prev.filter((x) => x.id !== n.id))
      toast.success("Nota borrada")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar")
    }
  }

  if (cargando) return <LoadingState label="Cargando notas…" />
  if (errorCarga) return <ErrorState message={errorCarga} onRetry={cargar} />

  if (notas.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Todavía no hay ninguna nota"
        description="Una nota responde una pregunta que alguien le hace a Google o a ChatGPT: “¿qué validez legal tiene la firma biométrica en Argentina?”. Lo que se publica acá sale en accedra.com.ar/recursos."
        action={
          <Button asChild>
            <Link href="/marketing/notas/nueva">
              <Plus />
              Escribir la primera
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
            { v: "todas", label: "Todas" },
            { v: "publicadas", label: "Publicadas" },
            { v: "borradores", label: "Borradores" },
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
        <div className="flex items-center gap-3">
          <p className="hidden text-[11.5px] text-ink-muted sm:block">
            {publicadas} en el sitio · {notas.length - publicadas} sin publicar
          </p>
          <Button asChild>
            <Link href="/marketing/notas/nueva">
              <Plus />
              Nueva nota
            </Link>
          </Button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-ink-muted">
          No hay notas en esta vista.
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map((n) => (
            <Fila key={n.id} nota={n} onBorrar={() => borrar(n)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Fila({ nota: n, onBorrar }: { nota: Nota; onBorrar: () => void }) {
  const estado = estadoDe(n)
  const fecha = n.publicadoEn || n.actualizado

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-3 shadow-e1 transition-colors hover:border-line-strong">
      <Link href={`/marketing/notas/${n.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-navy-900 sm:block">
          {n.portadaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.portadaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-white/40">
              <FileText className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-ink">{n.titulo}</p>
            <Badge tone={TONO[estado]} size="sm">
              {ESTADO_LABEL[estado]}
            </Badge>
            {n.destacada && (
              <Badge tone="brand" size="sm">
                Destacada
              </Badge>
            )}
          </div>
          {n.resumen && <p className="mt-1 truncate text-[12px] text-ink-muted">{n.resumen}</p>}
          <p className="mt-1 truncate font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-faint">
            {[TIPO_LABEL[n.tipo], n.categoria ? CATEGORIA_LABEL[n.categoria] : null, fechaCorta(fecha), n.autor]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        {n.categoria && (
          <span
            className="mr-1 hidden h-2 w-2 rounded-full sm:block"
            style={{ background: CATEGORIA_COLOR[n.categoria] }}
            title={CATEGORIA_LABEL[n.categoria]}
          />
        )}
        {estado === "publicada" && (
          <Button variant="ghost" size="icon-sm" asChild title="Ver en el sitio">
            <a href={`https://www.accedra.com.ar/recursos/${n.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" asChild title="Editar">
          <Link href={`/marketing/notas/${n.id}`}>
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
