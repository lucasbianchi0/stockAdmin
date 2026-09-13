"use client"

import { useMemo, useState } from "react"
import { Check, CloudUpload, Download, Inbox, Loader2, Mail, Trophy, UserCheck } from "lucide-react"
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
  recargar,
}: {
  datos: Resultados
  alCambiar: (id: string, cambio: Partial<Lead>) => void
  recargar: () => void
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

      <SubirConversiones conversiones={datos.conversiones} recargar={recargar} />

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
                  <FilaLead key={l.id} lead={l} alCambiar={alCambiar} recargar={recargar} />
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

function FilaLead({
  lead,
  alCambiar,
  recargar,
}: {
  lead: Lead
  alCambiar: (id: string, cambio: Partial<Lead>) => void
  recargar: () => void
}) {
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
      // El retoque optimista de arriba sólo mueve ESTA fila. Los totales del
      // embudo —clientes nuevos, monto ganado, costo por consulta— se calculan
      // en la base, así que sin esto marcabas un lead como ganado y la tarjeta
      // de arriba seguía diciendo cero. Se recarga en segundo plano: la fila ya
      // se ve cambiada y el resto se pone al día solo.
      recargar()
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

/* ── Conversiones ─────────────────────────────────────────────────────────── */

type Revision = {
  /** `false` = Google cerró la subida por API para esta cuenta; va por CSV. */
  viaApi: boolean
  listas: number
  descartadas: number
  rechazadas: { leadId: string; motivo: string }[]
  ids: string[]
}

/**
 * Informarle a Google qué clics terminaron en cliente.
 *
 * ── POR QUE NO ES UN CRON ──
 *
 * Porque la decisión de decirle a Google que un lead vale la tiene que tomar
 * alguien que miró ese lead. Subir automáticamente todo lo que entra es
 * enseñarle a comprar formularios completados, que es exactamente lo que esta
 * vía viene a evitar: acá lo que se informa son CONTRATOS.
 *
 * ── POR QUE SIEMPRE EMPIEZA POR REVISAR ──
 *
 * Dos motivos. Una conversión aceptada por Google no se puede borrar, así que
 * conviene ver cuántas entran antes. Y porque el propio paso de revisar es el
 * que averigua por dónde se puede subir: el 13/9/2026 Google contestó que cerró
 * la subida por API a integraciones nuevas y que esta cuenta no está habilitada,
 * de modo que hoy el camino es el CSV. El día que se habilite, el mismo botón
 * sube directo sin que haya que tocar nada.
 */
function SubirConversiones({
  conversiones,
  recargar,
}: {
  conversiones: Resultados["conversiones"]
  recargar: () => void
}) {
  const [revision, setRevision] = useState<Revision | null>(null)
  const [descargado, setDescargado] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  // Sin cola no hay nada que decidir: la tarjeta no aparece, en vez de mostrar
  // un cero que invita a apretar un botón que no hace nada.
  if (conversiones.pendientes === 0) {
    if (conversiones.subidas === 0) return null
    return (
      <p className="text-[12.5px] text-ink-muted">
        <CloudUpload className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
        {conversiones.subidas} {conversiones.subidas === 1 ? "conversión informada" : "conversiones informadas"} a Google en
        este período. No queda ninguna pendiente.
      </p>
    )
  }

  async function pedir(accion: "revisar" | "subir" | "csv" | "marcar", ids?: string[]) {
    const res = await fetch("/api/marketing/conversiones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, soloGanados: true, ids }),
    })
    const cuerpo = (await res.json()) as Record<string, unknown> & { error?: string }
    if (!res.ok) throw new Error(cuerpo.error ?? "Google no aceptó el pedido")
    return cuerpo
  }

  async function revisar() {
    setOcupado(true)
    try {
      const r = (await pedir("revisar")) as unknown as Revision
      setRevision(r)
      setDescargado(false)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo hablar con Google Ads"))
    } finally {
      setOcupado(false)
    }
  }

  async function subirPorApi() {
    setOcupado(true)
    try {
      const r = (await pedir("subir")) as { subidas?: number }
      toast.success(
        r.subidas
          ? `${r.subidas} ${r.subidas === 1 ? "conversión informada" : "conversiones informadas"} a Google`
          : "No entró ninguna conversión"
      )
      setRevision(null)
      recargar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo subir"))
    } finally {
      setOcupado(false)
    }
  }

  async function bajarCsv() {
    setOcupado(true)
    try {
      const r = (await pedir("csv")) as { csv?: string; ids?: string[] }
      if (!r.csv) throw new Error("Google no devolvió el archivo")

      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `conversiones-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

      setRevision((prev) => (prev ? { ...prev, ids: r.ids ?? prev.ids } : prev))
      setDescargado(true)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo generar el archivo"))
    } finally {
      setOcupado(false)
    }
  }

  /** El sello va acá y no al descargar: bajar el archivo no es haberlo subido. */
  async function confirmarSubido() {
    if (!revision) return
    setOcupado(true)
    try {
      const r = (await pedir("marcar", revision.ids)) as { marcadas?: number }
      toast.success(`${r.marcadas ?? 0} marcadas como informadas`)
      setRevision(null)
      setDescargado(false)
      recargar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudieron marcar"))
    } finally {
      setOcupado(false)
    }
  }

  const porCsv = revision !== null && !revision.viaApi

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-brand-700">
          {conversiones.ganados > 0
            ? `${conversiones.ganados} ${conversiones.ganados === 1 ? "contrato" : "contratos"} sin informarle a Google`
            : `${conversiones.pendientes} ${conversiones.pendientes === 1 ? "consulta" : "consultas"} de Ads sin informar`}
        </p>
        <p className="mt-1 max-w-[78ch] text-[12.5px] text-ink-secondary">
          Se le manda el identificador del clic, el momento y —si se cargó— el monto. Ni nombre, ni mail, ni empresa, ni el
          texto de la consulta. Es lo que le enseña a Google a buscar empresas que firman en vez de gente que completa
          formularios.
        </p>

        {revision && (
          <div className="mt-2.5 rounded-lg border border-line bg-surface p-3 text-[12.5px]">
            <p className="font-medium text-ink">
              {revision.listas} {revision.listas === 1 ? "conversión lista" : "conversiones listas"} para informar
            </p>
            {revision.descartadas > 0 && (
              <p className="mt-0.5 text-ink-muted">
                {revision.descartadas} descartada{revision.descartadas === 1 ? "" : "s"} por ser del propio equipo.
              </p>
            )}
            {revision.rechazadas.length > 0 && (
              <p className="mt-0.5 text-danger-text">
                {revision.rechazadas.length} rechazada{revision.rechazadas.length === 1 ? "" : "s"}:{" "}
                {revision.rechazadas[0].motivo}
              </p>
            )}

            {porCsv && (
              <p className="mt-1.5 text-[11.5px] text-ink-muted">
                Google cerró la subida directa por API a las cuentas nuevas, así que va por archivo:{" "}
                <span className="font-medium text-ink-secondary">
                  Google Ads → Objetivos → Subidas → + → Subir un archivo
                </span>
                . Cuando lo hayas subido, volvé y confirmalo acá para que salgan de la cola.
              </p>
            )}
            {!porCsv && <p className="mt-1.5 text-[11.5px] text-ink-faint">Una vez aceptadas no se pueden deshacer.</p>}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {revision === null && (
          <button type="button" disabled={ocupado} onClick={() => void revisar()} className={BOTON_SUAVE}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
            Revisar antes de informar
          </button>
        )}

        {revision !== null && revision.viaApi && (
          <button
            type="button"
            disabled={ocupado || revision.listas === 0}
            onClick={() => void subirPorApi()}
            className={BOTON_FUERTE}
          >
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
            Subir {revision.listas} a Google
          </button>
        )}

        {porCsv && (
          <>
            <button
              type="button"
              disabled={ocupado || revision.listas === 0}
              onClick={() => void bajarCsv()}
              className={descargado ? BOTON_SUAVE : BOTON_FUERTE}
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {descargado ? "Bajar de nuevo" : `Descargar ${revision.listas}`}
            </button>
            {descargado && (
              <button type="button" disabled={ocupado} onClick={() => void confirmarSubido()} className={BOTON_FUERTE}>
                <Check className="h-3.5 w-3.5" />
                Ya lo subí
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const BOTON_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold shadow-e1 transition-colors disabled:opacity-50"
const BOTON_FUERTE = `${BOTON_BASE} bg-brand-600 text-white hover:bg-brand-700`
const BOTON_SUAVE = `${BOTON_BASE} border border-line-strong bg-surface text-ink-secondary hover:border-brand-200 hover:text-brand-700`
