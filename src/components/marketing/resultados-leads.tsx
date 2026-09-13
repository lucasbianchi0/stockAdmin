"use client"

import { useMemo, useState } from "react"
import { Inbox, Mail, Trophy, UserCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState } from "@/components/ui/states"
import {
  ESTADOS,
  ESTADO_LABEL,
  TIPO_LABEL,
  esEstado,
  esTipoLead,
  pesos,
  type Estado,
  type Lead,
  type Resultados,
  type TipoLead,
} from "@/lib/marketing/resultados"
import { mensajeError } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

type Filtro = TipoLead | "todos"

const FILTROS: { clave: Filtro; label: string }[] = [
  { clave: "todos", label: "Todos" },
  { clave: "contacto", label: "Consultas" },
  { clave: "brochure", label: "Brochures" },
  { clave: "evento", label: "Eventos" },
  { clave: "popup", label: "Popup" },
]

/**
 * La bandeja: la única pantalla del panel donde se escribe.
 *
 * ── POR QUE ESTO NO ES BUROCRACIA ──
 *
 * Todo el resto del panel se calcula solo. El estado y el monto los carga una
 * persona, y son lo que convierte la pantalla en una medición de negocio en vez
 * de un contador de formularios. Sin un lead marcado como ganado con su monto,
 * ninguna de las otras tres pestañas puede responder si la inversión vuelve.
 *
 * Y hay una segunda razón, menos obvia y más cara: sin `closed_at` no hay
 * conversiones offline para subirle a Google, así que Smart Bidding sigue
 * buscando gente que completa formularios en lugar de empresas que firman. Es
 * exactamente lo que dejó esta cuenta con 712.276 ARS gastados y siete
 * conversiones que no vinieron de la web.
 */
