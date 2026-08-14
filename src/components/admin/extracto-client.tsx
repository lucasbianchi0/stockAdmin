"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  Download,
  Loader2,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { MovimientoDetalle } from "@/components/admin/movimiento-detalle"
import { MovimientoDialog } from "@/components/admin/movimiento-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import {
  PERIODOS,
  PERIODO_LABEL,
  rangoDe,
  type Extracto,
  type FilaExtracto,
  type Periodo,
} from "@/lib/admin/extracto"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { ORIGENES_MOVIMIENTO, ORIGEN_LABEL, type Movimiento } from "@/lib/admin/movimientos"
import { cn } from "@/lib/utils"

/**
 * El extracto de una cuenta, con el formato del resumen que manda el banco:
 *
 *     FECHA · CONCEPTO · DÉBITOS · CRÉDITOS · SALDO · DETALLE
 *
 * Es el formato del archivo que pasó administración, y no es capricho de
 * presentación: es el único que permite poner el extracto del sistema al lado
 * del del banco y compararlos renglón por renglón. Un listado con una sola
 * columna de importe con signo obliga a sumar mentalmente para llegar al mismo
 * número que el banco ya trae calculado.
 *
 * Va del movimiento más viejo al más nuevo, al revés que el resto de las listas
 * del módulo. La columna de saldo es un acumulado y leída de abajo hacia arriba
 * no querría decir nada.
 */
