"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Info,
  Lightbulb,
  Receipt,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { StatCard } from "@/components/ui/stat-card"
import { claveDe, pedirJson } from "@/lib/admin/query"
import type { ResultadosLinkedin } from "@/lib/marketing/linkedin"
import {
  armarRadiografia,
  CANAL_COLOR,
  CANAL_LABEL,
  CANALES,
  type Canal,
  type Etapa,
  type Hallazgo,
  type Salud,
} from "@/lib/marketing/radiografia"
import type { Red, ResultadosRed } from "@/lib/marketing/redes"
import { PERIODO_DIAS, pesos, porcentaje, variacion, type Periodo, type Resultados } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

/**
 * La primera hoja de Resultados: un embudo con todos los canales y qué dice.
 *
 * Trae LinkedIn, Instagram y Facebook con las mismas claves de caché que sus
 * pestañas en Avanzado, así que abrir una después no vuelve a pedir nada. Si una
 * red falla o no está conectada, el embudo se arma igual sin ella y lo avisa:
 * una red caída no puede dejar sin radiografía al resto.
 */
export function ResultadosRadiografia({ datos, periodo }: { datos: Resultados; periodo: Periodo }) {
  const linkedin = useFuente<ResultadosLinkedin>(`/api/marketing/linkedin?periodo=${periodo}`)
  const instagram = useFuente<ResultadosRed>(urlRed("instagram", periodo))
  const facebook = useFuente<ResultadosRed>(urlRed("facebook", periodo))
  const cargandoRedes = linkedin.isPending || instagram.isPending || facebook.isPending

  const rx = useMemo(
    () =>
      armarRadiografia({
        resultados: datos,
        dias: PERIODO_DIAS[periodo],
        linkedin: linkedin.data ?? null,
        instagram: instagram.data ?? null,
        facebook: facebook.data ?? null,
      }),
    [datos, periodo, linkedin.data, instagram.data, facebook.data]
  )

  const t = datos.sitio.totales
  const prev = datos.anterior
  const contactos = t.leads_reales + t.contactos_directos
  const contactosAntes = prev ? prev.leads_reales + prev.contactos_directos : null

  return (
    <div className="flex flex-col gap-5">
      <Diagnostico cuello={rx.cuello} otros={rx.otros} buenos={rx.buenos} />

      {/* ── Lo esencial ──────────────────────────────────────────────────── */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invertido en Google Ads"
          value={pesos(rx.gasto)}
          icon={Wallet}
          tone="brand"
          hint={`${datos.ads.campanas.filter((c) => c.coste > 0).length} campañas con gasto`}
        />
        <StatCard
          label="Contactos"
          value={contactos.toLocaleString("es-AR")}
          icon={Users}
          tone={contactos === 0 ? "danger" : "neutral"}
          hint={
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <Cambio ahora={contactos} antes={contactosAntes} />
              <span className="text-ink-faint">
                {t.leads_reales} por mail · {t.contactos_directos} por WhatsApp o teléfono
              </span>
            </span>
          }
        />
        <StatCard
          label="Costo por contacto de Ads"
          value={rx.contactosAds ? pesos(rx.gasto / rx.contactosAds) : "—"}
          icon={Receipt}
          tone="neutral"
          hint={rx.contactosAds ? `${rx.contactosAds} contactos traídos por anuncios` : "Ningún contacto vino de un anuncio"}
        />
        <StatCard
          label="Clientes nuevos"
          value={t.ganados}
          icon={Trophy}
          tone={t.ganados ? "success" : "neutral"}
          hint={t.ganados ? pesos(t.monto_ganado) : "Ninguna consulta marcada como ganada"}
        />
      </div>

      {/* ── El embudo ────────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header flex-wrap gap-y-2">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">El recorrido completo</h3>
            <p className="text-[11.5px] text-ink-subtle">
              De cada paso, cuánta gente sigue al siguiente, y de qué canal viene
              {cargandoRedes && " · cargando redes…"}
            </p>
          </div>
          <Leyenda />
        </div>
        <div className="p-4">
          <EmbudoCompleto etapas={rx.etapas} />
        </div>
      </section>

      {/* ── Por canal ────────────────────────────────────────────────────── */}
      <TablaCanales filas={rx.canales} />

      {rx.avisos.length > 0 && (
        <section className="rounded-xl border border-dashed border-line-strong bg-surface-subtle p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Qué falta medir
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
            {rx.avisos.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function urlRed(red: Red, periodo: Periodo) {
  return `/api/marketing/redes?red=${red}&periodo=${periodo}`
}

function useFuente<T>(url: string) {
  return useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<T>(url, { signal }),
    staleTime: 60_000,
    // Una red sin conectar contesta error siempre: reintentar sólo demora el embudo.
    retry: false,
  })
}

/* ── Salud ────────────────────────────────────────────────────────────────── */

const SALUD: Record<Salud, { label: string; icon: LucideIcon; clase: string }> = {
  bien: { label: "Bien", icon: CheckCircle2, clase: "border-success-line bg-success-soft text-success-text" },
  flojo: { label: "Flojo", icon: AlertTriangle, clase: "border-warning-line bg-warning-soft text-warning-text" },
  mal: { label: "Problema", icon: CircleAlert, clase: "border-danger-line bg-danger-soft text-danger-text" },
  poco: { label: "Pocos datos", icon: CircleDashed, clase: "border-line bg-surface-muted text-ink-muted" },
  "sin-datos": { label: "Sin datos", icon: CircleDashed, clase: "border-line bg-surface-muted text-ink-faint" },
}

function PastillaSalud({ salud }: { salud: Salud }) {
  const s = SALUD[salud]
  const Icon = s.icon
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] text-[10.5px] font-semibold", s.clase)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}

function Cambio({ ahora, antes }: { ahora: number; antes: number | null }) {
  const v = variacion(ahora, antes)
  if (v === null) return null
  if (Math.abs(v) < 0.5) return <span className="text-ink-faint">igual que antes</span>
  return (
    <span className={cn("num", v > 0 ? "text-success-text" : "text-danger-text")}>
      {v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}% vs. período anterior
    </span>
  )
}

/* ── Diagnóstico ──────────────────────────────────────────────────────────── */

function Diagnostico({ cuello, otros, buenos }: { cuello: Hallazgo | null; otros: Hallazgo[]; buenos: string[] }) {
  const tono = cuello?.salud === "mal" ? "danger" : cuello ? "warning" : "success"

  return (
    <section
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        tono === "danger" && "border-danger-line bg-danger-soft",
        tono === "warning" && "border-warning-line bg-warning-soft",
        tono === "success" && "border-success-line bg-success-soft"
      )}
    >
      <p className="eyebrow mb-1.5">Diagnóstico del período</p>
      {cuello ? (
        <>
          <h2
            className={cn(
              "text-[16px] font-semibold tracking-[-0.015em]",
              tono === "danger" ? "text-danger-text" : "text-warning-text"
            )}
          >
            {cuello.titulo}
          </h2>
          <p className="mt-1.5 max-w-[88ch] text-[13px] text-ink-secondary">{cuello.porque}</p>
          <p className="mt-3 flex max-w-[88ch] items-start gap-2 rounded-lg bg-surface/70 px-3 py-2 text-[12.5px] text-ink">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
            <span>
              <span className="font-semibold">Qué hacer: </span>
              {cuello.accion}
            </span>
          </p>
        </>
      ) : (
        <>
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-success-text">
            Ningún paso del embudo está por debajo de lo esperable
          </h2>
          <p className="mt-1.5 max-w-[88ch] text-[13px] text-ink-secondary">
            Con los datos que hay, el recorrido funciona. El próximo paso es escalar: más presupuesto en lo que ya convierte.
          </p>
        </>
      )}

      {(otros.length > 0 || buenos.length > 0) && (
        <div className="mt-4 grid gap-4 border-t border-dashed border-line-strong pt-3 lg:grid-cols-2">
          {otros.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">También hay que mirar</p>
              <ul className="flex flex-col gap-1.5">
                {otros.map((h) => (
                  <li key={h.titulo} className="flex items-start gap-2 text-[12.5px] text-ink-secondary">
                    <PastillaSalud salud={h.salud} />
                    <span>
                      <span className="font-medium text-ink">{h.titulo}.</span> {h.accion}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {buenos.length > 0 && (
            <div>
              <p className="eyebrow mb-1.5">Lo que anda bien</p>
              <ul className="flex flex-col gap-1">
                {buenos.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-[12.5px] text-ink-secondary">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ── El embudo ────────────────────────────────────────────────────────────── */

function Leyenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-ink-muted">
      {CANALES.map((c) => (
        <li key={c} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: CANAL_COLOR[c] }} />
          {CANAL_LABEL[c]}
        </li>
      ))}
    </ul>
  )
}

/** Ancho de cada escalón, en % del ancho disponible. */
const ANCHOS = [100, 84, 68, 52, 38, 28]

/**
 * El embudo, como trapecios apilados.
 *
 * ── POR QUE EL ANCHO NO MIDE LA CANTIDAD ──
 *
 * Por lo mismo que el embudo de barras de `resultados-graficos`: de miles de
 * vistas a un puñado de clientes, una escala lineal deja los tres últimos pasos
 * en un píxel. Acá el ancho es la forma de embudo, fija; lo que mide es lo de
 * adentro —la proporción de cada canal en ese paso— y la cifra al costado. Lo
 * que importa, cuánto sigue de un paso al otro, va escrito entre escalones con
 * su semáforo.
 */
function EmbudoCompleto({ etapas }: { etapas: Etapa[] }) {
  const [foco, setFoco] = useState<{ etapa: string; canal: Canal } | null>(null)

  return (
    <div className="flex flex-col">
      {etapas.map((e, i) => {
        const arriba = ANCHOS[i]
        const abajo = ANCHOS[i + 1]
        // Cuánto se angosta, medido sobre el ancho propio del escalón.
        const sesgo = ((arriba - abajo) / 2 / arriba) * 100
        const enFoco = foco?.etapa === e.clave ? foco.canal : null
        const partes = CANALES.filter((c) => e.partes[c] > 0)

        return (
          <div key={e.clave}>
            {e.paso && <Conector texto={e.paso.texto} salud={e.salud} />}

            <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[170px_minmax(0,1fr)_minmax(200px,280px)]">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{e.titulo}</p>
                <p className="text-[11px] text-ink-faint">{e.pregunta}</p>
              </div>

              <div className="flex justify-center">
                <div
                  className={cn("flex h-[46px] gap-[2px] overflow-hidden", !e.total && "bg-surface-sunken")}
                  style={{
                    width: `${arriba}%`,
                    clipPath: `polygon(0 0, 100% 0, ${100 - sesgo}% 100%, ${sesgo}% 100%)`,
                  }}
                >
                  {partes.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${CANAL_LABEL[c]}: ${e.partes[c].toLocaleString("es-AR")}`}
                      onMouseEnter={() => setFoco({ etapa: e.clave, canal: c })}
                      onMouseLeave={() => setFoco(null)}
                      onFocus={() => setFoco({ etapa: e.clave, canal: c })}
                      onBlur={() => setFoco(null)}
                      className="h-full min-w-[3px] transition-opacity focus:outline-none"
                      style={{
                        flexGrow: e.partes[c],
                        flexBasis: 0,
                        background: CANAL_COLOR[c],
                        opacity: enFoco && enFoco !== c ? 0.35 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={cn("num text-[19px] font-bold leading-none", e.total === 0 ? "text-danger-text" : "text-ink")}>
                    {e.total.toLocaleString("es-AR")}
                  </span>
                  <PastillaSalud salud={e.salud} />
                </div>
                <p className="mt-1 min-h-[16px] text-[11.5px] text-ink-muted">
                  {enFoco ? (
                    <>
                      <span className="font-medium text-ink">{CANAL_LABEL[enFoco]}</span>:{" "}
                      <span className="num">{e.partes[enFoco].toLocaleString("es-AR")}</span> ·{" "}
                      {porcentaje(e.partes[enFoco], e.total, 0)} del paso
                    </>
                  ) : (
                    (e.evaluaciones.find((ev) => ev.salud === e.salud)?.texto ?? "Sin datos de este paso")
                  )}
                </p>
              </div>
            </div>

            {e.evaluaciones.length > 1 && (
              <ul className="mb-1 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 md:ml-[186px]">
                {e.evaluaciones.map((ev) => (
                  <li key={ev.texto} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <PuntoSalud salud={ev.salud} />
                    {ev.texto}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PuntoSalud({ salud }: { salud: Salud }) {
  const Icon = SALUD[salud].icon
  return (
    <Icon
      className={cn(
        "h-3 w-3 shrink-0",
        salud === "bien" && "text-success",
        salud === "flojo" && "text-warning",
        salud === "mal" && "text-danger",
        (salud === "poco" || salud === "sin-datos") && "text-ink-faint"
      )}
      aria-label={SALUD[salud].label}
    />
  )
}

function Conector({ texto, salud }: { texto: string; salud: Salud }) {
  return (
    <div className="grid gap-x-4 py-1.5 md:grid-cols-[170px_minmax(0,1fr)_minmax(200px,280px)]">
      <span className="hidden md:block" />
      <span className="flex justify-center">
      <span
        className={cn(
          "num inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
          SALUD[salud].clase
        )}
      >
        <ArrowDown className="h-3 w-3" />
        {texto}
      </span>
      </span>
    </div>
  )
}

/* ── Por canal ────────────────────────────────────────────────────────────── */

function TablaCanales({ filas }: { filas: ReturnType<typeof armarRadiografia>["canales"] }) {
  if (!filas.length) return null
  const cifra = (v: number | null) =>
    v === null ? <span className="text-ink-faint">—</span> : <span className="num">{v.toLocaleString("es-AR")}</span>

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Cómo rinde cada canal</h3>
        <span className="text-[11.5px] text-ink-subtle">Las mismas cifras del embudo, por fila</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-surface-subtle">
              <th className="eyebrow px-3 py-2 text-left">Canal</th>
              <th className="eyebrow px-3 py-2 text-right">Vistas</th>
              <th className="eyebrow px-3 py-2 text-right">Interés</th>
              <th className="eyebrow px-3 py-2 text-right">Visitas</th>
              <th className="eyebrow px-3 py-2 text-right">Contactos</th>
              <th className="eyebrow px-3 py-2 text-right">Visita → contacto</th>
              <th className="eyebrow px-3 py-2 text-right">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.canal} className="border-b border-line-soft last:border-0 hover:bg-brand-50">
                <td className="px-3 py-2 font-medium text-ink">
                  <span className="inline-flex items-center gap-2">
                    <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: CANAL_COLOR[f.canal] }} />
                    {CANAL_LABEL[f.canal]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{cifra(f.vistas)}</td>
                <td className="px-3 py-2 text-right">{cifra(f.interes)}</td>
                <td className="px-3 py-2 text-right">{cifra(f.visitas)}</td>
                <td className="px-3 py-2 text-right">{cifra(f.contactos)}</td>
                <td className="num px-3 py-2 text-right text-ink-muted">
                  {f.visitas ? porcentaje(f.contactos, f.visitas) : <span className="text-ink-faint">—</span>}
                </td>
                <td className="px-3 py-2 text-right">{cifra(f.clientes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-dashed border-line-strong px-3 py-2.5 text-[11.5px] text-ink-muted">
        Los clics a WhatsApp sólo se saben por canal cuando vienen de un anuncio; el resto queda en “Directo y otros”. Google
        orgánico y directo no tienen vistas ni interés porque no sabemos cuántos nos vieron antes de entrar.
      </p>
    </section>
  )
}
