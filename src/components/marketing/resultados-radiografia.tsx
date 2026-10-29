"use client"

import { useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { useQuery } from "@tanstack/react-query"
import { SiFacebook, SiGoogle, SiGoogleads, SiInstagram } from "@icons-pack/react-simple-icons"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Globe2,
  Info,
  Layers,
  Lightbulb,
  Link2,
  Receipt,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { StatCard } from "@/components/ui/stat-card"
import { Preguntar } from "@/components/chatbot/preguntar"
import { renglon, resumen, type Pantalla } from "@/lib/chatbot/pantalla"
import { LinkedInIcon } from "@/components/admin/platform-icons"
import { BarraCelda } from "@/components/marketing/resultados-graficos"
import { claveDe, pedirJson } from "@/lib/admin/query"
import type { ResultadosLinkedin } from "@/lib/marketing/linkedin"
import {
  armarRadiografia,
  CANAL_COLOR,
  CANAL_LABEL,
  CANALES,
  type Canal,
  type Destino,
  type Etapa,
  type ExtraRadiografia,
  type FilaCanal,
  type Hallazgo,
  type Radiografia,
  type Salud,
} from "@/lib/marketing/radiografia"
import type { Red, ResultadosRed } from "@/lib/marketing/redes"
import {
  PERIODO_DIAS,
  PERIODO_LABEL,
  pesos,
  porcentaje,
  variacion,
  type Periodo,
  type Resultados,
} from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

/**
 * La primera hoja de Resultados: un embudo con todos los canales y qué dice.
 *
 * Trae LinkedIn, Instagram y Facebook con las mismas claves de caché que sus
 * pestañas en Avanzado, así que abrir una después no vuelve a pedir nada. El
 * desglose por canal viene aparte (`/radiografia`) porque es más lento. Si una
 * fuente falla o no está conectada, el embudo se arma igual sin ella y lo
 * avisa: una red caída no puede dejar sin radiografía al resto.
 */
export function ResultadosRadiografia({
  datos,
  periodo,
  irA,
}: {
  datos: Resultados
  periodo: Periodo
  /** Abre la pestaña de Avanzado (o Leads) que explica un paso. */
  irA: (destino: Destino) => void
}) {
  const extra = useFuente<ExtraRadiografia>(`/api/marketing/resultados/radiografia?periodo=${periodo}`, 1)
  const linkedin = useFuente<ResultadosLinkedin>(`/api/marketing/linkedin?periodo=${periodo}`)
  const instagram = useFuente<ResultadosRed>(urlRed("instagram", periodo))
  const facebook = useFuente<ResultadosRed>(urlRed("facebook", periodo))
  const [filtro, setFiltro] = useState<Canal | null>(null)
  const cargando = extra.isPending || linkedin.isPending || instagram.isPending || facebook.isPending

  const rx = useMemo(
    () =>
      armarRadiografia({
        resultados: datos,
        dias: PERIODO_DIAS[periodo],
        extra: extra.data ?? null,
        linkedin: linkedin.data ?? null,
        instagram: instagram.data ?? null,
        facebook: facebook.data ?? null,
        filtro,
      }),
    [datos, periodo, extra.data, linkedin.data, instagram.data, facebook.data, filtro]
  )

  const t = datos.sitio.totales
  const { contactos, contactosAntes, clientes, montoGanado } = rx.resumen
  // La inversión sólo es de Ads: con otro canal elegido, esas dos tarjetas no aplican.
  const conGasto = !filtro || filtro === "ads"
  const pantalla = (titulo: string): Pantalla => ({
    titulo: `Resultados · ${titulo}`,
    texto: textoRadiografia(rx, datos, periodo),
  })

  return (
    <div className="flex flex-col gap-5">
      <FiltroCanales filtro={filtro} alElegir={setFiltro} filas={rx.canales} />

      {cargando ? (
        <section className="rounded-xl border border-line bg-surface-subtle p-5 text-[13px] text-ink-muted">
          Armando el diagnóstico con anuncios, redes y el desglose por canal…
        </section>
      ) : (
        <Diagnostico cuello={rx.cuello} otros={rx.otros} buenos={rx.buenos} irA={irA} pantalla={pantalla} />
      )}

      {/* ── Lo esencial ──────────────────────────────────────────────────── */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invertido en Google Ads"
          value={conGasto ? pesos(rx.gasto) : "—"}
          icon={Wallet}
          tone="brand"
          hint={
            !conGasto ? (
              `${CANAL_LABEL[filtro!]} no tiene inversión paga cargada`
            ) : extra.data?.adsAnterior ? (
              <span className="text-ink-faint">
                {pesos(extra.data.adsAnterior.coste)} el período anterior
              </span>
            ) : (
              `${datos.ads.campanas.filter((c) => c.coste > 0).length} campañas con gasto`
            )
          }
        />
        <StatCard
          label="Contactos"
          value={contactos.toLocaleString("es-AR")}
          icon={Users}
          tone={contactos === 0 ? "danger" : "neutral"}
          hint={
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <Cambio ahora={contactos} antes={contactosAntes} />
              {!filtro && (
                <span className="text-ink-faint">
                  {t.leads_reales} por mail · {t.contactos_directos} por WhatsApp o teléfono
                </span>
              )}
            </span>
          }
        />
        <StatCard
          label="Costo por contacto de Ads"
          value={conGasto && rx.contactosAds ? pesos(rx.gasto / rx.contactosAds) : "—"}
          icon={Receipt}
          tone="neutral"
          hint={rx.contactosAds ? `${rx.contactosAds} contactos traídos por anuncios` : "Ningún contacto vino de un anuncio"}
        />
        <StatCard
          label="Clientes nuevos"
          value={clientes}
          icon={Trophy}
          tone={clientes ? "success" : "neutral"}
          hint={
            clientes
              ? `${montoGanado !== null ? pesos(montoGanado) : `${clientes} de ${CANAL_LABEL[filtro!]}`}${
                  conGasto && rx.gasto ? ` · ${pesos(rx.gasto / clientes)} de Ads por cliente` : ""
                }`
              : "Ninguna consulta marcada como ganada"
          }
        />
      </div>

      {/* ── El embudo ────────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header flex-wrap gap-y-2">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">
              {filtro ? `El recorrido de ${CANAL_LABEL[filtro]}` : "El recorrido completo"}
            </h3>
            <p className="text-[11.5px] text-ink-subtle">
              Cuánta gente sigue de un paso al siguiente y de qué canal viene · tocá un paso para ver el detalle
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Leyenda />
            <Preguntar
              agente="marketing"
              pantalla={() => pantalla("El recorrido")}
              pregunta="Mirá el recorrido del período: ¿en qué paso se nos va la gente, por qué puede ser y qué cambiarías primero?"
              ayuda="Le pasa el embudo con cada paso, su tasa y cómo venía antes."
              seguimientos={SEGUIMIENTOS}
            />
          </div>
        </div>
        <div className="p-4">
          <EmbudoCompleto etapas={rx.etapas} irA={irA} />
        </div>
      </section>

      {/* ── Por canal ────────────────────────────────────────────────────── */}
      <TablaCanales
        filas={rx.canales}
        estimado={rx.desglose === "estimado"}
        filtro={filtro}
        preguntar={
          <Preguntar
            agente="marketing"
            pantalla={() => pantalla("Cómo rinde cada canal")}
            pregunta="Compará los canales de este período: ¿cuál trae contactos de verdad, cuál sólo trae visitas y dónde pondrías el próximo peso?"
            ayuda="Le pasa la tabla por canal: vistas, interés, visitas, contactos y clientes."
            seguimientos={SEGUIMIENTOS}
          />
        }
      />

      {extra.data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <PanelGeo extra={extra.data} />
          <PanelChatbots extra={extra.data} total={t.sesiones} />
        </div>
      )}

      {rx.avisos.length > 0 && (
        <section className="rounded-xl border border-dashed border-line-strong bg-surface-subtle p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Qué falta medir o hay que tener en cuenta
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

function useFuente<T>(url: string, reintentos = 0) {
  return useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<T>(url, { signal }),
    staleTime: 60_000,
    // Una red sin conectar contesta error siempre: reintentar sólo demora el embudo.
    retry: reintentos,
  })
}

/* ── Filtro por canal ─────────────────────────────────────────────────────── */

type Glifo = ComponentType<SVGProps<SVGSVGElement> & { color?: string }>

/** El logo de cada canal. Los dos sin marca (chatbots, directo) van con un glifo de lucide. */
const LOGO: Record<Canal, { Icon: Glifo; hex: string }> = {
  ads: { Icon: SiGoogleads as Glifo, hex: "#4285F4" },
  linkedin: { Icon: LinkedInIcon as Glifo, hex: "#0A66C2" },
  instagram: { Icon: SiInstagram as Glifo, hex: "#E4405F" },
  facebook: { Icon: SiFacebook as Glifo, hex: "#0866FF" },
  organico: { Icon: SiGoogle as Glifo, hex: "#4285F4" },
  ia: { Icon: Bot as Glifo, hex: "#10A37F" },
  otros: { Icon: Link2 as Glifo, hex: "currentColor" },
}

/**
 * Una fila de logos para mirar el resumen de un solo canal.
 *
 * El logo va en gris hasta que se elige y recién ahí toma el color de la marca:
 * siete logos de colores en fila compiten con el semáforo del diagnóstico. El
 * cuadradito al lado es el color del canal en el embudo, para que el filtro y
 * el gráfico se lean como la misma cosa.
 */
function FiltroCanales({
  filtro,
  alElegir,
  filas,
}: {
  filtro: Canal | null
  alElegir: (c: Canal | null) => void
  filas: FilaCanal[]
}) {
  const presentes = new Set(filas.map((f) => f.canal))
  const visitas = new Map(filas.map((f) => [f.canal, f.visitas]))

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar el resumen por canal">
      <button
        type="button"
        onClick={() => alElegir(null)}
        aria-pressed={filtro === null}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
          filtro === null
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-line bg-surface text-ink-muted hover:text-ink-secondary"
        )}
      >
        <Layers className="h-3.5 w-3.5" />
        Todos
      </button>
      {CANALES.map((c) => {
        const activo = filtro === c
        const { Icon, hex } = LOGO[c]
        const hay = presentes.has(c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => alElegir(activo ? null : c)}
            aria-pressed={activo}
            disabled={!hay}
            title={hay ? undefined : "Sin datos en el período"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              activo
                ? "border-line-strong bg-surface text-ink shadow-e1"
                : "border-line bg-surface text-ink-muted hover:text-ink-secondary"
            )}
          >
            <Icon className="h-3.5 w-3.5" color={activo ? hex : "currentColor"} style={{ color: activo ? hex : undefined }} />
            {CANAL_LABEL[c]}
            {hay && <span className="num text-[11px] text-ink-faint">{(visitas.get(c) ?? 0).toLocaleString("es-AR")}</span>}
            <i className="ml-0.5 inline-block h-1.5 w-1.5 rounded-[2px]" style={{ background: CANAL_COLOR[c] }} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/* ── Salud ────────────────────────────────────────────────────────────────── */

const SALUD: Record<Salud, { label: string; icon: LucideIcon; clase: string }> = {
  bien: { label: "Bien", icon: CheckCircle2, clase: "border-success-line bg-success-soft text-success-text" },
  flojo: { label: "Flojo", icon: AlertTriangle, clase: "border-warning-line bg-warning-soft text-warning-text" },
  mal: { label: "Problema", icon: CircleAlert, clase: "border-danger-line bg-danger-soft text-danger-text" },
  poco: { label: "Pocos datos", icon: CircleDashed, clase: "border-line bg-surface-muted text-ink-muted" },
  "sin-datos": { label: "Sin datos", icon: CircleDashed, clase: "border-line bg-surface-muted text-ink-faint" },
}

const DESTINO_LABEL: Record<Destino, string> = {
  sitio: "Sitio y Ads",
  campanas: "Campañas",
  paginas: "Páginas",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  leads: "Leads",
}

function PastillaSalud({ salud }: { salud: Salud }) {
  const s = SALUD[salud]
  const Icon = s.icon
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-[3px] text-[10.5px] font-semibold", s.clase)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}

function Cambio({ ahora, antes, corto }: { ahora: number; antes: number | null; corto?: boolean }) {
  const v = variacion(ahora, antes)
  if (v === null) return null
  if (Math.abs(v) < 0.5) return <span className="text-ink-faint">igual que antes</span>
  return (
    <span className={cn("num whitespace-nowrap", v > 0 ? "text-success-text" : "text-danger-text")}>
      {v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%{corto ? "" : " vs. período anterior"}
    </span>
  )
}

/* ── Diagnóstico ──────────────────────────────────────────────────────────── */

function Diagnostico({
  cuello,
  otros,
  buenos,
  irA,
  pantalla,
}: {
  cuello: Hallazgo | null
  otros: Hallazgo[]
  buenos: string[]
  irA: (d: Destino) => void
  pantalla: (titulo: string) => Pantalla
}) {
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
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <p className="eyebrow">Diagnóstico del período</p>
        <Preguntar
          agente="marketing"
          pantalla={() => pantalla("Diagnóstico del período")}
          pregunta={
            cuello
              ? `El diagnóstico dice: "${cuello.titulo}". ¿Qué está pasando, por qué puede ser y qué hago esta semana para revertirlo?`
              : "El diagnóstico no marca nada grave. ¿Qué está funcionando y cómo lo escalo sin romperlo?"
          }
          ayuda="Le pasa el diagnóstico, las cifras clave, el embudo y cada canal del período."
          seguimientos={SEGUIMIENTOS}
          className="-mt-1"
        />
      </div>
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
          <div className="mt-3 flex max-w-[88ch] flex-wrap items-start gap-x-3 gap-y-2 rounded-lg bg-surface/70 px-3 py-2 text-[12.5px] text-ink">
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
              <span>
                <span className="font-semibold">Qué hacer: </span>
                {cuello.accion}
              </span>
            </span>
            <BotonDetalle destino={cuello.destino} irA={irA} />
          </div>
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
              <ul className="flex flex-col gap-2">
                {otros.map((h) => (
                  <li key={h.titulo} className="flex items-start gap-2 text-[12.5px] text-ink-secondary">
                    <PastillaSalud salud={h.salud} />
                    <span>
                      <span className="font-medium text-ink">{h.titulo}.</span> {h.accion}{" "}
                      <button
                        type="button"
                        onClick={() => irA(h.destino)}
                        className="font-medium text-brand-700 underline-offset-2 hover:underline"
                      >
                        Ver {DESTINO_LABEL[h.destino]}
                      </button>
                    </span>
                    <Preguntar
                      compacto
                      agente="marketing"
                      pantalla={() => pantalla(h.titulo)}
                      pregunta={`Sobre esto que marca el diagnóstico: "${h.titulo}". ${h.porque} ¿Qué lo explica y qué haría?`}
                      ayuda="Le pasa este problema con el resto del diagnóstico."
                      seguimientos={SEGUIMIENTOS}
                      className="-mt-0.5 ml-auto h-6 w-6"
                    />
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

function BotonDetalle({ destino, irA }: { destino: Destino; irA: (d: Destino) => void }) {
  return (
    <button
      type="button"
      onClick={() => irA(destino)}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-[11.5px] font-medium text-ink-secondary hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
    >
      Ver {DESTINO_LABEL[destino]}
      <ArrowRight className="h-3 w-3" />
    </button>
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
const COLUMNAS = "md:grid-cols-[170px_minmax(0,1fr)_minmax(220px,300px)]"

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
function EmbudoCompleto({ etapas, irA }: { etapas: Etapa[]; irA: (d: Destino) => void }) {
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

            <div className={cn("grid items-center gap-x-4 gap-y-2", COLUMNAS)}>
              <button type="button" onClick={() => irA(e.destino)} className="group min-w-0 text-left">
                <p className="text-[13px] font-semibold text-ink group-hover:text-brand-700">{e.titulo}</p>
                <p className="text-[11px] text-ink-faint">{e.pregunta}</p>
                <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10.5px] font-medium text-brand-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Ver {DESTINO_LABEL[e.destino]} <ArrowRight className="h-2.5 w-2.5" />
                </p>
              </button>

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
                      onClick={() => irA(e.destino)}
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
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={cn("num text-[19px] font-bold leading-none", e.total === 0 ? "text-danger-text" : "text-ink")}>
                    {e.total.toLocaleString("es-AR")}
                  </span>
                  {/* Un paso con cifra pero sin vara (filtrado a un canal) no lleva pastilla: "Sin datos" mentiría. */}
                  {!(e.salud === "sin-datos" && e.total > 0) && <PastillaSalud salud={e.salud} />}
                  <span className="text-[11px]">
                    <Cambio ahora={e.total} antes={e.antes} corto />
                  </span>
                </div>
                <p className="mt-1 min-h-[16px] text-[11.5px] text-ink-muted">
                  {enFoco ? (
                    <>
                      <span className="font-medium text-ink">{CANAL_LABEL[enFoco]}</span>:{" "}
                      <span className="num">{e.partes[enFoco].toLocaleString("es-AR")}</span> ·{" "}
                      {porcentaje(e.partes[enFoco], e.total, 0)} del paso
                    </>
                  ) : (
                    (e.evaluaciones.find((ev) => ev.salud === e.salud)?.texto ??
                      (e.total > 0 ? "Sin referencia para este paso" : "Sin datos de este paso"))
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
    <div className={cn("grid gap-x-4 py-1.5", COLUMNAS)}>
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

function TablaCanales({
  filas,
  estimado,
  filtro,
  preguntar,
}: {
  filas: FilaCanal[]
  estimado: boolean
  filtro: Canal | null
  preguntar: ReactNode
}) {
  if (!filas.length) return null
  const cifra = (v: number | null) =>
    v === null ? <span className="text-ink-faint">—</span> : <span className="num">{v.toLocaleString("es-AR")}</span>

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Cómo rinde cada canal</h3>
        <span className="flex items-center gap-3">
          <span className="text-[11.5px] text-ink-subtle">Las mismas cifras del embudo, por fila{estimado && " · estimado"}</span>
          {preguntar}
        </span>
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
              <tr
                key={f.canal}
                className={cn(
                  "border-b border-line-soft last:border-0 hover:bg-brand-50",
                  filtro && filtro !== f.canal && "opacity-45",
                  filtro === f.canal && "bg-brand-50/60"
                )}
              >
                <td className="px-3 py-2 font-medium text-ink">
                  <span className="inline-flex items-center gap-2">
                    <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: CANAL_COLOR[f.canal] }} />
                    {CANAL_LABEL[f.canal]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{cifra(f.vistas)}</td>
                <td className="px-3 py-2 text-right">{cifra(f.interes)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    {f.visitasAntes !== null && (
                      <span className="text-[11px]">
                        <Cambio ahora={f.visitas} antes={f.visitasAntes} corto />
                      </span>
                    )}
                    {cifra(f.visitas)}
                  </span>
                </td>
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
        {estimado
          ? "Sin el desglose del servidor, los clics a WhatsApp que no son de Ads quedan en “Directo y otros”. "
          : "Cada visita, WhatsApp y consulta va al canal por el que entró esa visita. "}
        Buscadores, chatbots y directo no tienen vistas ni interés: no sabemos cuántos nos vieron antes de entrar.
      </p>
    </section>
  )
}

/* ── Geo ──────────────────────────────────────────────────────────────────── */

function PanelGeo({ extra }: { extra: ExtraRadiografia }) {
  const { paises, dudosas, exterior } = extra.geo
  const max = Math.max(1, ...paises.map((p) => p.visitas))
  const total = paises.reduce((s, p) => s + p.visitas, 0)

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.015em]">
          <Globe2 className="h-4 w-4 text-ink-muted" /> De dónde entran
        </h3>
        <span className="num text-[11.5px] text-ink-subtle">
          {porcentaje(exterior, total, 0)} del exterior · {dudosas.toLocaleString("es-AR")} dudosas
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-surface-subtle">
              <th className="eyebrow px-3 py-2 text-left">País</th>
              <th className="eyebrow px-3 py-2 text-right">Visitas</th>
              <th className="eyebrow px-3 py-2 text-right">Contactos</th>
              <th className="eyebrow px-3 py-2 text-right">Consultas</th>
            </tr>
          </thead>
          <tbody>
            {paises.map((p) => (
              <tr key={p.pais} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2 font-medium text-ink">{p.pais}</td>
                <td className="px-3 py-2">
                  <BarraCelda valor={p.visitas} maximo={max} tenue={p.pais !== "Argentina"} />
                </td>
                <td className="num px-3 py-2 text-right">{p.contactos || <span className="text-ink-faint">0</span>}</td>
                <td className="num px-3 py-2 text-right">{p.leads || <span className="text-ink-faint">0</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-dashed border-line-strong px-3 py-2.5 text-[11.5px] text-ink-muted">
        “Dudosas” son visitas del exterior sin referente, sin anuncio y sin un gesto medido: casi seguro datacenters. Se
        cuentan en Visitas pero se descuentan de la tasa de conversión, para no culpar a la propuesta por bots.
      </p>
    </section>
  )
}

/* ── Chatbots ─────────────────────────────────────────────────────────────── */

function PanelChatbots({ extra, total }: { extra: ExtraRadiografia; total: number }) {
  const bots = extra.chatbots
  const visitas = bots.reduce((s, b) => s + b.visitas, 0)
  const contactos = bots.reduce((s, b) => s + b.contactos + b.leads, 0)
  const paginas = new Map<string, number>()
  for (const b of bots) for (const p of b.paginas) paginas.set(p.path, (paginas.get(p.path) ?? 0) + p.visitas)
  const top = [...paginas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.015em]">
          <Bot className="h-4 w-4 text-ink-muted" /> Chatbots que nos recomiendan
        </h3>
        <span className="num text-[11.5px] text-ink-subtle">
          {visitas.toLocaleString("es-AR")} visitas · {porcentaje(visitas, total, 1)} del sitio
        </span>
      </div>
      {bots.length === 0 ? (
        <p className="p-4 text-[12.5px] text-ink-muted">
          Ningún chatbot (ChatGPT, Perplexity, Copilot, Gemini, Claude) mandó visitas en este período.
        </p>
      ) : (
        <div className="p-4">
          <ul className="flex flex-col gap-2">
            {bots.map((b) => (
              <li key={b.nombre} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="font-medium text-ink">{b.nombre}</span>
                <span className="num text-ink-muted">
                  {b.visitas} visitas · {b.contactos + b.leads} contactos
                </span>
              </li>
            ))}
          </ul>
          {top.length > 0 && (
            <>
              <p className="eyebrow mb-1.5 mt-4">Qué páginas recomiendan</p>
              <ul className="flex flex-col gap-1">
                {top.map(([path, v]) => (
                  <li key={path} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate font-mono text-[11.5px] text-ink-secondary">{path}</span>
                    <span className="num shrink-0 text-ink-muted">{v}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 border-t border-dashed border-line-strong pt-3 text-[11.5px] text-ink-muted">
            {contactos
              ? `Ya trajeron ${contactos} ${contactos === 1 ? "contacto" : "contactos"}. `
              : "Todavía no trajeron contactos. "}
            Es un canal que crece solo: lo que los chatbots leen de esas páginas es lo que dicen de Accedra. Conviene que
            tengan precio o rango, casos y preguntas frecuentes claras.
          </p>
        </div>
      )}
    </section>
  )
}

/* ── Para el chat ─────────────────────────────────────────────────────────── */

/** Las repreguntas que quedan a mano después de preguntar desde la radiografía. */
const SEGUIMIENTOS = [
  { emoji: "🎯", corto: "Qué hago primero", texto: "Si tuviera que hacer una sola cosa esta semana con estos resultados, ¿cuál sería y cómo mido si funcionó?" },
  { emoji: "💵", corto: "¿Muevo presupuesto?", texto: "Con estos números, ¿moverías presupuesto entre canales o campañas? ¿Cuánto y hacia dónde?" },
  { emoji: "🔎", corto: "¿Es un problema de medición?", texto: "¿Puede ser que algo de esto sea un problema de medición y no de rendimiento? ¿Qué revisaría para descartarlo?" },
  { emoji: "🎫", corto: "Anotalo como ticket", texto: "Anotá como ticket la acción principal que propusiste, con el detalle para que la pueda hacer otra persona." },
]

/**
 * La radiografía en texto, para el chat: lo mismo que se ve, en el orden en que
 * se lee. Sin la lista de leads ni nombres de personas: con las cifras alcanza
 * para explicar qué pasa, y si hace falta más el agente tiene sus herramientas.
 */
function textoRadiografia(rx: Radiografia, datos: Resultados, periodo: Periodo): string {
  const r = rx.resumen
  const cambio = (ahora: number, antes: number | null) => {
    if (antes === null) return ""
    const v = variacion(ahora, antes)
    return ` (antes ${antes.toLocaleString("es-AR")}${v === null ? "" : `, ${v > 0 ? "+" : ""}${Math.round(v)}%`})`
  }
  const SALUD: Record<Salud, string> = { bien: "bien", flojo: "flojo", mal: "mal", poco: "pocos datos", "sin-datos": "sin datos" }

  return resumen(
    renglon("Período", `${PERIODO_LABEL[periodo]} (${datos.sitio.desde} → ${datos.sitio.hasta})`),
    renglon("Canal filtrado", rx.filtro ? CANAL_LABEL[rx.filtro] : "todos"),
    "",
    "## Diagnóstico",
    rx.cuello
      ? [`Problema principal (${rx.cuello.salud}): ${rx.cuello.titulo}`, `Por qué: ${rx.cuello.porque}`, `Qué propone el panel: ${rx.cuello.accion}`]
      : "Ningún paso del embudo por debajo de lo esperable.",
    rx.otros.map((h) => `También (${h.salud}): ${h.titulo}. ${h.accion}`),
    rx.buenos.map((b) => `Anda bien: ${b}`),
    "",
    "## Cifras",
    renglon("Invertido en Google Ads", pesos(rx.gasto)),
    `Contactos: ${r.contactos}${cambio(r.contactos, r.contactosAntes)}`,
    rx.contactosAds ? `Costo por contacto de Ads: ${pesos(rx.gasto / rx.contactosAds)} (${rx.contactosAds} contactos de anuncios)` : "Ningún contacto vino de un anuncio",
    `Clientes nuevos: ${r.clientes}${r.montoGanado !== null && r.clientes ? ` (${pesos(r.montoGanado)})` : ""}`,
    "",
    "## Embudo",
    rx.etapas.map(
      (e) =>
        `${e.titulo}: ${e.total.toLocaleString("es-AR")}${cambio(e.total, e.antes)} · ${SALUD[e.salud]}${
          e.paso ? ` · ${e.paso.texto}` : ""
        }${e.evaluaciones.length ? `\n  ${e.evaluaciones.filter((v) => !v.soloFiltro || rx.filtro).map((v) => v.texto).join("\n  ")}` : ""}`
    ),
    "",
    "## Por canal (vistas / interés / visitas / contactos / clientes)",
    rx.canales.map(
      (f) =>
        `${CANAL_LABEL[f.canal]}: ${f.vistas ?? "—"} / ${f.interes ?? "—"} / ${f.visitas}${
          f.visitasAntes !== null ? ` (antes ${f.visitasAntes})` : ""
        } / ${f.contactos} / ${f.clientes}`
    ),
    rx.desglose === "estimado" && "El desglose por canal es estimado.",
    rx.avisos.length > 0 && ["", "## Qué falta medir", ...rx.avisos.map((a) => `- ${a}`)]
  )
}