export function ResultadosLeads({
  datos,
  alCambiar,
}: {
  datos: Resultados
  alCambiar: (id: string, cambio: Partial<Lead>) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [ocultarEquipo, setOcultarEquipo] = useState(true)

  const { leads } = datos
  const equipo = leads.filter((l) => l.equipo).length
  const reales = leads.length - equipo
  const ganados = leads.filter((l) => !l.equipo && l.estado === "ganado")
  const sinClasificar = leads.filter((l) => !l.equipo && l.estado === "nuevo").length

  const visibles = useMemo(() => {
    return leads.filter((l) => {
      if (ocultarEquipo && l.equipo) return false
      if (filtro !== "todos" && l.tipo !== filtro) return false
      return true
    })
  }, [leads, filtro, ocultarEquipo])

  const conteos = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      if (ocultarEquipo && l.equipo) continue
      m.set(l.tipo, (m.get(l.tipo) ?? 0) + 1)
    }
    return m
  }, [leads, ocultarEquipo])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Consultas de afuera"
          value={reales}
          icon={Mail}
          tone={reales === 0 ? "danger" : "brand"}
          hint="Lo que cuenta como resultado"
        />
        <StatCard
          label="Del propio equipo"
          value={equipo}
          icon={UserCheck}
          tone={equipo > 0 ? "warning" : "neutral"}
          hint={equipo > 0 ? "Descontados de todos los números" : "Ninguno en el período"}
        />
        <StatCard
          label="Ganados"
          value={ganados.length}
          icon={Trophy}
          tone={ganados.length ? "success" : "neutral"}
          hint={ganados.length ? pesos(ganados.reduce((s, l) => s + (l.monto ?? 0), 0)) : "Sin cerrar todavía"}
        />
        <StatCard
          label="Sin clasificar"
          value={sinClasificar}
          icon={Inbox}
          tone={sinClasificar > 0 ? "warning" : "neutral"}
          hint={sinClasificar > 0 ? "Esperan que alguien los mire" : "Todos clasificados"}
        />
      </div>

      <section className="panel">
        <div className="panel-header flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Bandeja</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map((f) => {
              const n = f.clave === "todos" ? visibles.length : (conteos.get(f.clave) ?? 0)
              return (
                <button
                  key={f.clave}
                  type="button"
                  onClick={() => setFiltro(f.clave)}
                  aria-pressed={filtro === f.clave}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
                    filtro === f.clave
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-line-strong bg-surface text-ink-secondary hover:border-brand-200 hover:bg-brand-50"
                  )}
                >
                  {f.label}
                  <span className={cn("num ml-1.5", filtro === f.clave ? "text-white/70" : "text-ink-faint")}>{n}</span>
                </button>
              )
            })}

            <span className="mx-1 h-4 w-px bg-line" aria-hidden />

            <button
              type="button"
              onClick={() => setOcultarEquipo((v) => !v)}
              aria-pressed={ocultarEquipo}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
                ocultarEquipo
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-surface text-ink-secondary hover:border-brand-200 hover:bg-brand-50"
              )}
            >
              Ocultar al equipo
              {equipo > 0 && (
                <span className={cn("num ml-1.5", ocultarEquipo ? "text-white/70" : "text-ink-faint")}>{equipo}</span>
              )}
            </button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title="No hay consultas con estos filtros"
              description={
                equipo > 0 && ocultarEquipo
                  ? `Hay ${equipo} ${equipo === 1 ? "lead" : "leads"} del propio equipo, ocultos. Son pruebas de los formularios, no clientes.`
                  : "En este período no entró ninguna."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-surface-subtle">
                  <th className="eyebrow px-3 py-2 text-left">Fecha</th>
                  <th className="eyebrow px-3 py-2 text-left">Quién</th>
                  <th className="eyebrow px-3 py-2 text-left">Pidió</th>
                  <th className="eyebrow px-3 py-2 text-left">Origen</th>
                  <th className="eyebrow px-3 py-2 text-left">Recorrido antes de escribir</th>
                  <th className="eyebrow px-3 py-2 text-left">Estado</th>
                  <th className="eyebrow px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <FilaLead key={l.id} lead={l} alCambiar={alCambiar} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px] text-ink-muted shadow-e1">
        <p>
          <strong className="font-semibold text-ink">Un minuto por lead, y el panel deja de contar formularios.</strong> Marcar
          ganado o perdido es lo único de esta pantalla que no se puede calcular solo, y es de lo que dependen el costo por
          cliente, el retorno y —sobre todo— las conversiones que se le suben a Google para que aprenda a buscar empresas que
          firman en vez de gente que completa formularios.
        </p>
        <p className="mt-2">
          Los leads del propio equipo se detectan por dirección de mail, no por el navegador: la marca{" "}
          <span className="font-mono text-[11px]">?interno=1</span> depende de que alguien se acuerde de activarla y casi nunca
          pasa. La lista de direcciones se edita en la tabla{" "}
          <span className="font-mono text-[11px]">marketing_equipo</span>.
        </p>
      </div>
    </div>
  )
}

/* ── Una fila ─────────────────────────────────────────────────────────────── */

const TONO_TIPO: Record<TipoLead, "brand" | "success" | "neutral" | "warning"> = {
  contacto: "success",
  brochure: "brand",
  evento: "warning",
  popup: "neutral",
}

