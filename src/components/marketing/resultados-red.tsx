"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ExternalLink, Eye, Heart, Loader2, Plug, RefreshCw, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { BarraCelda, SerieDiaria } from "@/components/marketing/resultados-graficos"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { diaCorto, momento, variacion } from "@/lib/marketing/linkedin"
import {
  HORAS_PARA_AVISAR,
  RED_LABEL,
  type Red,
  type ResultadosRed,
  type ResumenSincronizacion,
} from "@/lib/marketing/redes"
import { porcentaje, type Periodo } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

const URL_DATOS = "/api/marketing/redes"

/**
 * Instagram o Facebook de Accedra, en el mismo período que el resto del panel.
 *
 * Como en LinkedIn, lo primero es cuándo se actualizó y si salió bien. Acá la
 * carga es automática, así que lo que se vigila es otra cosa: que el cron no
 * esté fallando en silencio por un token vencido o un permiso quitado.
 */
export function ResultadosRedSocial({ red, periodo }: { red: Red; periodo: Periodo }) {
  const url = `${URL_DATOS}?red=${red}&periodo=${periodo}`
  const query = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<ResultadosRed>(url, { signal }),
    staleTime: 60_000,
  })

  if (query.isPending) return <LoadingState label={`Leyendo ${RED_LABEL[red]}…`} />
  if (query.isError)
    return (
      <ErrorState
        message={mensajeError(query.error, `No se pudo cargar ${RED_LABEL[red]}`)}
        onRetry={() => void query.refetch()}
      />
    )

  const d = query.data
  if (!d.cuenta) return <SinConectar red={red} />

  return (
    <div className="flex flex-col gap-5">
      <Estado datos={d} />
      {d.ultimaBuena && <Cuerpo datos={d} />}
    </div>
  )
}

function SinConectar({ red }: { red: Red }) {
  return (
    <section className="panel p-6 text-center">
      <Plug className="mx-auto h-6 w-6 text-ink-faint" />
      <p className="mt-2 text-[15px] font-semibold text-ink">{RED_LABEL[red]} todavía no está conectado</p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-muted">
        Falta autorizar la cuenta de Accedra en Meta. Una vez conectada, las métricas se traen solas todos los días.
      </p>
    </section>
  )
}

/* ── Última actualización ─────────────────────────────────────────────────── */

function Estado({ datos }: { datos: ResultadosRed }) {
  const qc = useQueryClient()
  const [corriendo, setCorriendo] = useState(false)
  const u = datos.ultima
  const buena = datos.ultimaBuena
  const horas = buena ? (Date.now() - new Date(buena.corrido_en).getTime()) / 3_600_000 : Infinity
  const problema = !buena || horas >= HORAS_PARA_AVISAR || (u && !u.ok)

  async function actualizar() {
    setCorriendo(true)
    try {
      // Sin `pedirJson`: un 502 acá trae igual el detalle de cada red, que es
      // justo lo que hay que mostrar.
      const res = await fetch(`${URL_DATOS}/sincronizar`, { method: "POST" })
      const r = (await res.json().catch(() => ({ resultados: [] }))) as Partial<ResumenSincronizacion> & { error?: string }
      if (!r.resultados) throw new Error(r.error ?? "No se pudo actualizar")
      const mio = r.resultados.find((x) => x.red === datos.red)
      if (mio?.ok) toast.success(`${RED_LABEL[datos.red]}: ${mio.dias} días y ${mio.publicaciones} publicaciones al día`)
      else toast.error(mio?.detalle ?? "No se pudo actualizar")
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo actualizar"))
    } finally {
      setCorriendo(false)
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "marketing" && String(q.queryKey[2]).startsWith(URL_DATOS),
      })
    }
  }

  return (
    <section className={cn("panel", problema && "border-warning-line")}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="eyebrow">Última actualización</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">
            {buena ? momento(buena.corrido_en) : "Todavía ninguna"}
            <span className="font-normal text-ink-muted">
              {" "}
              · {datos.cuenta?.nombre ? `@${datos.cuenta.nombre}` : RED_LABEL[datos.red]} · automática todos los días
            </span>
          </p>
          {u && !u.ok && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-warning-text">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              El último intento ({momento(u.corrido_en)}) falló: {u.detalle}
            </p>
          )}
          {datos.datosHasta && (
            <p className="mt-1 text-[12px] text-ink-muted">
              <span className="num">Datos hasta el {diaCorto(datos.datosHasta)}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void actualizar()}
          disabled={corriendo}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink-secondary shadow-e1 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
        >
          {corriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar ahora
        </button>
      </div>
    </section>
  )
}

/* ── Números ──────────────────────────────────────────────────────────────── */

