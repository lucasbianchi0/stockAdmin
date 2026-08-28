"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, BookOpen, Check, Download, Layers, Scale } from "lucide-react"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { CorregirImputacionDialog } from "@/components/admin/corregir-imputacion-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ORIGEN_ASIENTO_LABEL,
  saldoNatural,
  type Asiento,
  type DocumentoSinAsiento,
  type Mayor,
  type OrigenAsiento,
  type SumasYSaldos,
} from "@/lib/admin/asientos"
import { descargarCsv } from "@/lib/admin/csv"
import { formatearImporte } from "@/lib/admin/moneda"
import { TIPO_CUENTA_LABEL } from "@/lib/admin/plan-cuentas"
import { cn } from "@/lib/utils"

/**
 * La contabilidad, en una pantalla con cuatro solapas.
 *
 * El orden no es casual: va de lo particular a lo general. **Diario** es cada
 * asiento como se escribió, **Mayor** es una cuenta a lo largo del tiempo,
 * **Sumas y saldos** es el estado de todas, y **Pendientes** es lo que todavía
 * no entró. Un contador recorre las cuatro en ese orden cuando revisa un mes.
 *
 * Todo se lee en pesos. La moneda original de cada línea está a la vista como
 * dato, pero las columnas suman una sola moneda: mezclarlas es el error que el
 * punto 6 del documento del contador pedía arreglar.
 */

type Solapa = "diario" | "mayor" | "saldos" | "pendientes"

const SOLAPAS: { valor: Solapa; etiqueta: string; icono: typeof BookOpen }[] = [
  { valor: "diario", etiqueta: "Libro diario", icono: BookOpen },
  { valor: "mayor", etiqueta: "Mayor", icono: Layers },
  { valor: "saldos", etiqueta: "Sumas y saldos", icono: Scale },
  { valor: "pendientes", etiqueta: "Sin asentar", icono: AlertTriangle },
]

export function ContabilidadClient() {
  const [solapa, setSolapa] = useState<Solapa>("diario")
  const [pendientes, setPendientes] = useState(0)

  // El contador de pendientes vive acá y no adentro de su solapa: es una alerta,
  // y una alerta que solo se ve entrando a la pantalla donde está el problema no
  // sirve de nada.
  useEffect(() => {
    fetch("/api/admin/contabilidad/pendientes")
      .then((r) => r.json())
      .then((d) => setPendientes(d.cantidad ?? 0))
      .catch(() => setPendientes(0))
  }, [])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1">
        {SOLAPAS.map((s) => (
          <button
            key={s.valor}
            onClick={() => setSolapa(s.valor)}
            aria-pressed={solapa === s.valor}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors",
              solapa === s.valor
                ? "bg-brand-50 text-brand-700"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink"
            )}
          >
            <s.icono className="h-3.5 w-3.5" />
            {s.etiqueta}
            {s.valor === "pendientes" && pendientes > 0 && (
              <Badge tone="warning" size="sm">
                {pendientes}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {solapa === "diario" && <Diario />}
      {solapa === "mayor" && <MayorDeCuenta />}
      {solapa === "saldos" && <Saldos />}
      {solapa === "pendientes" && <Pendientes onContar={setPendientes} />}
    </>
  )
}

/* ── Rango de fechas, compartido ──────────────────────────────────────────── */

function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[12px] text-ink-muted" htmlFor="desde">
        Desde
      </label>
      <Input
        id="desde"
        type="date"
        value={desde}
        onChange={(e) => onDesde(e.target.value)}
        className="w-[150px]"
      />
      <label className="text-[12px] text-ink-muted" htmlFor="hasta">
        Hasta
      </label>
      <Input
        id="hasta"
        type="date"
        value={hasta}
        onChange={(e) => onHasta(e.target.value)}
        className="w-[150px]"
      />
    </div>
  )
}

/* ── 1 · Libro diario ─────────────────────────────────────────────────────── */