function FilaLead({ lead, alCambiar }: { lead: Lead; alCambiar: (id: string, cambio: Partial<Lead>) => void }) {
  const [guardando, setGuardando] = useState(false)
  const [monto, setMonto] = useState(lead.monto === null ? "" : String(lead.monto))

  const tipo = esTipoLead(lead.tipo) ? lead.tipo : "contacto"
  const estado = esEstado(lead.estado) ? lead.estado : "nuevo"

  async function guardar(cambio: Record<string, unknown>, optimista: Partial<Lead>) {
    setGuardando(true)
    const previo = { estado: lead.estado, monto: lead.monto }
    alCambiar(lead.id, optimista)

    try {
      const res = await fetch(`/api/marketing/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(cuerpo.error ?? "No se pudo guardar")
      }
      toast.success("Guardado")
    } catch (e) {
      // Se revierte lo que se había mostrado: dejar el cambio en pantalla
      // después de un fallo es la forma más rápida de que alguien crea que
      // cargó algo que no se guardó.
      alCambiar(lead.id, previo)
      setMonto(previo.monto === null ? "" : String(previo.monto))
      toast.error(mensajeError(e, "No se pudo guardar el cambio"))
    } finally {
      setGuardando(false)
    }
  }

  const fecha = new Date(lead.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })
  const recorrido = lead.recorrido.slice(0, 3)
  const resto = lead.recorrido.length - recorrido.length

  return (
    <tr className={cn("border-b border-line-soft last:border-0 hover:bg-brand-50", lead.equipo && "bg-surface-subtle")}>
      <td className="whitespace-nowrap px-3 py-2 align-top text-ink-faint">{fecha}</td>

      <td className="px-3 py-2 align-top">
        {lead.nombre && <p className="font-semibold text-ink">{lead.nombre}</p>}
        <a
          href={`mailto:${lead.email}`}
          className={cn("font-mono text-[11.5px]", lead.equipo ? "text-ink-faint" : "text-brand-700 hover:underline")}
        >
          {lead.email}
        </a>
        {lead.empresa && <p className="text-[11px] text-ink-faint">{lead.empresa}</p>}
        {lead.equipo && (
          <span className="mt-1 inline-block">
            <Badge tone="warning">Del equipo</Badge>
          </span>
        )}
      </td>

      <td className="px-3 py-2 align-top">
        <Badge tone={TONO_TIPO[tipo]}>{TIPO_LABEL[tipo]}</Badge>
        {lead.detalle && <p className="mt-1 text-[11px] text-ink-faint">{lead.detalle}</p>}
      </td>

      <td className="px-3 py-2 align-top">
        <p className="text-ink-secondary">{lead.origen}</p>
        {lead.campana && <p className="text-[11px] text-ink-faint">{lead.campana}</p>}
        {lead.keyword && <p className="font-mono text-[10.5px] text-ink-faint">{lead.keyword}</p>}
        {lead.pais && lead.pais !== "AR" && <p className="text-[11px] text-ink-faint">Desde {lead.pais}</p>}
      </td>

      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap items-center gap-1">
          {recorrido.map((r, i) => (
            <span key={`${r}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-[10px] text-ink-faint">→</span>}
              <code className="rounded bg-surface-sunken px-1.5 py-px font-mono text-[10.5px] text-ink-muted">{r}</code>
            </span>
          ))}
          {resto > 0 && <span className="text-[10.5px] text-ink-faint">+{resto}</span>}
          {lead.recorrido.length === 0 && <span className="text-[11px] text-ink-faint">Sin recorrido registrado</span>}
        </div>
      </td>

      <td className="px-3 py-2 align-top">
        <select
          value={estado}
          disabled={guardando}
          aria-label={`Estado de ${lead.email}`}
          onChange={(e) => {
            const v = e.target.value
            if (!esEstado(v)) return
            void guardar({ estado: v }, { estado: v })
          }}
          className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-[11.5px] font-medium text-ink-secondary hover:border-brand-200 disabled:opacity-50"
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e as Estado]}
            </option>
          ))}
        </select>
      </td>

      <td className="px-3 py-2 align-top text-right">
        {estado === "ganado" ? (
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={monto}
            disabled={guardando}
            placeholder="0"
            aria-label={`Monto del contrato de ${lead.email}`}
            onChange={(e) => setMonto(e.target.value)}
            onBlur={() => {
              const limpio = monto.trim()
              const n = limpio === "" ? null : Number(limpio)
              if (n !== null && (!Number.isFinite(n) || n < 0)) {
                setMonto(lead.monto === null ? "" : String(lead.monto))
                return
              }
              if (n === lead.monto) return
              void guardar({ monto: n }, { monto: n })
            }}
            className="num w-28 rounded-lg border border-line-strong bg-surface px-2 py-1 text-right text-[12px] text-ink hover:border-brand-200 disabled:opacity-50"
          />
        ) : (
          // El monto sólo existe para lo ganado. Un campo editable en un lead
          // perdido invita a cargar el valor de lo que NO se vendió, y ese
          // número después se suma con el de los ganados sin que nadie lo note.
          <span className="text-ink-faint">—</span>
        )}
      </td>
    </tr>
  )
}