function Cuerpo({ datos }: { datos: ResultadosRed }) {
  const t = datos.totales
  const a = datos.anterior
  const esIg = datos.red === "instagram"

  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Vistas" value={t.vistas.toLocaleString("es-AR")} icon={Eye} tone="brand" hint={<Comparacion ahora={t.vistas} antes={a.vistas} />} />
        <StatCard
          label="Cuentas alcanzadas"
          value={t.alcance.toLocaleString("es-AR")}
          icon={Users}
          tone="neutral"
          hint={<Comparacion ahora={t.alcance} antes={a.alcance} extra="suma diaria: una persona cuenta una vez por día" />}
        />
        <StatCard
          label="Interacciones"
          value={t.interacciones.toLocaleString("es-AR")}
          icon={Heart}
          tone="neutral"
          hint={
            esIg ? (
              <>
                {t.me_gusta} me gusta · {t.comentarios} comentarios · {t.compartidos} compartidos · {t.guardados} guardados
              </>
            ) : (
              <Comparacion ahora={t.interacciones} antes={a.interacciones} extra={`${porcentaje(t.interacciones, t.vistas, 1)} de las vistas`} />
            )
          }
        />
        <StatCard
          label="Seguidores"
          value={datos.seguidores?.toLocaleString("es-AR") ?? "—"}
          icon={UserPlus}
          tone="neutral"
          hint={
            <>
              +{t.seguidores_nuevos} en el período
              {t.seguidores_perdidos ? ` · −${t.seguidores_perdidos} dejaron de seguir` : ""}
              {esIg && t.clics_enlace ? ` · ${t.clics_enlace} clics en el perfil` : ""}
              {!esIg && t.visitas_perfil ? ` · ${t.visitas_perfil} visitas a la página` : ""}
            </>
          }
        />
      </div>

      {datos.serie.length > 1 && (
        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Vistas y seguidores nuevos por día</h3>
          </div>
          <div className="p-4">
            <SerieDiaria
              puntos={datos.serie.map((p) => ({ dia: p.dia, sesiones: p.vistas, leads: p.seguidores }))}
              nombres={{ arriba: ["vista", "vistas"], abajo: ["seguidor nuevo", "seguidores nuevos"] }}
            />
          </div>
        </section>
      )}

      <Publicaciones datos={datos} />
    </>
  )
}

function Comparacion({ ahora, antes, extra }: { ahora: number; antes: number; extra?: string }) {
  const v = variacion(ahora, antes)
  return (
    <>
      {v === null ? (
        <span className="text-ink-faint">sin período anterior</span>
      ) : (
        <span className={cn("num font-medium", v >= 0 ? "text-success-text" : "text-danger-text")}>
          {v >= 0 ? "▲" : "▼"} {Math.abs(Math.round(v * 100))}% vs. anterior
        </span>
      )}
      {extra && <> · {extra}</>}
    </>
  )
}

/* ── Publicaciones ────────────────────────────────────────────────────────── */

function Publicaciones({ datos }: { datos: ResultadosRed }) {
  const pubs = datos.publicaciones
  const maxVistas = Math.max(1, ...pubs.map((p) => p.vistas ?? 0))

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Publicaciones del período</h3>
        <span className="num text-[11.5px] text-ink-subtle">{pubs.length}</span>
      </div>
      {pubs.length === 0 ? (
        <p className="p-4 text-[12.5px] text-ink-faint">Ninguna publicación en este período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-subtle">
                <th className="eyebrow px-3 py-2 text-left">Publicación</th>
                <th className="eyebrow px-3 py-2 text-left">Fecha</th>
                <th className="eyebrow px-3 py-2 text-right">Vistas</th>
                <th className="eyebrow px-3 py-2 text-right">Alcance</th>
                <th className="eyebrow px-3 py-2 text-right">Me gusta</th>
                <th className="eyebrow px-3 py-2 text-right">Coment.</th>
                <th className="eyebrow px-3 py-2 text-right">Compart.</th>
                {datos.red === "instagram" && <th className="eyebrow px-3 py-2 text-right">Guard.</th>}
              </tr>
            </thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.id} className="border-b border-line-soft last:border-0 hover:bg-brand-50">
                  <td className="max-w-[420px] px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      {p.miniatura ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura de Meta, URL firmada que vence
                        <img src={p.miniatura} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-md bg-surface-sunken" />
                      )}
                      <div className="min-w-0">
                        <a
                          href={p.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex max-w-full items-center gap-1.5 text-ink-secondary hover:text-brand-700"
                        >
                          <span className="truncate">{p.texto?.split("\n")[0] || "(sin texto)"}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                        {p.tipo && <Badge size="sm" className="mt-0.5">{p.tipo}</Badge>}
                      </div>
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2 text-ink-muted">
                    {p.fecha ? diaCorto(new Date(p.fecha).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.vistas === null ? <span className="text-ink-faint">—</span> : <BarraCelda valor={p.vistas} maximo={maxVistas} />}
                  </td>
                  <Num v={p.alcance} />
                  <Num v={p.me_gusta} />
                  <Num v={p.comentarios} />
                  <Num v={p.compartidos} />
                  {datos.red === "instagram" && <Num v={p.guardados} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Num({ v }: { v: number | null }) {
  return (
    <td className="num px-3 py-2 text-right text-ink-muted">
      {v === null ? <span className="text-ink-faint">—</span> : v.toLocaleString("es-AR")}
    </td>
  )
}
