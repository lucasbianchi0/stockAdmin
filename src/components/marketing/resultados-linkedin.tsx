"use client"

import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MousePointerClick,
  RefreshCw,
  UploadCloud,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/ui/stat-card"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { BarraCelda, MiniBarras, SerieDiaria } from "@/components/marketing/resultados-graficos"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  ANALITICA_LINKEDIN,
  DIAS_PARA_AVISAR,
  TIPOS_CARGA,
  TIPO_CARGA_LABEL,
  diaCorto,
  diasDesde,
  interacciones,
  momento,
  variacion,
  type ResultadosLinkedin,
  type ResumenImportacion,
  type ResumenSincronizacion,
} from "@/lib/marketing/linkedin"
import { porcentaje, type Periodo } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

const URL_DATOS = "/api/marketing/linkedin"

/**
 * La página de Accedra en LinkedIn, en el mismo período que el resto del panel.
 *
 * Arriba de todo va cuándo se cargó y hasta qué día llegan los datos, antes que
 * cualquier número: mientras la carga sea a mano, esa línea es la que dice si
 * lo de abajo se puede leer.
 */
export function ResultadosLinkedin({ periodo }: { periodo: Periodo }) {
  const qc = useQueryClient()
  const url = `${URL_DATOS}?periodo=${periodo}`
  const query = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<ResultadosLinkedin>(url, { signal }),
    staleTime: 60_000,
  })

  // Todos los períodos de LinkedIn y nada más: invalidar el módulo entero
  // volvería a pedirle a Google Ads el panel completo por un archivo de LinkedIn.
  const recargar = () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === "marketing" && String(q.queryKey[2]).startsWith(URL_DATOS),
    })

  if (query.isPending) return <LoadingState label="Leyendo LinkedIn…" />
  if (query.isError)
    return (
      <ErrorState
        message={mensajeError(query.error, "No se pudo cargar LinkedIn")}
        onRetry={() => void query.refetch()}
      />
    )

  const d = query.data
  const nuncaCargado = Object.keys(d.cargas).length === 0

  return (
    <div className="flex flex-col gap-5">
      <EstadoDeCarga datos={d} alImportar={recargar} />
      {nuncaCargado ? null : <Cuerpo datos={d} />}
    </div>
  )
}

/* ── Última carga + importar ──────────────────────────────────────────────── */

