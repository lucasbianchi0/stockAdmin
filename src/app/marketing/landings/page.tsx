import type React from "react"
import { AlertTriangle, Check, ExternalLink, Minus, X } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ANATOMIA,
  AUDITORIAS,
  CADENA,
  DOMINIO,
  ESTADO,
  HALLAZGOS_PERF,
  IDIOMAS,
  INDUSTRIAS,
  LIMITES,
  MAPA_URLS,
  PAGINAS,
  PENDIENTES,
  PERF_HERRAMIENTA,
  PERF_MEDIDO,
  PESO_HOME,
  RELEVADO,
  RUTAS,
  SCHEMAS,
  SENALES_GEO,
  SOLUCIONES,
  TECNICO,
  TOTAL_URLS,
  UTILIDADES,
  type Ruta,
  type Semaforo,
} from "@/lib/seo-kit"

/**
 * Landings y SEO — el registro de qué información tiene hoy el sitio.
 *
 * Es un documento para que alguien que no trabajó en el sitio entienda en diez
 * minutos qué hay hecho. Todo el contenido está relevado del HTML de producción,
 * no escrito de memoria: por eso la fecha de relevamiento va en la portada y no
 * al pie.
 *
 * A diferencia del Brand Kit, acá no hay nada para copiar — es un inventario.
 * Por eso es más corto y se apoya en tablas y matrices en vez de en fichas.
 */

export const metadata = { title: "Landings y SEO · Accedra" }

export default function LandingsSeoPage() {
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title="Landings y SEO"
        description="Qué información tiene hoy el sitio, en buscadores y en respuestas de IA"
        back={{ href: "/marketing", label: "Marketing" }}
        actions={
          <a
            href={DOMINIO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium text-ink-secondary shadow-e1 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            Ver el sitio
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        }
      />

      <div className="mx-auto w-full max-w-[1080px] space-y-14 px-5 py-8 sm:px-8">
        <Portada />
        <Arbol />
        <Arquitectura />
        <Seo />
        <Geo />
        <Performance />
        <Inventario />
        <Pendientes />
      </div>
    </main>
  )
}

/* ── Andamiaje ────────────────────────────────────────────────────────────── */

function Section({
  num,
  titulo,
  bajada,
  children,
}: {
  num: string
  titulo: string
  bajada: string
  children: React.ReactNode
}) {
  return (
    <section className="scroll-mt-24">
      <div className="mb-5 border-b border-line pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">{num}</span>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{titulo}</h2>
        </div>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">{bajada}</p>
      </div>
      {children}
    </section>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5 shadow-e1", className)}>
      {children}
    </div>
  )
}

const SEMAFORO: Record<Semaforo, { dot: string; label: string }> = {
  verde: { dot: "bg-success", label: "Listo" },
  amarillo: { dot: "bg-warning", label: "A medias" },
  rojo: { dot: "bg-danger", label: "Sin empezar" },
}

/* ── Portada ──────────────────────────────────────────────────────────────── */

function Portada() {
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-50/80 via-surface to-surface p-6 shadow-e1 sm:p-8">
      <p className="eyebrow">Relevado del sitio en producción · {RELEVADO}</p>
      <h2 className="mt-2 max-w-3xl text-[21px] font-semibold leading-snug tracking-[-0.025em] text-ink">
        El SEO técnico está prácticamente terminado. Lo que falta ya no es técnico.
      </h2>
      <p className="mt-2.5 max-w-3xl text-[13px] leading-[1.7] text-ink-secondary">
        {TOTAL_URLS} URLs indexables, datos estructurados en todas las páginas y un{" "}
        <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11.5px]">
          llms.txt
        </code>{" "}
        que casi nadie tiene todavía. El home en mobile ya se resolvió: pasó de 60 a 87 al aligerar
        el video del hero. El hueco real que queda es de otra naturaleza: la ficha de Google
        Business, que no existe.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra valor={String(TOTAL_URLS)} label="URLs indexables" />
        <Cifra valor="30" label="Landings por industria" />
        <Cifra valor="120" label="Preguntas con respuesta" />
        <Cifra valor="100" label="SEO en Lighthouse" tono="ok" />
      </div>
    </div>
  )
}

