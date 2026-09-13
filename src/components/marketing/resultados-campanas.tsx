"use client"

import { AlertTriangle, BarChart3, MousePointerClick, Target, Wallet } from "lucide-react"

import { Badge, Dot } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState } from "@/components/ui/states"
import { MOTIVO_SIN_ADS, pesos, porcentaje, type Resultados } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

/**
 * Campañas de Google Ads.
 *
 * Muestra también las que no gastaron. Una campaña activa en cero es una señal
 * —presupuesto agotado, anuncios rechazados, puja bajo el piso— y esconderla la
 * vuelve invisible justo cuando hay que mirarla. Se atenúan, no se ocultan.
 */
export function ResultadosCampanas({ datos }: { datos: Resultados }) {
  const { ads } = datos
  const campanas = ads.campanas

  const gasto = campanas.reduce((s, c) => s + c.coste, 0)
  const clics = campanas.reduce((s, c) => s + c.clics, 0)
  const impresiones = campanas.reduce((s, c) => s + c.impresiones, 0)
  const conversiones = campanas.reduce((s, c) => s + c.conversiones, 0)
  const activas = campanas.filter((c) => c.estado === "Activa").length

  return (
    <div className="flex flex-col gap-5">
      {/* El fallo de Google va arriba de todo y con qué hacer al respecto: es la
          única fuente de esta pantalla que está afuera y que se cae sola. */}
      {!ads.ok && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-warning-text">{MOTIVO_SIN_ADS[ads.motivo].titulo}</p>
            <p className="mt-1 max-w-[84ch] text-[12.5px] text-ink-secondary">{MOTIVO_SIN_ADS[ads.motivo].ayuda}</p>
            <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{ads.detalle}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Coste" value={pesos(gasto)} icon={Wallet} tone="brand" hint={`${activas} campañas activas`} />
        <StatCard
          label="Clics"
          value={clics.toLocaleString("es-AR")}
          icon={MousePointerClick}
          tone="neutral"
          hint={clics ? `CPC medio ${pesos(gasto / clics)}` : "Sin clics en el período"}
        />
        <StatCard
          label="Impresiones"
          value={impresiones.toLocaleString("es-AR")}
          icon={BarChart3}
          tone="neutral"
          hint={impresiones ? `CTR ${porcentaje(clics, impresiones)}` : "Sin impresiones"}
        />
        <StatCard
          label="Conversiones"
          value={conversiones.toLocaleString("es-AR")}
          icon={Target}
          tone={gasto > 0 && conversiones === 0 ? "danger" : "neutral"}
          hint={gasto > 0 && conversiones === 0 ? "La medición está apagada" : "Según Google"}
        />
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Campañas</h3>
          <span className="text-[11.5px] text-ink-subtle">
            {ads.ok && ads.enVivo ? "En vivo desde la API de Google Ads" : "Desde el cierre mensual guardado"}
          </span>
        </div>

        {campanas.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BarChart3}
              title="No hay campañas para este período"
              description="Ni en vivo ni en el cierre mensual guardado."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-surface-subtle">
                  <th className="eyebrow px-3 py-2 text-left">Campaña</th>
                  <th className="eyebrow px-3 py-2 text-left">Estado</th>
                  <th className="eyebrow px-3 py-2 text-right">Impres.</th>
                  <th className="eyebrow px-3 py-2 text-right">Clics</th>
                  <th className="eyebrow px-3 py-2 text-right">CTR</th>
                  <th className="eyebrow px-3 py-2 text-right">CPC</th>
                  <th className="eyebrow px-3 py-2 text-right">Coste</th>
                  <th className="eyebrow px-3 py-2 text-right">Conv. Google</th>
                  <th className="eyebrow px-3 py-2 text-right">Consultas</th>
                </tr>
              </thead>
              <tbody>
                {campanas.map((c) => {
                  const gasta = c.coste > 0
                  const activa = c.estado === "Activa"
                  return (
                    <tr
                      key={c.id}
                      className={cn("border-b border-line-soft last:border-0 hover:bg-brand-50", !gasta && "text-ink-faint")}
                    >
                      <td className={cn("px-3 py-2", gasta && "font-medium text-ink")}>
                        {c.nombre}
                        <span className="ml-2 text-[11px] text-ink-faint">{c.canal}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={activa ? "success" : "neutral"}>
                          <Dot tone={activa ? "success" : "neutral"} />
                          {c.estado}
                        </Badge>
                      </td>
                      <td className="num px-3 py-2 text-right">{c.impresiones ? c.impresiones.toLocaleString("es-AR") : "—"}</td>
                      <td className="num px-3 py-2 text-right">{c.clics || "—"}</td>
                      <td className="num px-3 py-2 text-right">{c.impresiones ? porcentaje(c.clics, c.impresiones, 2) : "—"}</td>
                      <td className="num px-3 py-2 text-right">{c.clics ? pesos(c.coste / c.clics) : "—"}</td>
                      <td className={cn("num px-3 py-2 text-right", gasta && "font-semibold text-ink")}>
                        {gasta ? pesos(c.coste) : "—"}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {gasta ? (
                          c.conversiones ? (
                            <Badge tone="success">{c.conversiones.toLocaleString("es-AR")}</Badge>
                          ) : (
                            <Badge tone="danger">0</Badge>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {gasta ? (
                          c.leads ? (
                            <Badge tone="brand">{c.leads}</Badge>
                          ) : (
                            <span className="text-ink-faint">0</span>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px] text-ink-muted shadow-e1">
        <p>
          <strong className="font-semibold text-ink">Las dos últimas columnas miden cosas distintas.</strong>{" "}
          <span className="whitespace-nowrap">«Conv. Google»</span> es lo que registra la cuenta de Ads; «Consultas» son leads
          nuestros, contados en esta base. Que la primera esté en cero no significa que no haya pasado nada: significa que Google
          no se está enterando.
        </p>
        <p className="mt-2">
          <strong className="font-semibold text-ink">Por qué «Consultas» puede dar cero aunque el lead venga de Ads.</strong> El
          reparto por campaña necesita <span className="font-mono text-[11px]">utm_campaign</span> en la URL del anuncio, y hoy
          el etiquetado automático de Google manda <span className="font-mono text-[11px]">gclid</span> en vez de UTMs. El total
          de consultas traídas por Ads —el del embudo, en Resumen— sí es exacto. Para poder repartirlo entre campañas hay que
          agregarles UTMs a las URLs finales; el gclid sigue funcionando igual.
        </p>
      </div>
    </div>
  )
}
