"use client"

import { useState } from "react"
import { Clock, ExternalLink, Eye, LogOut, Repeat } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { BarraCelda, Permanencia } from "@/components/marketing/resultados-graficos"
import { duracion, porcentaje, type FilaPagina, type Resultados } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

const SITIO = "https://www.accedra.com.ar"

type Orden = "vistas" | "visitantes" | "segundos" | "salidas" | "leads"

const ORDENES: { clave: Orden; label: string }[] = [
  { clave: "vistas", label: "Vistas" },
  { clave: "visitantes", label: "Personas" },
  { clave: "segundos", label: "Permanencia" },
  { clave: "salidas", label: "Salidas" },
  { clave: "leads", label: "Consultas" },
]

/**
 * Qué páginas se miran, cuánto y con qué resultado.
 *
 * ── LAS DOS COLUMNAS QUE RECIEN EMPIEZAN ──
 *
 * Hasta el 13/9/2026 la permanencia se deducía restando una vista de la
 * siguiente, con lo cual la última página de cada visita quedaba sin medir. Con
 * un 80% de visitas de una sola página, eso era no medir casi nada. Desde
 * entonces el sitio emite un evento al dejar de mirar la página, con el tiempo
 * que estuvo **visible** y hasta dónde se scrolleó.
 *
 * Los datos viejos siguen valiendo —la función de la base usa la medición nueva
 * cuando existe y la resta cuando no—, pero `scroll` sólo puede llenarse hacia
 * adelante. Mientras esté vacío se dice en pantalla, en vez de mostrar un guion
 * que cualquiera leería como "esta página no se lee".
 */