function Cifra({ valor, label, tono }: { valor: string; label: string; tono?: "ok" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-e1">
      <p
        className={cn(
          "num text-[26px] font-bold leading-none",
          tono === "ok" ? "text-success-text" : "text-ink"
        )}
      >
        {valor}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-tight text-ink-muted">{label}</p>
    </div>
  )
}

/* ── Árbol de rutas ───────────────────────────────────────────────────────── */

type Nodo = {
  seg: string
  hijos: Nodo[]
  ruta?: Ruta
}

/**
 * Arma el árbol a partir de las rutas planas. Los nodos intermedios sin página
 * propia (`soluciones/`, `casos/`) quedan sin `ruta` y se pintan apagados: son
 * carpetas, no destinos — hacerlos clickeables llevaría a un 404.
 */
function armarArbol(rutas: Ruta[]): Nodo[] {
  const raiz: Nodo = { seg: "", hijos: [] }

  for (const r of rutas) {
    const segs = r.path.split("/").filter(Boolean)
    if (segs.length === 0) {
      raiz.hijos.push({ seg: "/", hijos: [], ruta: r })
      continue
    }
    let actual = raiz
    segs.forEach((seg, i) => {
      let hijo = actual.hijos.find((h) => h.seg === seg && h.seg !== "/")
      if (!hijo) {
        hijo = { seg, hijos: [] }
        actual.hijos.push(hijo)
      }
      if (i === segs.length - 1) hijo.ruta = r
      actual = hijo
    })
  }
  return raiz.hijos
}

type Fila = { nodo: Nodo; prefijo: string; profundidad: number }

/** Aplana el árbol calculando el prefijo de guiones tipo `tree`. */
function aplanar(nodos: Nodo[], prefijo = "", profundidad = 0): Fila[] {
  const filas: Fila[] = []
  nodos.forEach((n, i) => {
    const ultimo = i === nodos.length - 1
    filas.push({ nodo: n, prefijo: prefijo + (ultimo ? "└─ " : "├─ "), profundidad })
    if (n.hijos.length) {
      filas.push(...aplanar(n.hijos, prefijo + (ultimo ? "   " : "│  "), profundidad + 1))
    }
  })
  return filas
}

function Arbol() {
  const filas = aplanar(armarArbol(RUTAS))
  const utilidades = aplanar(armarArbol(UTILIDADES))

  return (
    <section>
      <div className="mb-5 border-b border-line pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">00</span>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            El sitio, ruta por ruta
          </h2>
        </div>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">
          Las {RUTAS.length} URLs del sitemap, con el título que devuelve cada una. Todas abren
          en una pestaña nueva — la idea es que se puedan probar de a una.
        </p>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-subtle px-5 py-3">
          <p className="font-mono text-[12px] font-semibold text-ink">
            {DOMINIO.replace("https://", "")}
          </p>
          <span className="num text-[11px] text-ink-muted">{RUTAS.length} rutas</span>
        </div>

        <div className="overflow-x-auto py-1">
          {filas.map((f, i) => (
            <FilaArbol key={f.nodo.ruta?.path ?? `${f.prefijo}${f.nodo.seg}${i}`} fila={f} />
          ))}
        </div>

        {/* Los archivos van aparte: no son páginas navegables pero son los que
            leen Google y los modelos, así que tienen que estar a mano. */}
        <div className="border-t border-line bg-surface-subtle px-5 py-2.5">
          <p className="eyebrow">Archivos · no son páginas</p>
        </div>
        <div className="py-1">
          {utilidades.map((f) => (
            <FilaArbol key={f.nodo.ruta?.path} fila={f} />
          ))}
        </div>
      </Panel>
    </section>
  )
}

function FilaArbol({ fila }: { fila: Fila }) {
  const { nodo, prefijo } = fila
  const carpeta = !nodo.ruta

  const contenido = (
    <>
      <span className="shrink-0 whitespace-pre font-mono text-[12px] text-ink-faint/70">
        {prefijo}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[12px]",
          carpeta
            ? "font-medium text-ink-muted"
            : "font-medium text-brand-700 group-hover:underline"
        )}
      >
        {nodo.seg}
        {carpeta && "/"}
      </span>

      {nodo.ruta && (
        <>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">
            {nodo.ruta.titulo}
          </span>
          {nodo.ruta.nota && (
            <Badge tone="warning" size="sm" className="hidden shrink-0 lg:inline-flex">
              {nodo.ruta.nota}
            </Badge>
          )}
          <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </>
      )}
    </>
  )

  if (carpeta) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-[3px] leading-5">{contenido}</div>
    )
  }

  return (
    <a
      href={DOMINIO + nodo.ruta!.path}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-2.5 px-5 py-[3px] leading-5 transition-colors hover:bg-brand-50/70"
    >
      {contenido}
    </a>
  )
}