function EstadoDeCarga({ datos, alImportar }: { datos: ResultadosLinkedin; alImportar: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [trayendo, setTrayendo] = useState(false)

  const ultima = Object.values(datos.cargas).sort((a, b) => b.cargado_en.localeCompare(a.cargado_en))[0]
  const viejo = ultima ? diasDesde(ultima.cargado_en) >= DIAS_PARA_AVISAR : false

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return
    const form = new FormData()
    for (const a of archivos) form.append("archivo", a)
    setSubiendo(true)
    try {
      const r = await pedirJson<ResumenImportacion>(`${URL_DATOS}/importar`, { method: "POST", body: form })
      toast.success(
        r.archivos
          .map((a) => `${TIPO_CARGA_LABEL[a.tipo]}: ${a.filas} días${a.hasta ? ` hasta el ${diaCorto(a.hasta)}` : ""}`)
          .join(" · ")
      )
      alImportar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo importar"))
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ""
    }
  }

  async function traer() {
    setTrayendo(true)
    try {
      const r = await pedirJson<ResumenSincronizacion>(`${URL_DATOS}/sincronizar`, { method: "POST" })
      const bien = r.partes.filter((p) => p.ok && p.filas > 0)
      const mal = r.partes.filter((p) => !p.ok || p.detalle)
      if (bien.length) {
        toast.success(
          bien
            .map((p) => `${TIPO_CARGA_LABEL[p.tipo]}: ${p.filas} días${p.hasta ? ` hasta el ${diaCorto(p.hasta)}` : ""}`)
            .join(" · ")
        )
      } else if (!mal.length) toast.info("LinkedIn no devolvió datos nuevos")
      for (const p of mal) toast.error(`${TIPO_CARGA_LABEL[p.tipo]}: ${p.detalle ?? "no se pudo traer"}`)
      alImportar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo traer de LinkedIn"))
    } finally {
      setTrayendo(false)
    }
  }

  return (
    <section className={cn("panel", viejo && "border-warning-line")}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="eyebrow">Última carga</p>
          {ultima ? (
            <p className="mt-1 text-[15px] font-semibold text-ink">
              {momento(ultima.cargado_en)}
              {ultima.cargado_por && (
                <span className="font-normal text-ink-muted"> · por {ultima.cargado_por}</span>
              )}
              {viejo && (
                <Badge tone="warning" className="ml-2 align-middle">
                  <AlertTriangle className="h-3 w-3" />
                  hace {diasDesde(ultima.cargado_en)} días
                </Badge>
              )}
            </p>
          ) : (
            <p className="mt-1 text-[15px] font-semibold text-ink">Todavía no se cargó nada</p>
          )}

          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
            {TIPOS_CARGA.map((t) => {
              const hasta = datos.datosHasta[t]
              return (
                <li key={t}>
                  <span className="font-medium text-ink-secondary">{TIPO_CARGA_LABEL[t]}</span>{" "}
                  {hasta ? (
                    <span className="num">datos hasta el {diaCorto(hasta)}</span>
                  ) : (
                    <span className="text-ink-faint">sin cargar</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <input
            ref={input}
            type="file"
            accept=".xls"
            multiple
            className="hidden"
            onChange={(e) => void subir(e.target.files)}
          />
          {datos.automatico ? (
            <>
              <button
                type="button"
                onClick={() => void traer()}
                disabled={trayendo}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white shadow-e1 transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {trayendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar ahora
              </button>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={subiendo}
                className="inline-flex items-center gap-1 text-[11.5px] text-ink-subtle hover:text-brand-700 disabled:opacity-60"
              >
                {subiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
                Importar un .xls igual
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={subiendo}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white shadow-e1 transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Importar de LinkedIn
            </button>
          )}
          <a
            href={ANALITICA_LINKEDIN}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] text-ink-subtle hover:text-brand-700"
          >
            Exportar desde la analítica de la página
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] text-ink-subtle">
        {datos.automatico
          ? "Se actualiza solo todos los días a la mañana desde Windsor.ai. «Actualizar ahora» trae la última semana; las impresiones patrocinadas solo entran con el .xls."
          : "En LinkedIn: Análisis → Contenido, Seguidores y Visitantes → Exportar, con «Últimos 365 días». Se pueden subir los tres juntos; volver a subir el mismo período actualiza los números, no los duplica."}
      </p>
    </section>
  )
}

/* ── Números ──────────────────────────────────────────────────────────────── */

function Cuerpo({ datos }: { datos: ResultadosLinkedin }) {
  const t = datos.totales
  const a = datos.anterior
  const inter = interacciones(t)

  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Impresiones"
          value={t.impresiones.toLocaleString("es-AR")}
          icon={Eye}
          tone="brand"
          hint={<Comparacion ahora={t.impresiones} antes={a.impresiones} extra={pagas(t.impresiones_pagas)} />}
        />
        <StatCard
          label="Interacciones"
          value={inter.toLocaleString("es-AR")}
          icon={Heart}
          tone="neutral"
          hint={
            <>
              {t.reacciones} reacciones · {t.comentarios} comentarios · {t.compartidos} compartidos
              <br />
              Tasa {porcentaje(inter + t.clics, t.impresiones, 1)} (con clics, como la calcula LinkedIn)
            </>
          }
        />
        <StatCard
          label="Clics"
          value={t.clics.toLocaleString("es-AR")}
          icon={MousePointerClick}
          tone="neutral"
          hint={<Comparacion ahora={t.clics} antes={a.clics} extra={`${porcentaje(t.clics, t.impresiones, 1)} de las impresiones`} />}
        />
        <StatCard
          label="Nuevos seguidores"
          value={t.seguidores_nuevos.toLocaleString("es-AR")}
          icon={UserPlus}
          tone="neutral"
          hint={
            <Comparacion
              ahora={t.seguidores_nuevos}
              antes={a.seguidores_nuevos}
              extra={`${t.vistas_pagina.toLocaleString("es-AR")} visitas a la página`}
            />
          }
        />
      </div>

      {datos.serie.length > 1 && (
        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Impresiones y seguidores por día</h3>
          </div>
          <div className="p-4">
            <SerieDiaria
              puntos={datos.serie.map((p) => ({ dia: p.dia, sesiones: p.impresiones, leads: p.seguidores }))}
              nombres={{ arriba: ["impresión", "impresiones"], abajo: ["seguidor nuevo", "seguidores nuevos"] }}
            />
          </div>
        </section>
      )}

      <Publicaciones datos={datos} />

      {datos.demografia.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Quién sigue la página</h3>
            <span className="text-[11.5px] text-ink-subtle">Foto a la fecha de la última carga, no del período</span>
          </div>
          <div className="grid gap-6 p-4 lg:grid-cols-2">
            {datos.demografia.map((dim) => (
              <div key={dim.dimension}>
                <p className="eyebrow mb-2">{dim.dimension}</p>
                <MiniBarras filas={dim.filas.slice(0, 6)} total={dim.total} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function pagas(n: number): string {
  return n ? `${n.toLocaleString("es-AR")} pagas` : "todas orgánicas"
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

function Publicaciones({ datos }: { datos: ResultadosLinkedin }) {
  const pubs = datos.publicaciones
  const maxImpresiones = Math.max(1, ...pubs.map((p) => p.impresiones))
  // La mejor del período por tasa, pero sólo entre las que alguien vio: con 12
  // impresiones, una reacción es un 8% que no quiere decir nada.
  const conAlcance = pubs.filter((p) => p.impresiones >= 50 && p.tasa_interaccion !== null)
  const mejor = conAlcance.sort((x, y) => (y.tasa_interaccion ?? 0) - (x.tasa_interaccion ?? 0))[0]?.url

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Publicaciones del período</h3>
        <span className="num text-[11.5px] text-ink-subtle">{pubs.length}</span>
      </div>

      {pubs.length === 0 ? (
        <p className="p-4 text-[12.5px] text-ink-faint">Ninguna publicación de la página en este período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-subtle">
                <th className="eyebrow px-3 py-2 text-left">Publicación</th>
                <th className="eyebrow px-3 py-2 text-left">Fecha</th>
                <th className="eyebrow px-3 py-2 text-right">Impresiones</th>
                <th className="eyebrow px-3 py-2 text-right">Clics</th>
                <th className="eyebrow px-3 py-2 text-right">Reacciones</th>
                <th className="eyebrow px-3 py-2 text-right">Coment.</th>
                <th className="eyebrow px-3 py-2 text-right">Compart.</th>
                <th className="eyebrow px-3 py-2 text-right">Interacción</th>
              </tr>
            </thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.url} className="border-b border-line-soft last:border-0 hover:bg-brand-50">
                  <td className="max-w-[420px] px-3 py-2">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex max-w-full items-center gap-1.5 text-ink-secondary hover:text-brand-700"
                    >
                      <span className="truncate">{p.titulo ?? "(sin texto)"}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      {p.autor && <span>{p.autor}</span>}
                      {p.contenido && <span>· {p.contenido}</span>}
                      {p.tipo && p.tipo !== "Orgánico" && <Badge tone="brand" size="sm">{p.tipo}</Badge>}
                      {p.url === mejor && <Badge tone="success" size="sm">mejor tasa</Badge>}
                    </p>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2 text-ink-muted">{p.fecha ? diaCorto(p.fecha) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <BarraCelda valor={p.impresiones} maximo={maxImpresiones} />
                  </td>
                  <td className="num px-3 py-2 text-right text-ink-muted">{p.clics}</td>
                  <td className="num px-3 py-2 text-right text-ink-muted">{p.reacciones}</td>
                  <td className="num px-3 py-2 text-right text-ink-muted">{p.comentarios}</td>
                  <td className="num px-3 py-2 text-right text-ink-muted">{p.compartidos}</td>
                  <td className="num px-3 py-2 text-right">
                    {p.tasa_interaccion === null ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      `${(p.tasa_interaccion * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