export function ResultadosPaginas({ datos }: { datos: Resultados }) {
  const [orden, setOrden] = useState<Orden>("vistas")
  const t = datos.sitio.totales

  const paginas = [...datos.sitio.paginas].sort((a, b) => b[orden] - a[orden])
  // La barra de la columna Vistas siempre se escala contra la página más vista,
  // pase lo que pase con el orden. Si el máximo cambiara al reordenar, la misma
  // página cambiaría de ancho sin que sus números cambien.
  const maxVistas = Math.max(1, ...paginas.map((p) => p.vistas))

  const midiendoScroll = t.con_scroll > 0
  const midiendoVisitantes = t.visitantes > 0

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vistas de página"
          value={t.vistas.toLocaleString("es-AR")}
          icon={Eye}
          tone="brand"
          hint={`${t.sesiones.toLocaleString("es-AR")} visitas · ${
            t.sesiones ? (t.vistas / t.sesiones).toFixed(1) : "0"
          } páginas cada una`}
        />
        <StatCard
          label="Se van en la primera"
          value={porcentaje(t.rebotes, t.sesiones, 1)}
          icon={LogOut}
          tone={t.sesiones && t.rebotes / t.sesiones > 0.7 ? "danger" : "neutral"}
          hint={`${t.rebotes.toLocaleString("es-AR")} de ${t.sesiones.toLocaleString("es-AR")} visitas`}
        />
        <StatCard
          label="Permanencia media"
          value={duracion(t.permanencia_media)}
          icon={Clock}
          tone="neutral"
          hint={midiendoScroll ? "Medida en el navegador" : "Estimada entre vistas"}
        />
        <StatCard
          label="Visitantes distintos"
          value={midiendoVisitantes ? t.visitantes.toLocaleString("es-AR") : "midiendo"}
          icon={Repeat}
          tone={midiendoVisitantes ? "neutral" : "warning"}
          hint={
            midiendoVisitantes
              ? `${t.sesiones_sin_visitante.toLocaleString("es-AR")} visitas sin identificar`
              : "Empieza a contarse desde el 13 de septiembre"
          }
        />
      </div>

      <section className="panel">
        <div className="panel-header flex-wrap gap-2">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Páginas</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-ink-subtle">Ordenar por</span>
            {ORDENES.map((o) => (
              <button
                key={o.clave}
                type="button"
                onClick={() => setOrden(o.clave)}
                aria-pressed={orden === o.clave}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
                  orden === o.clave
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line-strong bg-surface text-ink-secondary hover:border-brand-200 hover:bg-brand-50"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-subtle">
                <th className="eyebrow px-3 py-2 text-left">Página</th>
                <th className="eyebrow px-3 py-2 text-right">Vistas</th>
                <th className="eyebrow px-3 py-2 text-right">Personas</th>
                <th className="eyebrow px-3 py-2 text-right">Permanencia</th>
                <th className="eyebrow px-3 py-2 text-right">Salen acá</th>
                <th className="eyebrow px-3 py-2 text-right">Scroll</th>
                <th className="eyebrow px-3 py-2 text-right">Consultas</th>
              </tr>
            </thead>
            <tbody>
              {paginas.map((p) => (
                <FilaDePagina key={p.path} p={p} maxVistas={maxVistas} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!midiendoScroll && (
        <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px] text-ink-muted shadow-e1">
          <p>
            <strong className="font-semibold text-ink">Scroll y visitantes recurrentes empiezan a llenarse ahora.</strong> El
            sitio los mide desde el deploy del 13 de septiembre de 2026 y no se pueden reconstruir hacia atrás: nadie guardó
            hasta dónde leyó alguien en agosto.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li className="mt-1">
              <strong className="font-medium text-ink-secondary">Scroll</strong> — en una landing larga es la diferencia entre
              «la leyó» y «se fue en el encabezado». Es lo que va a explicar por qué una página con dos minutos de permanencia no
              convierte.
            </li>
            <li className="mt-1">
              <strong className="font-medium text-ink-secondary">Visitantes distintos</strong> — cada navegador tiene ahora un
              identificador que no vence, así que tres visitas de la misma persona dejan de contarse como tres personas. Con eso
              se puede medir cuántas veces vuelve alguien antes de dejar el mail, que en B2B casi nunca es una sola.
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

function FilaDePagina({ p, maxVistas }: { p: FilaPagina; maxVistas: number }) {
  const tasaSalida = p.vistas ? p.salidas / p.vistas : 0
  // Una página con tráfico real que expulsa a casi todos y no deja nada es un
  // problema; una con tres visitas no dice nada todavía.
  const fuga = p.vistas >= 20 && tasaSalida > 0.6 && p.leads === 0

  return (
    <tr className="border-b border-line-soft last:border-0 hover:bg-brand-50">
      <td className="px-3 py-2">
        <a
          href={`${SITIO}${p.path}`}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1.5 font-mono text-[11.5px] text-ink-secondary hover:text-brand-700"
        >
          {p.path}
          <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </a>
      </td>
      <td className="px-3 py-2 text-right">
        <BarraCelda valor={p.vistas} maximo={maxVistas} />
      </td>
      <td className="num px-3 py-2 text-right text-ink-muted">{p.visitantes.toLocaleString("es-AR")}</td>
      <td className="px-3 py-2 text-right">
        <Permanencia segundos={p.segundos} />
      </td>
      <td className="num px-3 py-2 text-right">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-ink-muted">{p.salidas}</span>
          {fuga ? (
            <Badge tone="danger">{Math.round(tasaSalida * 100)}%</Badge>
          ) : (
            <span className="text-ink-faint">({Math.round(tasaSalida * 100)}%)</span>
          )}
        </span>
      </td>
      <td className="num px-3 py-2 text-right">
        {p.scroll === null ? <span className="text-ink-faint">—</span> : <span>{Math.round(p.scroll)}%</span>}
      </td>
      <td className="num px-3 py-2 text-right">
        {p.leads ? <Badge tone="brand">{p.leads}</Badge> : <span className="text-ink-faint">0</span>}
      </td>
    </tr>
  )
}