/* ── 01 · Arquitectura ────────────────────────────────────────────────────── */

function Arquitectura() {
  return (
    <Section
      num="01"
      titulo="Cómo está armado el sitio"
      bajada="Cinco soluciones cruzadas con seis industrias dan 30 landings. Cada una es el destino de un grupo de anuncios, y ese 1:1:1 es lo que hace que el informe mensual se arme solo."
    >
      <div className="space-y-4">
        <Panel>
          <p className="eyebrow mb-3.5">La cadena</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {CADENA.map((c, i) => (
              <div key={c.nivel} className="flex flex-1 items-stretch gap-2">
                <div className="flex-1 rounded-lg border border-line bg-surface-subtle px-3.5 py-3">
                  <p className="text-[12.5px] font-semibold text-ink">{c.nivel}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">= {c.equivale}</p>
                  <p className="mt-2 break-all font-mono text-[10.5px] text-brand-700">
                    {c.ejemplo}
                  </p>
                </div>
                {i < CADENA.length - 1 && (
                  <span className="hidden shrink-0 self-center text-ink-faint sm:block">→</span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel className="overflow-hidden p-0">
            <p className="eyebrow border-b border-line px-5 py-3">
              La matriz · las 30 landings existen
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[11.5px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 border-b border-line bg-surface-subtle px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
                      Solución
                    </th>
                    {INDUSTRIAS.map((ind) => (
                      <th
                        key={ind}
                        className="border-b border-line bg-surface-subtle px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-subtle"
                      >
                        {ind.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SOLUCIONES.map((sol) => (
                    <tr key={sol}>
                      <td className="border-b border-line-soft px-4 py-2.5 font-medium text-ink">
                        {sol}
                      </td>
                      {INDUSTRIAS.map((ind) => (
                        <td
                          key={ind}
                          className="border-b border-line-soft px-2 py-2.5 text-center"
                        >
                          <Check
                            className="mx-auto h-3.5 w-3.5 text-success"
                            strokeWidth={2.6}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-0">
            <p className="eyebrow border-b border-line px-5 py-3">El sitemap</p>
            <div className="px-5 py-1">
              {MAPA_URLS.map((m) => (
                <div
                  key={m.grupo}
                  className="flex items-baseline gap-3 border-b border-line-soft py-2.5 last:border-0"
                >
                  <span className="num w-7 shrink-0 text-right font-mono text-[13px] font-bold text-ink">
                    {m.cantidad}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink">{m.grupo}</p>
                    <p className="truncate font-mono text-[10px] text-ink-faint">{m.patron}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-baseline gap-3 border-t border-line py-2.5">
                <span className="num w-7 shrink-0 text-right font-mono text-[13px] font-bold text-brand-600">
                  {TOTAL_URLS}
                </span>
                <p className="text-[12px] font-semibold text-ink">Total indexable</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  )
}

/* ── 02 · SEO ─────────────────────────────────────────────────────────────── */

function Seo() {
  return (
    <Section
      num="02"
      titulo="SEO · qué lleva cada página"
      bajada="Los siete campos que Google lee de una landing. El ejemplo sale siempre de la misma página real, /soluciones/networking/bancos, para que se lea como una pieza entera y no como siete fragmentos sueltos."
    >
      <div className="space-y-4">
        <Panel className="p-0">
          {ANATOMIA.map((p) => (
            <div
              key={p.campo}
              className="grid gap-x-5 gap-y-2 border-b border-line-soft px-5 py-4 last:border-0 sm:grid-cols-[170px_1fr]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-semibold text-ink">{p.campo}</p>
                  {p.estado === "ok" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                  ) : (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-warning-text"
                      strokeWidth={2.2}
                    />
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{p.que}</p>
              </div>
              <div className="min-w-0">
                <p className="break-words rounded-lg border border-line bg-surface-subtle px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
                  {p.ejemplo}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-muted">{p.detalle}</p>
              </div>
            </div>
          ))}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-0">
            <p className="eyebrow border-b border-line px-5 py-3">Infraestructura</p>
            <div className="px-5 py-1">
              {TECNICO.map((t) => (
                <div
                  key={t.item}
                  className="flex items-start gap-3 border-b border-line-soft py-3 last:border-0"
                >
                  {t.estado === "ok" ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text"
                      strokeWidth={2.2}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-ink">{t.item}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                      {t.valor}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* El hallazgo que más sorprende a quien no trabajó en el sitio. */}
          <Panel className="border-warning-line bg-warning-soft/40">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" strokeWidth={2.2} />
              <p className="text-[13px] font-semibold text-ink">Tres idiomas, uno indexable</p>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {IDIOMAS.escritos.map((l) => (
                <Badge
                  key={l}
                  tone={IDIOMAS.indexables.includes(l) ? "success" : "neutral"}
                  size="sm"
                >
                  {IDIOMAS.indexables.includes(l) ? (
                    <Check className="h-3 w-3" strokeWidth={2.6} />
                  ) : (
                    <X className="h-3 w-3" strokeWidth={2.6} />
                  )}
                  {l}
                </Badge>
              ))}
            </div>

            <p className="mt-3.5 text-[11.5px] leading-relaxed text-ink-secondary">
              {IDIOMAS.porque}
            </p>
            <p className="mt-2.5 border-t border-warning-line pt-2.5 text-[11.5px] leading-relaxed text-ink-muted">
              <span className="font-semibold text-ink-secondary">Decisión: </span>
              {IDIOMAS.decision}
            </p>
          </Panel>
        </div>
      </div>
    </Section>
  )
}

/* ── 03 · GEO ─────────────────────────────────────────────────────────────── */

function Geo() {
  return (
    <Section
      num="03"
      titulo="GEO · qué ve un modelo de IA"
      bajada="SEO es aparecer en una lista de links. GEO es entrar en la respuesta que escribe ChatGPT o Perplexity, donde no hay lista: o te citan o no existís. Son señales distintas y el sitio ya tiene casi todas."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {SENALES_GEO.map((s) => (
            <div
              key={s.nombre}
              className={cn(
                "rounded-xl border p-4 shadow-e1",
                s.estado === "ok" ? "border-line bg-surface" : "border-danger-line bg-danger-soft/40"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-semibold text-ink">{s.nombre}</p>
                  {s.ruta && (
                    <a
                      href={DOMINIO + s.ruta}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10.5px] text-brand-600 hover:underline"
                    >
                      {s.ruta}
                    </a>
                  )}
                </div>
                {s.estado === "ok" ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                ) : (
                  <X className="h-3.5 w-3.5 shrink-0 text-danger-text" strokeWidth={2.6} />
                )}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">{s.que}</p>
              <p
                className={cn(
                  "mt-2.5 border-t pt-2 text-[11px]",
                  s.estado === "ok"
                    ? "border-line text-ink-secondary"
                    : "border-danger-line font-medium text-danger-text"
                )}
              >
                {s.detalle}
              </p>
            </div>
          ))}
        </div>

        <Panel className="p-0">
          <p className="eyebrow border-b border-line px-5 py-3">
            Datos estructurados · qué declara el JSON-LD
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[12px]">
              <tbody>
                {SCHEMAS.map((s) => (
                  <tr key={s.tipo}>
                    <td className="w-[190px] border-b border-line-soft px-5 py-2.5">
                      <code className="font-mono text-[11.5px] font-medium text-brand-700">
                        {s.tipo}
                      </code>
                    </td>
                    <td className="w-[110px] border-b border-line-soft px-2 py-2.5 text-ink-muted">
                      {s.donde}
                    </td>
                    <td className="border-b border-line-soft px-2 py-2.5 pr-5 text-ink-secondary">
                      {s.que}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Section>
  )
}

/* ── 04 · Performance ─────────────────────────────────────────────────────── */

function nota(n: number) {
  if (n >= 90) return { text: "text-success-text", bg: "bg-success", ring: "ring-success-line" }
  if (n >= 50) return { text: "text-warning-text", bg: "bg-warning", ring: "ring-warning-line" }
  return { text: "text-danger-text", bg: "bg-danger", ring: "ring-danger-line" }
}

function Performance() {
  const maxPeso = Math.max(...PESO_HOME.reparto.map((r) => r.peso))

  return (
    <Section
      num="04"
      titulo="Performance · la calificación real"
      bajada={`Medido con ${PERF_HERRAMIENTA} sobre producción el ${PERF_MEDIDO}. Google usa el corte de mobile, no el de desktop — y ahí el home pasó de 60 a 87 después de aligerar el video del hero.`}
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {AUDITORIAS.map((a) => (
            <div
              key={a.etiqueta + a.dispositivo}
              className="rounded-xl border border-line bg-surface p-5 shadow-e1"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-ink">{a.etiqueta}</p>
                <Badge tone={a.dispositivo === "Mobile" ? "brand" : "neutral"} size="sm">
                  {a.dispositivo}
                </Badge>
              </div>
              <p className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">{a.url}</p>

              {/* La cifra grande es sólo Performance: es la única que se mueve. */}
              <div className="mt-4 flex items-end gap-4">
                <div>
                  <p
                    className={cn(
                      "num text-[42px] font-bold leading-none",
                      nota(a.performance).text
                    )}
                  >
                    {a.performance}
                  </p>
                  <p className="eyebrow mt-1.5">Performance</p>
                </div>
                <div className="flex-1 space-y-1.5 pb-1">
                  <Mini label="Accesibilidad" valor={a.accesibilidad} />
                  <Mini label="Buenas prácticas" valor={a.buenasPracticas} />
                  <Mini label="SEO" valor={a.seo} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3">
                {[
                  ["LCP", a.lcp],
                  ["CLS", a.cls],
                  ["TBT", a.tbt],
                  ["SI", a.si],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      {k}
                    </p>
                    <p className="num mt-0.5 font-mono text-[12px] font-semibold text-ink-secondary">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Panel>
            <p className="eyebrow">El peso del home, hoy</p>
            <p className="num mt-1.5 text-[15px] font-bold text-ink">{PESO_HOME.total}</p>
            <div className="mt-4 space-y-2.5">
              {PESO_HOME.reparto.map((r) => (
                <div key={r.tipo}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] font-medium text-ink-secondary">{r.tipo}</span>
                    <span className="num font-mono text-[11px] text-ink-muted">
                      {r.peso.toFixed(2)} MB · {r.req} req
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        r.tipo === "Video" ? "bg-brand-500" : "bg-n-400"
                      )}
                      style={{ width: `${(r.peso / maxPeso) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
              El video del hero pasó de 2,71 MB a 308 KB con una versión propia para mobile. El home
              entero pesa hoy menos de lo que pesaba ese solo archivo.
            </p>
          </Panel>

          <Panel className="p-0">
            <p className="eyebrow border-b border-line px-5 py-3">Qué hay que tocar</p>
            <div className="px-5 py-1">
              {HALLAZGOS_PERF.map((h) => (
                <div
                  key={h.titulo}
                  className="flex items-start gap-3 border-b border-line-soft py-3.5 last:border-0"
                >
                  <Badge
                    tone={
                      h.impacto === "alto"
                        ? "danger"
                        : h.impacto === "medio"
                          ? "warning"
                          : "neutral"
                    }
                    size="sm"
                    className="mt-px w-[52px] shrink-0 justify-center capitalize"
                  >
                    {h.impacto}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-ink">{h.titulo}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                      {h.detalle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  )
}

function Mini({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", nota(valor).bg)} />
      <span className="flex-1 text-[10.5px] text-ink-muted">{label}</span>
      <span className={cn("num font-mono text-[11.5px] font-semibold", nota(valor).text)}>
        {valor}
      </span>
    </div>
  )
}

/* ── 05 · Inventario ──────────────────────────────────────────────────────── */

function Inventario() {
  return (
    <Section
      num="05"
      titulo="Inventario · las 35 páginas, con su texto real"
      bajada={`El title y la descripción que devuelve cada URL hoy. El contador marca en ámbar lo que Google va a cortar: ${LIMITES.title} caracteres el título, ${LIMITES.description} la descripción.`}
    >
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {["Página", "Title", "Description"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-line bg-surface-subtle px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle",
                      i === 0 && "w-[230px]"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGINAS.map((p) => {
                const madre = p.industria === null
                return (
                  <tr key={p.ruta} className={cn(madre && "bg-surface-subtle/60")}>
                    <td className="border-b border-line-soft px-4 py-3 align-top">
                      <p
                        className={cn(
                          "text-[12px] leading-tight",
                          madre ? "font-semibold text-ink" : "font-medium text-ink-secondary"
                        )}
                      >
                        {p.industria ?? p.solucion}
                      </p>
                      <a
                        href={DOMINIO + p.ruta}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate font-mono text-[10px] text-ink-faint hover:text-brand-600 hover:underline"
                      >
                        {p.ruta}
                      </a>
                    </td>
                    <td className="border-b border-line-soft px-4 py-3 align-top">
                      <Texto valor={p.title} limite={LIMITES.title} />
                    </td>
                    <td className="border-b border-line-soft px-4 py-3 align-top">
                      <Texto valor={p.description} limite={LIMITES.description} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Section>
  )
}

/** El largo va pegado al texto y no en una columna aparte: es un atributo de ese
 *  texto, y en una columna propia obliga a cruzar la fila con la vista. */
function Texto({ valor, limite }: { valor: string; limite: number }) {
  const excede = valor.length > limite
  return (
    <div className="min-w-[240px]">
      <p className="text-[12px] leading-[1.55] text-ink-secondary">{valor}</p>
      <span
        className={cn(
          "num mt-1 inline-block font-mono text-[10px]",
          excede ? "font-semibold text-warning-text" : "text-ink-faint"
        )}
      >
        {valor.length}
        {excede && ` · excede ${limite}`}
      </span>
    </div>
  )
}

/* ── 06 · Pendientes ──────────────────────────────────────────────────────── */

function Pendientes() {
  const ahora = PENDIENTES.filter((p) => p.prioridad === "ahora")
  const despues = PENDIENTES.filter((p) => p.prioridad === "despues")

  return (
    <Section
      num="06"
      titulo="Estado y pendientes"
      bajada="Lo que falta ya no es SEO on-page: seguir puliendo ahí tiene rendimientos decrecientes. Es señal local, reputación y contenido nuevo."
    >
      <div className="space-y-4">
        <Panel className="p-0">
          {ESTADO.map((e) => (
            <div
              key={e.area}
              className="flex items-center gap-3 border-b border-line-soft px-5 py-3 last:border-0"
            >
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", SEMAFORO[e.estado].dot)}
                aria-hidden
              />
              <p className="w-[210px] shrink-0 text-[12.5px] font-medium text-ink">{e.area}</p>
              <p className="min-w-0 flex-1 text-[11.5px] text-ink-muted">{e.comentario}</p>
              <span className="hidden shrink-0 text-[10.5px] font-medium text-ink-faint sm:block">
                {SEMAFORO[e.estado].label}
              </span>
            </div>
          ))}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <ListaPendientes
            titulo="Arranca ahora"
            nota="Lo que tarda por afuera nuestro — verificación de Google, aprobaciones — se dispara hoy aunque el resultado se vea en un mes."
            items={ahora}
            urgente
          />
          <ListaPendientes titulo="Después" nota="Por orden de impacto." items={despues} />
        </div>
      </div>
    </Section>
  )
}

function ListaPendientes({
  titulo,
  nota,
  items,
  urgente,
}: {
  titulo: string
  nota: string
  items: { titulo: string; porque: string }[]
  urgente?: boolean
}) {
  return (
    <Panel className={cn("p-0", urgente && "border-brand-200")}>
      <div className={cn("border-b border-line px-5 py-3.5", urgente && "bg-brand-50/50")}>
        <p className="text-[12.5px] font-semibold text-ink">{titulo}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{nota}</p>
      </div>
      <div className="px-5 py-1">
        {items.map((p) => (
          <div
            key={p.titulo}
            className="flex items-start gap-2.5 border-b border-line-soft py-3.5 last:border-0"
          >
            <Minus
              className={cn(
                "mt-1 h-3 w-3 shrink-0",
                urgente ? "text-brand-500" : "text-ink-faint"
              )}
              strokeWidth={3}
            />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">{p.titulo}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{p.porque}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
