"use client"

import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CalendarClock, CheckCircle2, Inbox, XCircle } from "lucide-react"

import { ErrorState, LoadingState } from "@/components/ui/states"
import { AvatarAgente, PildoraEstado, relativo } from "@/components/agentes/comun"
import { consultaDeFicha, consultaDelEquipo } from "@/components/agentes/consultas"
import { mensajeError } from "@/lib/admin/query"
import { AGENTES, cuandoCorre, proximaCorrida, slugDeAgente, type ResumenAgente } from "@/lib/agentes"
import { cn } from "@/lib/utils"

/**
 * El equipo de agentes: una tarjeta por cada uno, con su cara, si está
 * trabajando y cuánto espera tu decisión. La tarjeta entera lleva a su ficha.
 */
export function Equipo() {
  const query = useQuery(consultaDelEquipo())

  if (query.isPending) return <LoadingState label="Llamando al equipo" />
  if (query.isError) return <ErrorState message={mensajeError(query.error)} onRetry={() => query.refetch()} />

  const equipo = query.data.equipo
  const pendientes = equipo.reduce((s, a) => s + a.pendientes, 0)
  const conPendientes = equipo.filter((a) => a.pendientes > 0)

  return (
    <div className="space-y-8">
      {/* La bandeja: lo único que pide algo de vos. */}
      <section
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4",
          pendientes ? "border-brand-200 bg-brand-50/60" : "border-line bg-surface"
        )}
      >
        <div className="flex -space-x-3">
          {equipo.map((a) => (
            <AvatarAgente key={a.clave} ficha={AGENTES[a.clave]} tamano={40} className="rounded-full ring-2 ring-white" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">
            {pendientes
              ? `${pendientes} ${pendientes === 1 ? "propuesta espera" : "propuestas esperan"} tu decisión`
              : "Estás al día con el equipo"}
          </p>
          <p className="text-[12.5px] text-ink-muted">
            {pendientes
              ? conPendientes.map((a) => `${AGENTES[a.clave].apodo} (${a.pendientes})`).join(" · ")
              : "Cuando un agente entregue algo nuevo, aparece acá."}
          </p>
        </div>
        {conPendientes[0] && (
          <Link
            href={`/agentes/${slugDeAgente(conPendientes[0].clave)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-e1 transition-colors hover:bg-brand-700"
          >
            <Inbox className="h-4 w-4" /> Revisar
          </Link>
        )}
      </section>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {equipo.map((a) => (
          <TarjetaAgente key={a.clave} resumen={a} />
        ))}
      </div>
    </div>
  )
}

function TarjetaAgente({ resumen: r }: { resumen: ResumenAgente }) {
  const qc = useQueryClient()
  const ficha = AGENTES[r.clave]
  const proxima = proximaCorrida(ficha)
  // La ficha se pide al pasar el mouse: el clic llega con la bandeja cargada.
  const precargar = () => void qc.prefetchQuery(consultaDeFicha(r.clave))

  return (
    <Link
      href={`/agentes/${slugDeAgente(r.clave)}`}
      onMouseEnter={precargar}
      onFocus={precargar}
      className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
    >
      <div className={cn("relative flex h-56 items-end justify-center overflow-hidden", ficha.tema.fondo)}>
        <AvatarAgente
          ficha={ficha}
          tamano={224}
          prioridad
          className="ring-0 transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
        <PildoraEstado estado={r.estado} className="absolute left-3 top-3" />
        {r.pendientes > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white shadow-e2">
            {r.pendientes} por revisar
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-ink">{ficha.apodo}</h2>
          <ArrowRight className="h-4 w-4 -translate-x-1 text-ink-faint opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
        <p className={cn("text-[12px] font-semibold", ficha.tema.texto)}>{ficha.nombre}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{ficha.rol}</p>

        <div className="mt-auto space-y-1.5 border-t border-line pt-4 text-[12px]">
          <p className="flex items-center gap-1.5 text-ink-secondary">
            <CalendarClock className="h-3.5 w-3.5 text-ink-faint" />
            {cuandoCorre(ficha)} <span className="text-ink-faint">· {relativo(proxima)}</span>
          </p>
          {r.ultimaCorrida ? (
            <p className={cn("flex items-center gap-1.5", r.ultimaCorrida.ok ? "text-ink-muted" : "text-danger-text")}>
              {r.ultimaCorrida.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span className="truncate">
                {r.ultimaCorrida.ok ? "Corrió" : "Falló"} {relativo(r.ultimaCorrida.inicio)}
              </span>
            </p>
          ) : (
            <p className="text-ink-faint">Todavía no corrió</p>
          )}
        </div>
      </div>
    </Link>
  )
}
