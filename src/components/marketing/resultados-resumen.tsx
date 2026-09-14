"use client"

import { ArrowDown, ArrowUp, Receipt, Trophy, Users, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { Embudo, MiniBarras, SerieDiaria, type PasoEmbudo } from "@/components/marketing/resultados-graficos"
import {
  pesos,
  porcentaje,
  variacion,
  type Resultados,
} from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

/* ── Titular ──────────────────────────────────────────────────────────────── */

/** Una frase que resuma el período, para quien no va a leer nada más. */
function titular(r: Resultados): { tono: "danger" | "warning" | "success"; frase: string; detalle: string } {
  const t = r.sitio.totales
  const gasto = r.ads.campanas.reduce((s, c) => s + c.coste, 0)

  const contexto = `${t.sesiones.toLocaleString("es-AR")} visitas al sitio en el período${
    t.de_ads ? `, ${t.de_ads} de ellas traídas por los anuncios` : ""
  }. ${
    t.leads > 0 && t.leads_reales === 0
      ? `${t.leads === 1 ? "El único lead registrado es una dirección" : `Los ${t.leads} leads registrados son direcciones`} del propio equipo.`
      : ""
  } Hubo ${t.contactos_directos} clics a WhatsApp, teléfono o mail: contacto real, pero sin nombre ni dirección.`

  if (t.leads_reales === 0) {
    // Sin consultas, el semáforo nunca puede ser verde — ni siquiera cuando no
    // hubo inversión. Que no se haya gastado no es un logro; es otra situación.
    return gasto > 0
      ? {
          tono: "danger",
          frase: `Gastamos ${pesos(gasto)} y no entró ninguna consulta de afuera`,
          detalle: contexto,
        }
      : {
          tono: "warning",
          frase: "No entró ninguna consulta en el período",
          detalle: `${contexto}${
            gasto === 0 ? " No hay inversión publicitaria registrada para estas fechas." : ""
          }`,
        }
  }

  if (t.leads_reales > 0 && t.ganados === 0) {
    return {
      tono: "warning",
      frase: `${t.leads_reales} ${t.leads_reales === 1 ? "consulta" : "consultas"} y ninguna cerrada todavía`,
      detalle: `Con ${pesos(gasto)} invertidos, el costo por consulta es ${
        t.leads_reales ? pesos(gasto / t.leads_reales) : "—"
      }. Falta marcar cuáles se ganaron y por cuánto: sin eso no se puede saber si la inversión vuelve.`,
    }
  }

  return {
    tono: "success",
    frase: `${t.ganados} ${t.ganados === 1 ? "cliente nuevo" : "clientes nuevos"} en el período`,
    detalle: `${pesos(t.monto_ganado)} en contratos cargados, con ${pesos(gasto)} de inversión publicitaria.`,
  }
}

/* ── Pastilla de variación ────────────────────────────────────────────────── */

function Variacion({ ahora, antes, invertido }: { ahora: number; antes: number | null | undefined; invertido?: boolean }) {
  const v = variacion(ahora, antes)
  if (v === null) return <span className="text-ink-faint">sin comparación</span>

  const sube = v > 0
  // En casi todo, subir es bueno. En rebote y en costo por consulta, al revés.
  const bueno = invertido ? !sube : sube
  if (Math.abs(v) < 0.5) return <span className="text-ink-faint">igual que antes</span>

  return (
    <span className={cn("num inline-flex items-center gap-0.5", bueno ? "text-success-text" : "text-danger-text")}>
      {sube ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(v).toFixed(0)}%
    </span>
  )
}

/* ── La pestaña ───────────────────────────────────────────────────────────── */

export function ResultadosResumen({ datos }: { datos: Resultados }) {
  const t = datos.sitio.totales
  const prev = datos.anterior
  const cabecera = titular(datos)

  const gasto = datos.ads.campanas.reduce((s, c) => s + c.coste, 0)
  const clics = datos.ads.campanas.reduce((s, c) => s + c.clics, 0)
  const impresiones = datos.ads.campanas.reduce((s, c) => s + c.impresiones, 0)

  const embudoAds: PasoEmbudo[] = [
    { titulo: "Impresiones", detalle: "Veces que apareció el anuncio", valor: impresiones },
    { titulo: "Clics", detalle: impresiones ? `CTR ${porcentaje(clics, impresiones)}` : "Sin impresiones", valor: clics },
    { titulo: "Visitas al sitio", detalle: "Cruzadas por gclid", valor: t.de_ads },
    {
      titulo: "Tocaron WhatsApp o teléfono",
      detalle: "Se suben como Contacto directo",
      valor: t.contactos_de_ads ?? 0,
      critico: !t.contactos_de_ads,
    },
    { titulo: "Dejaron el mail", detalle: t.leads_de_ads ? "Consultas atribuidas" : "Ninguna", valor: t.leads_de_ads, critico: true },
  ]

  const embudoSitio: PasoEmbudo[] = [
    { titulo: "Visitas", detalle: "Sin bots ni equipo", valor: t.sesiones },
    { titulo: "Miran más de una página", detalle: `${t.rebotes.toLocaleString("es-AR")} se van en la primera`, valor: t.navegan },
    { titulo: "Clics a WhatsApp o teléfono", detalle: "Contacto sin nombre", valor: t.contactos_directos },
    { titulo: "Dejaron el mail", detalle: t.leads_equipo ? `${t.leads_equipo} más, del equipo` : "Consultas del período", valor: t.leads_reales, critico: t.leads_reales === 0 },
    { titulo: "Se ganaron", detalle: t.monto_ganado ? pesos(t.monto_ganado) : "Sin cerrar todavía", valor: t.ganados, critico: t.ganados === 0 },
  ]

  const maxOrigen = Math.max(1, ...datos.sitio.origenes.map((o) => o.sesiones))

  return (
    <div className="flex flex-col gap-5">
      {/* ── Titular ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          cabecera.tono === "danger" && "border-danger-line bg-danger-soft",
          cabecera.tono === "warning" && "border-warning-line bg-warning-soft",
          cabecera.tono === "success" && "border-success-line bg-success-soft"
        )}
      >
        <span
          className={cn(
            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
            cabecera.tono === "danger" && "bg-danger shadow-[0_0_0_4px_oklch(0.585_0.215_25/.15)]",
            cabecera.tono === "warning" && "bg-warning shadow-[0_0_0_4px_oklch(0.740_0.155_70/.18)]",
            cabecera.tono === "success" && "bg-success shadow-[0_0_0_4px_oklch(0.585_0.140_162/.16)]"
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <h2
            className={cn(
              "text-[14px] font-semibold tracking-[-0.01em]",
              cabecera.tono === "danger" && "text-danger-text",
              cabecera.tono === "warning" && "text-warning-text",
              cabecera.tono === "success" && "text-success-text"
            )}
          >
            {cabecera.frase}
          </h2>
          <p className="mt-1 max-w-[80ch] text-[12.5px] text-ink-secondary">{cabecera.detalle}</p>
        </div>
      </div>

      {/* ── Los cuatro números ───────────────────────────────────────────── */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invertido en Google Ads"
          value={pesos(gasto)}
          icon={Wallet}
          tone="brand"
          hint={`${datos.ads.campanas.filter((c) => c.coste > 0).length} campañas con gasto`}
        />
        <StatCard
          label="Consultas de afuera"
          value={t.leads_reales}
          icon={Users}
          tone={t.leads_reales === 0 ? "danger" : "neutral"}
          hint={
            <span className="inline-flex items-center gap-2">
              <Variacion ahora={t.leads_reales} antes={prev?.leads_reales} />
              {t.leads_equipo > 0 && <span className="text-ink-faint">· {t.leads_equipo} del equipo, descontados</span>}
            </span>
          }
        />
        <StatCard
          label="Costo por consulta"
          value={t.leads_reales ? pesos(gasto / t.leads_reales) : "—"}
          icon={Receipt}
          tone="neutral"
          hint={t.leads_reales ? "Inversión dividida por consultas" : "No se puede calcular sin consultas"}
        />
        <StatCard
          label="Clientes nuevos"
          value={t.ganados}
          icon={Trophy}
          tone={t.ganados === 0 ? "neutral" : "success"}
          hint={t.ganados ? pesos(t.monto_ganado) : "Ningún lead marcado como ganado"}
        />
      </div>

      {/* ── Los dos recorridos ───────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">El recorrido de Google Ads</h3>
            <span className="text-[11.5px] text-ink-subtle">Cuánto sigue de cada paso</span>
          </div>
          <div className="p-4">
            <Embudo pasos={embudoAds} />
            <p className="mt-3 border-t border-dashed border-line-strong pt-3 text-[11.5px] text-ink-muted">
              Las visitas se cruzan por <span className="font-mono text-[11px]">gclid</span>, no por la sesión: quien hace clic
              hoy y vuelve directo en dos semanas convierte en una visita sin <span className="font-mono text-[11px]">gclid</span>,
              y el lead igual lleva la campaña.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">El recorrido del sitio</h3>
            <span className="text-[11.5px] text-ink-subtle">Todos los orígenes</span>
          </div>
          <div className="p-4">
            <Embudo pasos={embudoSitio} />
            <p className="mt-3 border-t border-dashed border-line-strong pt-3 text-[11.5px] text-ink-muted">
              Los clics a WhatsApp y teléfono van como escalón propio: son contacto real, pero no dejan nombre ni dirección, así
              que no se pueden seguir hasta el contrato.
            </p>
          </div>
        </section>
      </div>

      {/* ── Serie ────────────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Visitas y consultas, día a día</h3>
          <span className="flex items-center gap-4 text-[11.5px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[2px] bg-brand-500" />
              Sesiones
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[2px] bg-n-600" />
              Consultas
            </span>
          </span>
        </div>
        <div className="p-4">
          <SerieDiaria puntos={datos.sitio.serie} />
        </div>
      </section>

      {/* ── Orígenes y público ───────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">De dónde llegan</h3>
            <span className="num text-[11.5px] text-ink-subtle">{t.sesiones.toLocaleString("es-AR")} sesiones</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-surface-subtle">
                  <th className="eyebrow px-3 py-2 text-left">Origen</th>
                  <th className="eyebrow px-3 py-2 text-right">Sesiones</th>
                  <th className="eyebrow px-3 py-2 text-right">Consultas</th>
                  <th className="eyebrow px-3 py-2 text-right">Convierte</th>
                </tr>
              </thead>
              <tbody>
                {datos.sitio.origenes.map((o) => (
                  <tr key={o.origen} className="border-b border-line-soft last:border-0 hover:bg-brand-50">
                    <td className="px-3 py-2 font-medium text-ink">{o.origen}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="flex items-center justify-end gap-2">
                        <span
                          className="h-1.5 shrink-0 rounded-full bg-brand-400"
                          style={{ width: `${Math.max(2, (o.sesiones / maxOrigen) * 56)}px` }}
                          aria-hidden
                        />
                        <span className="num">{o.sesiones.toLocaleString("es-AR")}</span>
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {o.leads ? <Badge tone="brand">{o.leads}</Badge> : <span className="text-ink-faint">0</span>}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-muted">
                      {o.leads ? porcentaje(o.leads, o.sesiones, 1) : <span className="text-ink-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Quién entra</h3>
            <span className="text-[11.5px] text-ink-subtle">Dispositivo y país</span>
          </div>
          <div className="p-4">
            <p className="eyebrow mb-2.5">Dispositivo</p>
            <MiniBarras
              filas={datos.sitio.dispositivos}
              total={t.sesiones}
              atenuar={(k) => k === "sin dato"}
            />
            <p className="eyebrow mb-2.5 mt-5">País</p>
            <MiniBarras
              filas={datos.sitio.paises}
              total={t.sesiones}
              atenuar={(k) => k !== "Argentina"}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