function Diario() {
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [truncado, setTruncado] = useState(false)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [origen, setOrigen] = useState("")

  useEffect(() => {
    setCargando(true)
    const p = new URLSearchParams()
    if (desde) p.set("desde", desde)
    if (hasta) p.set("hasta", hasta)
    if (origen) p.set("origen", origen)

    fetch(`/api/admin/contabilidad/diario?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setAsientos(d.asientos ?? [])
        setTruncado(Boolean(d.truncado))
      })
      .catch(() => setAsientos([]))
      .finally(() => setCargando(false))
  }, [desde, hasta, origen])

  const exportar = () =>
    descargarCsv(
      "libro-diario.csv",
      ["Fecha", "Asiento", "Origen", "Descripción", "Cuenta", "Detalle", "Debe", "Haber"],
      asientos.flatMap((a) =>
        a.lineas.map((l) => [
          a.fecha,
          a.numero,
          ORIGEN_ASIENTO_LABEL[a.origen],
          a.descripcion,
          `${l.cuentaCodigo} · ${l.cuentaNombre}`,
          l.auxiliarNombre ?? l.detalle ?? "",
          l.debeArs || "",
          l.haberArs || "",
        ])
      )
    )

  if (cargando) return <LoadingState label="Cargando el libro diario…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
          <select
            aria-label="Origen"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            className="h-9 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">Todos los orígenes</option>
            {(Object.keys(ORIGEN_ASIENTO_LABEL) as OrigenAsiento[]).map((o) => (
              <option key={o} value={o}>
                {ORIGEN_ASIENTO_LABEL[o]}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!asientos.length}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {truncado && (
        <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          Se muestran los asientos más recientes del período. Acotá el rango de fechas para verlos
          todos.
        </p>
      )}

      {!asientos.length ? (
        <EmptyState
          icon={BookOpen}
          title="No hay asientos en el período"
          description="Los asientos se generan solos al cargar facturas, recibos y movimientos."
        />
      ) : (
        <div className="space-y-3">
          {asientos.map((a) => (
            <AsientoCard key={a.id} asiento={a} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Un asiento como se escribe en un libro: cabecera y sus líneas debajo. */
function AsientoCard({ asiento }: { asiento: Asiento }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="num font-mono text-[12px] font-semibold text-brand-600">
            N° {asiento.numero}
          </span>
          <span className="text-[12.5px] font-medium text-ink">{asiento.descripcion}</span>
          <Badge tone="neutral" size="sm">
            {ORIGEN_ASIENTO_LABEL[asiento.origen]}
          </Badge>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="num font-mono text-[11.5px] text-ink-muted">
            {formatearFecha(asiento.fecha)}
          </span>
          <span className="num font-mono text-[12px] font-semibold text-ink">
            {formatearImporte(asiento.totalArs)}
          </span>
        </div>
      </div>

      <Table>
        <TableBody>
          {asiento.lineas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="w-[45%]">
                {/* La sangría del haber es la convención de cualquier libro
                    diario en papel: el crédito va corrido a la derecha. */}
                <div className={cn(l.haberArs > 0 && "pl-6")}>
                  <p className="text-[12.5px] text-ink">
                    <span className="font-mono text-[11px] text-ink-faint">{l.cuentaCodigo}</span>{" "}
                    {l.cuentaNombre}
                  </p>
                  {(l.auxiliarNombre || l.detalle) && (
                    <p className="text-[11px] text-ink-muted">
                      {l.auxiliarNombre ?? l.detalle}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {l.moneda !== "ARS" && (
                  <span className="num font-mono text-[10.5px] text-ink-faint">
                    {formatearImporte(l.debe || l.haber, l.moneda)}
                  </span>
                )}
              </TableCell>
              <TableCell className="num w-[16%] text-right font-mono text-[12px] text-ink">
                {l.debeArs > 0 ? formatearImporte(l.debeArs, "ARS", { simbolo: false }) : ""}
              </TableCell>
              <TableCell className="num w-[16%] text-right font-mono text-[12px] text-ink">
                {l.haberArs > 0 ? formatearImporte(l.haberArs, "ARS", { simbolo: false }) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ── 2 · Mayor ────────────────────────────────────────────────────────────── */

function MayorDeCuenta() {
  const [cuenta, setCuenta] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [mayor, setMayor] = useState<Mayor | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!cuenta) {
      setMayor(null)
      return
    }
    setCargando(true)
    const p = new URLSearchParams({ cuenta })
    if (desde) p.set("desde", desde)
    if (hasta) p.set("hasta", hasta)

    fetch(`/api/admin/contabilidad/mayor?${p}`)
      .then((r) => r.json())
      .then((d) => setMayor(d.cuenta ? d : null))
      .catch(() => setMayor(null))
      .finally(() => setCargando(false))
  }, [cuenta, desde, hasta])

  const exportar = () => {
    if (!mayor) return
    descargarCsv(
      `mayor-${mayor.cuenta.codigo}.csv`,
      [
        "Fecha",
        "Asiento",
        "Origen",
        "Concepto",
        "Auxiliar",
        "Débitos",
        "Créditos",
        "Saldo",
        "Detalle",
      ],
      mayor.filas.map((f) => [
        f.fecha,
        f.numero,
        ORIGEN_ASIENTO_LABEL[f.origen],
        f.descripcion,
        f.auxiliarNombre ?? "",
        f.debeArs || "",
        f.haberArs || "",
        f.saldoArs,
        f.detalle ?? "",
      ])
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[320px]">
            <label htmlFor="cuenta-mayor" className="mb-1 block text-[12px] text-ink-muted">
              Cuenta
            </label>
            <SelectorCuenta id="cuenta-mayor" valor={cuenta} onElegir={setCuenta} />
          </div>
          <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!mayor?.filas.length}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {!cuenta ? (
        <EmptyState
          icon={Layers}
          title="Elegí una cuenta"
          description="El mayor muestra todo lo que pasó por una cuenta, con el saldo corrido."
        />
      ) : cargando ? (
        <LoadingState label="Cargando el mayor…" />
      ) : !mayor ? (
        <EmptyState icon={Layers} title="No se pudo cargar el mayor" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Cifra etiqueta="Saldo inicial" valor={mayor.periodo.saldoInicial} />
            <Cifra etiqueta="Débitos" valor={mayor.periodo.debe} />
            <Cifra etiqueta="Créditos" valor={mayor.periodo.haber} />
            <Cifra
              etiqueta="Saldo final"
              valor={saldoNatural(mayor.cuenta.tipo, mayor.periodo.saldoFinal)}
              destacado
            />
          </div>

          {!mayor.filas.length ? (
            <EmptyState icon={Layers} title="La cuenta no tuvo movimientos en el período" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
              <Table>
                <TableHeader>
                  {/* Las mismas columnas y en el mismo orden que el extracto
                      de una cuenta bancaria —FECHA · CONCEPTO · DÉBITOS ·
                      CRÉDITOS · SALDO · DETALLE—, que es como lo pidieron: «que
                      aparezcan los movimientos relacionados a esa cuenta en el
                      mismo formato que armamos los BANCOS». Leer el mayor de
                      Proveedores y el extracto del Galicia con la misma grilla
                      es lo que permite conciliar uno contra otro sin traducir
                      mentalmente dos vocabularios. */}
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Asiento</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Débitos</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mayor.filas.map((f, i) => (
                    <TableRow key={`${f.asientoId}-${i}`}>
                      <TableCell className="num whitespace-nowrap font-mono text-[11.5px] text-ink-muted">
                        {formatearFecha(f.fecha)}
                      </TableCell>
                      <TableCell className="num font-mono text-[11.5px] text-brand-600">
                        {f.numero}
                      </TableCell>
                      <TableCell>
                        <p className="text-[12.5px] text-ink">{f.descripcion}</p>
                        {/* El submayor va acá y no en Detalle: en el mayor de
                            Proveedores, de quién es la deuda es parte de qué
                            operación fue, no una nota al pie. */}
                        {f.auxiliarNombre && (
                          <p className="text-[11px] text-ink-muted">{f.auxiliarNombre}</p>
                        )}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px]">
                        {f.debeArs > 0 ? formatearImporte(f.debeArs, "ARS", { simbolo: false }) : ""}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px]">
                        {f.haberArs > 0
                          ? formatearImporte(f.haberArs, "ARS", { simbolo: false })
                          : ""}
                      </TableCell>
                      <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
                        {formatearImporte(saldoNatural(mayor.cuenta.tipo, f.saldoArs), "ARS", {
                          simbolo: false,
                        })}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-[11.5px] text-ink-muted">
                        {f.detalle ? (
                          <span className="line-clamp-2" title={f.detalle}>
                            {f.detalle}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── 3 · Sumas y saldos ───────────────────────────────────────────────────── */

function Saldos() {
  const [datos, setDatos] = useState<(SumasYSaldos & { truncado?: boolean }) | null>(null)
  const [cargando, setCargando] = useState(true)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")

  const cargar = useCallback(() => {
    setCargando(true)
    const p = new URLSearchParams()
    if (desde) p.set("desde", desde)
    if (hasta) p.set("hasta", hasta)

    fetch(`/api/admin/contabilidad/sumas-y-saldos?${p}`)
      .then((r) => r.json())
      .then((d) => setDatos(d.filas ? d : null))
      .catch(() => setDatos(null))
      .finally(() => setCargando(false))
  }, [desde, hasta])

  useEffect(cargar, [cargar])

  const exportar = () => {
    if (!datos) return
    descargarCsv(
      "sumas-y-saldos.csv",
      ["Código", "Cuenta", "Rubro", "Debe", "Haber", "Saldo"],
      datos.filas.map((f) => [
        f.codigo,
        f.nombre,
        TIPO_CUENTA_LABEL[f.tipo],
        f.debeArs,
        f.haberArs,
        f.saldoArs,
      ])
    )
  }

  if (cargando) return <LoadingState label="Cargando sumas y saldos…" />
  if (!datos) return <EmptyState icon={Scale} title="No se pudo cargar sumas y saldos" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <Button variant="outline" size="sm" onClick={exportar} disabled={!datos.filas.length}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {/* El veredicto arriba de todo. Si la partida doble no cierra, cualquier
          número de esta pantalla es sospechoso y hay que decirlo primero. */}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border px-4 py-3",
          datos.cuadra
            ? "border-success-line bg-success-soft"
            : "border-danger-line bg-danger-soft"
        )}
      >
        {datos.cuadra ? (
          <Check className="h-4 w-4 shrink-0 text-success-text" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-text" />
        )}
        <div>
          <p
            className={cn(
              "text-[12.5px] font-semibold",
              datos.cuadra ? "text-success-text" : "text-danger-text"
            )}
          >
            {datos.cuadra
              ? "La contabilidad cuadra"
              : `Descuadre de ${formatearImporte(datos.totales.diferencia)}`}
          </p>
          <p className="text-[11.5px] text-ink-muted">
            Débitos {formatearImporte(datos.totales.debe)} · Créditos{" "}
            {formatearImporte(datos.totales.haber)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {datos.porRubro.map((r) => (
          <Cifra
            key={r.tipo}
            etiqueta={TIPO_CUENTA_LABEL[r.tipo]}
            valor={saldoNatural(r.tipo, r.saldo)}
            nota={`${r.cuentas} cuenta${r.cuentas === 1 ? "" : "s"}`}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Rubro</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.filas.map((f) => (
              <TableRow key={f.cuentaId}>
                <TableCell>
                  <p className="text-[12.5px] text-ink">
                    <span className="font-mono text-[11px] text-ink-faint">{f.codigo}</span>{" "}
                    {f.nombre}
                  </p>
                </TableCell>
                <TableCell className="text-[11.5px] text-ink-muted">
                  {TIPO_CUENTA_LABEL[f.tipo]}
                </TableCell>
                <TableCell className="num text-right font-mono text-[12px]">
                  {formatearImporte(f.debeArs, "ARS", { simbolo: false })}
                </TableCell>
                <TableCell className="num text-right font-mono text-[12px]">
                  {formatearImporte(f.haberArs, "ARS", { simbolo: false })}
                </TableCell>
                <TableCell className="num text-right font-mono text-[12px] font-semibold text-ink">
                  {formatearImporte(saldoNatural(f.tipo, f.saldoArs), "ARS", { simbolo: false })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/* ── 4 · Sin asentar ──────────────────────────────────────────────────────── */

function Pendientes({ onContar }: { onContar: (n: number) => void }) {
  const [docs, setDocs] = useState<DocumentoSinAsiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [corrigiendo, setCorrigiendo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/contabilidad/pendientes")
      const d = await res.json()
      setDocs(d.documentos ?? [])
      onContar(d.cantidad ?? 0)
    } catch {
      setDocs([])
    } finally {
      setCargando(false)
    }
  }, [onContar])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando) return <LoadingState label="Buscando documentos sin asentar…" />

  if (!docs.length) {
    return (
      <EmptyState
        icon={Check}
        title="Todo asentado"
        description="Cada factura, recibo y movimiento tiene su asiento en el libro diario."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 sm:flex-row sm:items-center">
        <p className="flex-1 text-[12px] text-warning-text">
          Estos documentos están en los saldos pero no en el mayor, así que el balance no los
          incluye. Casi siempre alcanza con imputarles la cuenta contable que les falta.
        </p>
        <Button size="sm" onClick={() => setCorrigiendo(true)} className="shrink-0">
          Corregir {docs.length}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>De quién</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={`${d.origen}-${d.id}`}>
                <TableCell className="num whitespace-nowrap font-mono text-[11.5px] text-ink-muted">
                  {formatearFecha(d.fecha)}
                </TableCell>
                <TableCell className="text-[12.5px] text-ink">{d.referencia}</TableCell>
                <TableCell className="text-[12px] text-ink-secondary">
                  {d.contraparte ?? "—"}
                </TableCell>
                <TableCell className="text-[11.5px] text-ink-muted">{d.motivo}</TableCell>
                <TableCell className="num text-right font-mono text-[12px]">
                  {formatearImporte(d.importeArs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CorregirImputacionDialog
        abierto={corrigiendo}
        documentos={docs}
        onCerrar={() => setCorrigiendo(false)}
        onCorregido={cargar}
      />
    </div>
  )
}

/* ── Piezas chicas ────────────────────────────────────────────────────────── */

function Cifra({
  etiqueta,
  valor,
  nota,
  destacado,
}: {
  etiqueta: string
  valor: number
  nota?: string
  destacado?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{etiqueta}</p>
      <p
        className={cn(
          "num mt-1 font-mono text-[17px] font-semibold",
          destacado ? "text-brand-600" : "text-ink"
        )}
      >
        {formatearImporte(valor)}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-muted">{nota}</p>}
    </div>
  )
}

/** `2026-08-13` → `13/8/26`, que es como se lee una fecha en una tabla. */
function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}