export function ExtractoClient({ cuentaId }: { cuentaId: string }) {
  const [datos, setDatos] = useState<Extracto | null>(null)
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [origen, setOrigen] = useState("")
  const [conciliado, setConciliado] = useState<"" | "si" | "no">("")
  const [busqueda, setBusqueda] = useState("")
  const [q, setQ] = useState("")

  const [ver, setVer] = useState<FilaExtracto | null>(null)
  const [nuevo, setNuevo] = useState<null | "gasto" | "ajuste">(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Se espera a que deje de tipear: una consulta por tecla contra una tabla de
  // movimientos es la forma más rápida de que la pantalla se sienta lenta.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const rango = useMemo(() => rangoDe(periodo), [periodo])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (rango.desde) params.set("desde", rango.desde)
      if (rango.hasta) params.set("hasta", rango.hasta)
      if (origen) params.set("origen", origen)
      if (conciliado) params.set("conciliado", conciliado)
      if (q) params.set("q", q)

      const res = await fetch(`/api/admin/cuentas/${cuentaId}/extracto?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el extracto")
      setDatos(data as Extracto)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el extracto")
    } finally {
      setCargando(false)
    }
  }, [cuentaId, rango.desde, rango.hasta, origen, conciliado, q])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Para el diálogo de alta, que necesita la lista completa por si se carga una
  // transferencia.
  useEffect(() => {
    fetch("/api/admin/cuentas")
      .then((r) => r.json())
      .then((d) => setCuentas(d.cuentas ?? []))
      .catch(() => setCuentas([]))
  }, [])

  const conciliar = async (f: FilaExtracto) => {
    setOcupado(f.id)
    try {
      const res = await fetch(`/api/admin/movimientos/${f.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conciliado: !f.conciliado }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo actualizar")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar")
    } finally {
      setOcupado(null)
    }
  }

  /** El extracto tal cual se ve, para mandárselo al contador sin retocar. */
  const exportar = () => {
    if (!datos) return
    const filas = [
      ["FECHA", "CONCEPTO", "DEBITOS", "CREDITOS", "SALDO", "DETALLE"],
      ...datos.filas.map((f) => [
        f.fecha,
        f.concepto,
        f.debito || "",
        f.credito || "",
        f.saldo,
        [f.detalle, f.referencia].filter(Boolean).join(" · "),
      ]),
    ]
    const csv = filas
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    a.download = `extracto-${datos.cuenta.nombre.toLowerCase().replace(/\s+/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (cargando && !datos) return <LoadingState label="Cargando el extracto…" />
  if (error && !datos) return <ErrorState message={error} onRetry={cargar} />
  if (!datos) return null

  const { cuenta, periodo: p, filas } = datos
  const hayFiltros = Boolean(origen || conciliado || q)

  return (
    <>
      {/* ── Cabecera del período ──────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra rotulo="Saldo al inicio" valor={p.saldoInicial} moneda={cuenta.moneda} />
        <Cifra rotulo="Débitos" valor={p.debitos} moneda={cuenta.moneda} tono="danger" />
        <Cifra rotulo="Créditos" valor={p.creditos} moneda={cuenta.moneda} tono="success" />
        <Cifra rotulo="Saldo al cierre" valor={p.saldoFinal} moneda={cuenta.moneda} fuerte />
      </div>

      {/* El saldo del período puede no ser el de la cuenta: si se está mirando
          agosto y estamos en septiembre, el de la cuenta incluye lo que pasó
          después. Decirlo evita que parezca un error de cálculo. */}
      {Math.abs(p.saldoFinal - cuenta.saldoActual) > 0.01 && (
        <p className="mb-4 text-[12px] text-ink-muted">
          El saldo actual de la cuenta es{" "}
          <span className="num font-medium text-ink">
            {formatearImporte(cuenta.saldoActual, cuenta.moneda)}
          </span>
          , contando los movimientos fuera del período elegido.
        </p>
      )}

      <div className="panel overflow-hidden">
        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-b border-line bg-surface-subtle px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
              {PERIODOS.map((v) => (
                <button
                  key={v}
                  onClick={() => setPeriodo(v)}
                  aria-pressed={periodo === v}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    periodo === v
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {PERIODO_LABEL[v]}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={exportar} disabled={filas.length === 0}>
                <Download className="h-3.5 w-3.5" />
                Exportar
              </Button>
              <Button onClick={() => setNuevo("gasto")}>
                <Plus className="h-3.5 w-3.5" />
                Registrar movimiento
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por detalle o referencia…"
                className="pl-9 pr-9"
                type="search"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              aria-label="Filtrar por origen"
              className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-ink"
            >
              <option value="">Todos los orígenes</option>
              {ORIGENES_MOVIMIENTO.map((o) => (
                <option key={o} value={o}>
                  {ORIGEN_LABEL[o]}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
              {(
                [
                  ["", "Todos"],
                  ["no", "Sin conciliar"],
                  ["si", "Conciliados"],
                ] as const
              ).map(([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setConciliado(v)}
                  aria-pressed={conciliado === v}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    conciliado === v
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            <p className="ml-auto text-[11.5px] text-ink-muted">
              {p.cantidad} {p.cantidad === 1 ? "movimiento" : "movimientos"}
              {p.sinConciliar > 0 && ` · ${p.sinConciliar} sin conciliar`}
            </p>
          </div>
        </div>

        {p.truncado && (
          <p className="border-b border-warning-line bg-warning-soft px-4 py-2 text-[12px] text-warning-text">
            El extracto se cortó en {p.cantidad} movimientos. Achicá el período para ver el
            resto — los totales de arriba son solo de lo que se está mostrando.
          </p>
        )}

        {/* ── El extracto ─────────────────────────────────────────────────── */}
        <div
          className={cn(
            "overflow-x-auto transition-opacity duration-150",
            cargando && "pointer-events-none opacity-55"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[92px]">Fecha</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Débitos</TableHead>
                <TableHead className="text-right">Créditos</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length > 0 ? (
                <>
                  {/* El arranque como una fila más: es lo que hace que la
                      columna de saldo se pueda seguir de punta a punta sin
                      preguntarse de dónde salió el primer número. */}
                  <TableRow className="bg-surface-subtle">
                    <TableCell className="num whitespace-nowrap text-ink-muted">
                      {p.desde ? formatearFecha(p.desde) : "Inicio"}
                    </TableCell>
                    <TableCell className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                      Saldo anterior
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="num text-right font-semibold text-ink-secondary">
                      {formatearImporte(p.saldoInicial, cuenta.moneda, { simbolo: false })}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>

                  {filas.map((f) => (
                    <TableRow
                      key={f.id}
                      onClick={() => setVer(f)}
                      className={cn("cursor-pointer", f.conciliado && "bg-success-soft/20")}
                    >
                      <TableCell className="num whitespace-nowrap text-ink-secondary">
                        {formatearFecha(f.fecha)}
                      </TableCell>

                      <TableCell>
                        <span className="text-[12.5px] font-medium uppercase tracking-wide text-ink">
                          {f.concepto}
                        </span>
                        {f.cuentaContableNombre && (
                          <span className="block truncate text-[11px] text-ink-faint">
                            {f.cuentaContableNombre}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="num text-right text-danger-text">
                        {f.debito > 0
                          ? formatearImporte(f.debito, cuenta.moneda, { simbolo: false })
                          : ""}
                      </TableCell>

                      <TableCell className="num text-right text-success-text">
                        {f.credito > 0
                          ? formatearImporte(f.credito, cuenta.moneda, { simbolo: false })
                          : ""}
                      </TableCell>

                      <TableCell
                        className={cn(
                          "num text-right font-semibold",
                          f.saldo < 0 ? "text-danger-text" : "text-ink"
                        )}
                      >
                        {formatearImporte(f.saldo, cuenta.moneda, { simbolo: false })}
                      </TableCell>

                      <TableCell className="max-w-[280px]">
                        {f.detalle ? (
                          <span className="block truncate text-[12.5px] text-ink-secondary" title={f.detalle}>
                            {f.detalle}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
                          {f.referencia && <span className="num">{f.referencia}</span>}
                          {/* De dónde salió cuando el documento venía en otra
                              moneda. Es lo que permite explicar por qué entraron
                              $ 4.097.373,69 y no un número redondo. */}
                          {f.monedaOrigen && f.importeOrigen !== null && (
                            <span className="num">
                              orig. {formatearImporte(f.importeOrigen, f.monedaOrigen)}
                            </span>
                          )}
                        </span>
                      </TableCell>

                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={ocupado === f.id}
                            onClick={() => conciliar(f)}
                            aria-label={f.conciliado ? "Desmarcar conciliado" : "Marcar conciliado"}
                            title={f.conciliado ? "Desmarcar conciliado" : "Marcar conciliado"}
                            className={cn(f.conciliado && "text-success")}
                          >
                            {ocupado === f.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  <TableRow className="border-t-2 border-line-strong bg-surface-subtle">
                    <TableCell colSpan={2} className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                      Totales del período
                    </TableCell>
                    <TableCell className="num text-right font-semibold text-danger-text">
                      {formatearImporte(p.debitos, cuenta.moneda, { simbolo: false })}
                    </TableCell>
                    <TableCell className="num text-right font-semibold text-success-text">
                      {formatearImporte(p.creditos, cuenta.moneda, { simbolo: false })}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num text-right font-bold",
                        p.saldoFinal < 0 ? "text-danger-text" : "text-ink"
                      )}
                    >
                      {formatearImporte(p.saldoFinal, cuenta.moneda, { simbolo: false })}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={Wallet}
                      title={
                        hayFiltros
                          ? "Ningún movimiento coincide"
                          : "Sin movimientos en este período"
                      }
                      description={
                        hayFiltros
                          ? "Probá quitando algún filtro o ampliando el período."
                          : "Los cobros y pagos aparecen acá solos. También podés registrar un gasto o un ajuste."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <MovimientoDetalle
        abierto={ver !== null}
        movimiento={ver ? (movimientoDesdeFila(ver, cuenta) as Movimiento) : null}
        onCerrar={() => setVer(null)}
        onConciliar={() => {
          if (ver) {
            conciliar(ver)
            setVer(null)
          }
        }}
      />

      <MovimientoDialog
        modo={nuevo}
        cuentas={cuentas}
        cuentaFijaId={cuentaId}
        borrador={null}
        onCerrar={() => setNuevo(null)}
        onGuardado={() => {
          setNuevo(null)
          toast.success("Movimiento registrado")
          cargar()
        }}
      />
    </>
  )
}

/** La fila del extracto tiene lo que necesita la tabla; el panel de detalle
 *  espera un `Movimiento`. Se completa con lo que la cuenta ya sabe en vez de
 *  pedir la fila entera de vuelta al servidor. */
function movimientoDesdeFila(f: FilaExtracto, cuenta: Extracto["cuenta"]) {
  const entra = f.credito > 0
  return {
    id: f.id,
    cuentaId: cuenta.id,
    cuentaNombre: cuenta.nombre,
    fecha: f.fecha,
    tipo: entra ? "ingreso" : "egreso",
    importe: entra ? f.credito : f.debito,
    moneda: cuenta.moneda,
    tc: null,
    importeArs: null,
    importeUsd: null,
    importeOrigen: f.importeOrigen,
    monedaOrigen: f.monedaOrigen,
    signo: entra ? 1 : -1,
    origen: f.origen,
    pagoId: f.pagoId,
    cuentaContableId: null,
    cuentaContableNombre: f.cuentaContableNombre,
    referencia: f.referencia,
    detalle: f.detalle,
    categoria: null,
    conciliado: f.conciliado,
    createdAt: f.fecha,
  }
}

function Cifra({
  rotulo,
  valor,
  moneda,
  tono,
  fuerte,
}: {
  rotulo: string
  valor: number
  moneda: "ARS" | "USD"
  tono?: "success" | "danger"
  fuerte?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 tracking-[-0.02em]",
          fuerte ? "text-[20px] font-bold" : "text-[17px] font-semibold",
          tono === "success"
            ? "text-success-text"
            : tono === "danger"
              ? "text-danger-text"
              : valor < 0
                ? "text-danger-text"
                : "text-ink"
        )}
      >
        {formatearImporte(valor, moneda)}
      </p>
    </div>
  )
}
