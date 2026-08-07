import { ArrowRight, FileText, Archive, Clock } from "lucide-react"
import {
  INFORMES,
  MESES,
  COLOR_SEMAFORO,
  urlPdf,
  mesesPendientes,
  type Informe,
} from "@/lib/informes"
import { CopiarPrompt } from "@/components/marketing/copiar-prompt"
import { PageBody, PageHeader } from "@/components/ui/page-header"

/**
 * Listado de informes. Es sólo un índice: cada informe es un PDF cerrado,
 * generado con el template y el prompt de `marketing-context.ts`.
 *
 * No hay una sola métrica en esta pantalla a propósito. Los números viven dentro
 * del PDF; duplicarlos acá los desincronizaría el día que se regenere un informe.
 */

// Se derivan de la fecha real: hardcodearlos obliga a acordarse de tocarlos cada
// enero, y el listado quedaría mostrando un año viejo sin que nadie lo note.
export const dynamic = "force-dynamic"

const HOY = new Date()
const ANIO_ACTUAL = HOY.getFullYear()
const MES_ACTUAL = HOY.getMonth() + 1

export default function InformesPage() {
  const historico = INFORMES.filter((i) => i.tipo === "historico")
  const mensuales = INFORMES.filter((i) => i.tipo === "mensual" && i.anio === ANIO_ACTUAL)
  const pendientes = mesesPendientes(ANIO_ACTUAL, MES_ACTUAL)

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Informes de campañas"
        description="Un informe por mes, con la misma estructura siempre"
        back={{ href: "/marketing", label: "Marketing" }}
        actions={<CopiarPrompt periodo={proximoPeriodo()} />}
      />

      <PageBody width="narrow">
        {historico.length > 0 && (
          <section className="mb-9">
            <h2 className="eyebrow mb-3">Línea de base</h2>
            {historico.map((inf) => (
              <CardHistorico key={inf.slug} informe={inf} />
            ))}
          </section>
        )}

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="eyebrow">{ANIO_ACTUAL} · informes mensuales</h2>
            <p className="text-[11px] text-ink-muted">Se emite el día 1 de cada mes</p>
          </div>

          <div className="panel overflow-hidden">
            {mensuales.map((inf, i) => (
              <FilaInforme key={inf.slug} informe={inf} primero={i === 0} />
            ))}
            {pendientes.map((m, i) => (
              <FilaPendiente key={m} mes={m} primero={mensuales.length === 0 && i === 0} />
            ))}
          </div>

          {mensuales.length === 0 && (
            <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
              Todavía no hay informes mensuales. El primero se genera cuando termine el mes en
              curso, con los datos exportados de Google Ads y el análisis del período.
            </p>
          )}
        </section>
      </PageBody>
    </main>
  )
}

function CardHistorico({ informe }: { informe: Informe }) {
  return (
    <a
      href={urlPdf(informe.slug)}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 shadow-e1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-e2 sm:flex-row sm:items-start sm:gap-6"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-brand-100 bg-brand-50 text-brand-600">
        <Archive className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[15.5px] font-semibold tracking-[-0.02em] text-ink">
            Diagnóstico histórico
          </h3>
          <Semaforo color={COLOR_SEMAFORO[informe.semaforo]} />
        </div>
        <p className="mt-0.5 text-[11.5px] text-ink-muted">{informe.periodo}</p>

        <p className="mt-3 max-w-2xl text-[13px] leading-[1.7] text-ink-secondary">
          {informe.titular}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-brand-600">
            <FileText className="h-3.5 w-3.5" />
            Abrir PDF
            <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
          <span>Emitido {formatearFecha(informe.emitido)}</span>
          <span>Rúbrica v{informe.promptVersion}</span>
        </div>
      </div>
    </a>
  )
}

function FilaInforme({ informe, primero }: { informe: Informe; primero: boolean }) {
  return (
    <a
      href={urlPdf(informe.slug)}
      target="_blank"
      rel="noreferrer"
      className={`group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand-50/60 ${
        primero ? "" : "border-t border-line-soft"
      }`}
    >
      <div className="w-24 shrink-0 text-[13px] font-semibold capitalize text-ink">
        {MESES[(informe.mes ?? 1) - 1]}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Semaforo color={COLOR_SEMAFORO[informe.semaforo]} />
        <span className="truncate text-[12.5px] text-ink-muted">{informe.titular}</span>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-ink-muted transition-colors group-hover:bg-brand-100/60 group-hover:text-brand-700">
        <FileText className="h-3.5 w-3.5" />
        PDF
      </span>
    </a>
  )
}

function FilaPendiente({ mes, primero }: { mes: number; primero: boolean }) {
  return (
    <div
      className={`flex select-none items-center gap-4 px-5 py-3.5 ${
        primero ? "" : "border-t border-line-soft"
      }`}
    >
      <div className="w-24 shrink-0 text-[13px] font-medium capitalize text-ink-faint">
        {MESES[mes - 1]}
      </div>
      <div className="flex flex-1 items-center gap-1.5 text-[11.5px] text-ink-faint">
        <Clock className="h-3 w-3" />
        Pendiente
      </div>
    </div>
  )
}

/** El semáforo del informe viene como color literal desde `informes.ts`, así que
 *  el halo se compone con `color-mix` en vez de una clase por tono. */
function Semaforo({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)`,
      }}
    />
  )
}

/**
 * El período que toca informar: el último mes cerrado. El informe de agosto se
 * emite el 1 de septiembre, así que el botón siempre ofrece el mes anterior.
 */
function proximoPeriodo() {
  const mes = MES_ACTUAL === 1 ? 12 : MES_ACTUAL - 1
  const anio = MES_ACTUAL === 1 ? ANIO_ACTUAL - 1 : ANIO_ACTUAL
  return `${MESES[mes - 1]} de ${anio}`
}

function formatearFecha(iso: string) {
  const [a, m, d] = iso.split("-")
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`
}
