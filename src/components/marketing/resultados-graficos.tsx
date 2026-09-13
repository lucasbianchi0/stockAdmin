"use client"

import { useId, useMemo, useState } from "react"

import { duracion, porcentaje, type PuntoSerie } from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

/* ══════════════════════════════════════════════════════════════════════════
   Embudo
   ══════════════════════════════════════════════════════════════════════════ */

export type PasoEmbudo = {
  titulo: string
  detalle: string
  valor: number
  /** El escalón donde se corta todo. Se pinta distinto aunque sea cero. */
  critico?: boolean
  /** Dato válido pero que no cuenta como resultado (los leads del equipo). */
  tenue?: boolean
}

/**
 * El embudo, como barras de conversión.
 *
 * ── POR QUE LA BARRA NO MIDE EL VALOR ABSOLUTO ──
 *
 * Porque el rango lo hace ilegible. Con 7.649 impresiones arriba y 0 leads
 * abajo, una escala lineal deja todo lo intermedio en dos píxeles y la pantalla
 * termina mintiendo por omisión: parece que no pasa nada entre el primer paso y
 * el último, cuando justamente ahí está toda la información.
 *
 * Entonces la barra mide **cuánto siguió del paso anterior**. Es una escala
 * honesta (0 a 100%), se lee de un vistazo, y responde la pregunta que se hace
 * quien mira un embudo: dónde se cae la gente. El valor absoluto va al costado,
 * en cifra, que es donde se lee bien.
 */
export function Embudo({ pasos }: { pasos: PasoEmbudo[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {pasos.map((p, i) => {
        const previo = i === 0 ? null : pasos[i - 1].valor
        const ratio = previo === null ? 1 : previo === 0 ? 0 : p.valor / previo
        const ancho = Math.max(0, Math.min(1, ratio)) * 100
        const adentro = ancho > 24

        return (
          <div key={p.titulo} className="grid grid-cols-[minmax(120px,168px)_1fr_92px] items-center gap-3 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink">{p.titulo}</p>
              <p className="truncate text-[11px] text-ink-faint">{p.detalle}</p>
            </div>

            <div className="relative h-[26px] overflow-hidden rounded-md bg-surface-sunken">
              {p.critico && p.valor === 0 ? (
                // Cero no puede ser una barra vacía: se lee como "no hay dato".
                // Una marca roja de tres píxeles dice que el dato existe y es cero.
                <span className="absolute inset-y-0 left-0 w-[3px] rounded-sm bg-danger" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md shadow-[inset_0_1px_0_oklch(1_0_0/.18)]",
                    p.tenue ? "bg-n-400" : "bg-brand-600"
                  )}
                  style={{ width: `${ancho}%` }}
                  aria-hidden
                />
              )}

              {previo !== null && (
                <span
                  className={cn(
                    "num absolute inset-y-0 flex items-center text-[11px] font-semibold",
                    adentro && !p.critico ? "text-white" : "text-ink-muted"
                  )}
                  style={adentro && !p.critico ? { left: 10 } : { left: `calc(${ancho}% + 8px)` }}
                >
                  {porcentaje(p.valor, previo)}
                </span>
              )}
            </div>

            <div className="text-right">
              <p className={cn("num text-[16px] font-bold leading-none", p.valor === 0 && p.critico ? "text-danger-text" : "text-ink")}>
                {p.valor.toLocaleString("es-AR")}
              </p>
              <p className="num mt-0.5 text-[10.5px] text-ink-faint">
                {previo === null ? "base" : `de ${previo.toLocaleString("es-AR")}`}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Serie diaria
   ══════════════════════════════════════════════════════════════════════════ */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function etiquetaDia(iso: string): string {
  // Se parte el ISO a mano en vez de `new Date(iso)`: ese constructor interpreta
  // "2026-08-15" como UTC y en Argentina lo muestra como el 14.
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number)
  void a
  return `${d} ${MESES[m - 1]}`
}

/**
 * Sesiones y leads del período.
 *
 * ── POR QUE SON DOS GRAFICOS Y NO DOS EJES ──
 *
 * Porque 500 sesiones y 5 leads en un mismo eje dejan la línea de leads pegada
 * al piso, y con dos ejes distintos se puede hacer que dos series cualesquiera
 * parezcan correlacionadas moviendo una escala. El eje doble es la forma más
 * elegante de mentir con un gráfico. Van apilados, compartiendo el eje de
 * tiempo: se comparan igual y ninguna escala está inventada.
 */
export function SerieDiaria({ puntos }: { puntos: PuntoSerie[] }) {
  const id = useId()
  const [activo, setActivo] = useState<number | null>(null)

  const geo = useMemo(() => {
    const W = 1100
    const PADL = 34
    const PADR = 12
    const H_SES = 132
    const HUECO = 22
    const H_LEA = 44
    const H = H_SES + HUECO + H_LEA + 18

    const n = Math.max(puntos.length, 2)
    const maxSes = Math.max(4, ...puntos.map((p) => p.sesiones))
    const maxLea = Math.max(2, ...puntos.map((p) => p.leads))

    const x = (i: number) => PADL + (i * (W - PADL - PADR)) / (n - 1)
    const y = (v: number) => H_SES - (v / maxSes) * (H_SES - 10)
    const paso = (W - PADL - PADR) / (n - 1)

    const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.sesiones).toFixed(1)}`).join(" ")
    const area = puntos.length ? `${linea} L${x(puntos.length - 1).toFixed(1)},${H_SES} L${PADL},${H_SES} Z` : ""

    // Cuatro marcas de fecha alcanzan: con treinta etiquetas se pisan y con una
    // sola no se ubica nada.
    const marcas = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), puntos.length - 1].filter(
      (v, i, a) => v >= 0 && v < puntos.length && a.indexOf(v) === i
    )

    return { W, PADL, PADR, H_SES, HUECO, H_LEA, H, maxSes, maxLea, x, y, paso, linea, area, marcas }
  }, [puntos])

  if (puntos.length === 0) return null

  const escalaY = [0, Math.round(geo.maxSes / 2), geo.maxSes]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Sesiones y leads por día, del ${etiquetaDia(puntos[0].dia)} al ${etiquetaDia(puntos[puntos.length - 1].dia)}`}
        onMouseLeave={() => setActivo(null)}
      >
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {escalaY.map((v) => (
          <g key={v}>
            <line
              x1={geo.PADL}
              x2={geo.W - geo.PADR}
              y1={geo.y(v)}
              y2={geo.y(v)}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray={v ? "2 4" : undefined}
            />
            <text x={geo.PADL - 7} y={geo.y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-faint)">
              {v}
            </text>
          </g>
        ))}

        <path d={geo.area} fill={`url(#grad-${id})`} />
        <path d={geo.linea} fill="none" stroke="var(--brand-600)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {activo !== null && (
          <line
            x1={geo.x(activo)}
            x2={geo.x(activo)}
            y1={0}
            y2={geo.H_SES + geo.HUECO + geo.H_LEA}
            stroke="var(--brand-400)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {activo !== null && (
          <circle
            cx={geo.x(activo)}
            cy={geo.y(puntos[activo].sesiones)}
            r="3.5"
            fill="var(--brand-600)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        )}

        <line
          x1={geo.PADL}
          x2={geo.W - geo.PADR}
          y1={geo.H_SES + geo.HUECO + geo.H_LEA}
          y2={geo.H_SES + geo.HUECO + geo.H_LEA}
          stroke="var(--line)"
        />
        <text x={geo.PADL - 7} y={geo.H_SES + geo.HUECO + geo.H_LEA + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-faint)">
          0
        </text>
        <text x={geo.PADL - 7} y={geo.H_SES + geo.HUECO + 11} textAnchor="end" fontSize="10" fill="var(--ink-faint)">
          {geo.maxLea}
        </text>

        {puntos.map((p, i) =>
          p.leads ? (
            <rect
              key={p.dia}
              x={geo.x(i) - 4.5}
              y={geo.H_SES + geo.HUECO + geo.H_LEA - (p.leads / geo.maxLea) * (geo.H_LEA - 6)}
              width="9"
              height={(p.leads / geo.maxLea) * (geo.H_LEA - 6)}
              rx="3"
              fill="var(--n-600)"
            />
          ) : null
        )}

        {geo.marcas.map((i) => (
          <text key={i} x={geo.x(i)} y={geo.H - 3} textAnchor="middle" fontSize="10" fill="var(--ink-faint)">
            {etiquetaDia(puntos[i].dia)}
          </text>
        ))}

        {/* Zonas de captura: el objetivo del mouse es la franja del día entera,
            no el punto de 3px. Sin esto hay que apuntar con precisión de cirujano. */}
        {puntos.map((p, i) => (
          <rect
            key={`z-${p.dia}`}
            x={geo.x(i) - geo.paso / 2}
            y={0}
            width={geo.paso}
            height={geo.H_SES + geo.HUECO + geo.H_LEA}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
          />
        ))}
      </svg>

      {activo !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-navy-850 px-2.5 py-1.5 text-[11.5px] leading-snug text-white shadow-e3"
          style={{
            left: `${(geo.x(activo) / geo.W) * 100}%`,
            top: `${(geo.y(puntos[activo].sesiones) / geo.H) * 100}%`,
          }}
        >
          <p className="text-[10.5px] text-n-400">{etiquetaDia(puntos[activo].dia)}</p>
          <p className="num">
            <b>{puntos[activo].sesiones}</b> sesiones
          </p>
          <p className="num">
            <b>{puntos[activo].leads}</b> {puntos[activo].leads === 1 ? "lead" : "leads"}
          </p>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Barras chicas
   ══════════════════════════════════════════════════════════════════════════ */

export function MiniBarras({
  filas,
  total,
  atenuar,
}: {
  filas: { clave: string; valor: number }[]
  total: number
  /** Claves que se pintan en gris: son dato, pero no son el dato bueno. */
  atenuar?: (clave: string) => boolean
}) {
  if (filas.length === 0) return <p className="text-[12.5px] text-ink-faint">Sin datos en el período.</p>

  return (
    <div className="flex flex-col gap-2">
      {filas.map((f) => (
        <div key={f.clave} className="grid grid-cols-[minmax(84px,120px)_1fr_74px] items-center gap-3 text-[12.5px]">
          <span className="truncate text-ink-secondary">{f.clave}</span>
          <span className="relative h-2 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", atenuar?.(f.clave) ? "bg-n-400" : "bg-brand-500")}
              style={{ width: total ? `${(f.valor / total) * 100}%` : 0 }}
            />
          </span>
          <span className="num text-right text-ink-muted">
            {f.valor} · {porcentaje(f.valor, total, 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Barra dentro de una celda
   ══════════════════════════════════════════════════════════════════════════ */

export function BarraCelda({ valor, maximo, tenue }: { valor: number; maximo: number; tenue?: boolean }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className={cn("h-1.5 shrink-0 rounded-full", tenue ? "bg-n-300" : "bg-brand-400")}
        style={{ width: maximo ? `${Math.max(2, (valor / maximo) * 56)}px` : 0 }}
        aria-hidden
      />
      <span className="num font-semibold">{valor.toLocaleString("es-AR")}</span>
    </span>
  )
}

/** Duración en la tabla de páginas, con el guion cuando no hay medición. */
export function Permanencia({ segundos }: { segundos: number }) {
  return <span className={cn("num", !segundos && "text-ink-faint")}>{duracion(segundos)}</span>
}
