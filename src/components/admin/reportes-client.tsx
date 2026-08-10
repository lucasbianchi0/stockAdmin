"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, PieChart, Search, Wallet } from "lucide-react"

import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
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
import { formatearCuit } from "@/lib/admin/cuit"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import type { Cliente } from "@/lib/admin/entidades"
import { formatearImporte, formatearTc } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Los reportes operativos del pliego, en una sola pantalla con pestañas.
 *
 * Dos reglas que comparten todos:
 *
 *  · **Sin paginación.** El producto de un reporte son los totales, y un total
 *    de la página visible no contesta ninguna pregunta útil.
 *  · **Totales por moneda, nunca consolidados.** Sumar pesos y dólares en un
 *    número obliga a elegir un tipo de cambio, y cualquiera que se elija engaña
 *    para algún uso.
 */

type Pendiente = {
  id: string
  entidad: string
  clase: string
  numero: string
  fecha: string
  fechaVencimiento: string | null
  moneda: "ARS" | "USD"
  tc: number
  total: number
  imputado: number
  saldo: number
  detalle: string | null
  vencida: boolean
}

type Totales = {
  cantidad: number
  ars: number
  usd: number
  vencidas: number
  vencidoArs: number
  vencidoUsd: number
  truncado: boolean
}

type FilaCuenta = {
  fecha: string
  tipo: string
  comprobante: string | null
  detalle: string | null
  moneda: "ARS" | "USD"
  importe: number
  importeUsd: number | null
  tc: number
  importeArs: number
  saldo: number
}

type Solapa = "cobrar" | "pagar" | "saldos" | "cuenta"

/** La ficha que llega elegida desde otra pantalla. */
type Preseleccion = { tipo: "cliente" | "proveedor"; entidadId: string }

const SOLAPAS: { valor: Solapa; etiqueta: string }[] = [
  { valor: "cobrar", etiqueta: "Pendientes de cobro" },
  { valor: "pagar", etiqueta: "Pendientes de pago" },
  { valor: "saldos", etiqueta: "Saldos por cuenta" },
  { valor: "cuenta", etiqueta: "Estado de cuenta" },
]

export function ReportesClient() {
  const [solapa, setSolapa] = useState<Solapa>("cobrar")
  const [inicial, setInicial] = useState<Preseleccion | null>(null)

  /**
   * La solapa y la ficha pueden venir en la URL: es lo que hace que el botón
   * "Estado de cuenta" del panel de un cliente caiga directo en su reporte en
   * vez de dejar a alguien buscándolo otra vez en el selector.
   *
   * Se lee de `window` dentro de un efecto y no con `useSearchParams` para no
   * arrastrar toda la pantalla a un límite de Suspense por un parámetro
   * opcional que solo se usa al entrar.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    const pedida = params.get("solapa")
    if (pedida && SOLAPAS.some((s) => s.valor === pedida)) setSolapa(pedida as Solapa)

    const entidadId = params.get("entidadId")
    if (entidadId) {
      setInicial({
        tipo: params.get("tipo") === "proveedor" ? "proveedor" : "cliente",
        entidadId,
      })
    }
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
              "rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors",
              solapa === s.valor
                ? "bg-brand-50 text-brand-700"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink"
            )}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>

      {solapa === "cobrar" && <Pendientes tipo="venta" />}
      {solapa === "pagar" && <Pendientes tipo="compra" />}
      {solapa === "saldos" && <Saldos />}
      {solapa === "cuenta" && <EstadoDeCuenta inicial={inicial} />}
    </>
  )
}

/* ── Pendientes de cobro / de pago ────────────────────────────────────────── */

function Pendientes({ tipo }: { tipo: "venta" | "compra" }) {
  const [filas, setFilas] = useState<Pendiente[]>([])
  const [totales, setTotales] = useState<Totales | null>(null)
  const [cargando, setCargando] = useState(true)

  const esVenta = tipo === "venta"

  useEffect(() => {
    setCargando(true)
    fetch(`/api/admin/reportes/pendientes?tipo=${tipo}`)
      .then((r) => r.json())
      .then((d) => {
        setFilas(d.filas ?? [])
        setTotales(d.totales ?? null)
      })
      .catch(() => setFilas([]))
      .finally(() => setCargando(false))
  }, [tipo])

  const exportar = () =>
    descargarCsv(
      `pendientes-${esVenta ? "cobro" : "pago"}.csv`,
      [
        esVenta ? "Cliente" : "Proveedor",
        "Tipo",
        "Número",
        "Fecha",
        "Vencimiento",
        "Moneda",
        "TC",
        "Total",
        "Cobrado",
        "Saldo",
        "Detalle",
      ],
      filas.map((f) => [
        f.entidad,
        f.clase,
        f.numero,
        f.fecha,
        f.fechaVencimiento ?? "",
        f.moneda,
        f.tc,
        f.total,
        f.imputado,
        f.saldo,
        f.detalle ?? "",
      ])
    )

  if (cargando) return <LoadingState label="Armando el reporte…" />

  return (
    <div className="panel overflow-hidden">
      {/* Los totales arriba: son el producto del reporte, no un pie de página. */}
      {totales && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
          <Total rotulo="Comprobantes" valor={String(totales.cantidad)} />
          {totales.ars > 0 && (
            <Total rotulo="En pesos" valor={formatearImporte(totales.ars, "ARS")} />
          )}
          {totales.usd > 0 && (
            <Total rotulo="En dólares" valor={formatearImporte(totales.usd, "USD")} />
          )}
          {totales.vencidas > 0 && (
            <div className="flex items-center gap-2">
              <Badge tone="danger" size="md">
                {totales.vencidas} vencida{totales.vencidas !== 1 ? "s" : ""}
              </Badge>
              <span className="num text-[12px] text-danger-text">
                {totales.vencidoArs > 0 && formatearImporte(totales.vencidoArs, "ARS")}
                {totales.vencidoArs > 0 && totales.vencidoUsd > 0 && " · "}
                {totales.vencidoUsd > 0 && formatearImporte(totales.vencidoUsd, "USD")}
              </span>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={exportar} className="ml-auto">
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      )}

      {totales?.truncado && (
        <p className="border-b border-warning-line bg-warning-soft px-5 py-2 text-[11.5px] text-warning-text">
          El reporte se cortó en 2000 comprobantes: los totales de arriba no incluyen
          todo. Filtrá por período para verlo completo.
        </p>
      )}

      {filas.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title={esVenta ? "No hay nada por cobrar" : "No hay nada por pagar"}
          description="Todos los comprobantes están saldados."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{esVenta ? "Cliente" : "Proveedor"}</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.id} className={cn(f.vencida && "bg-danger-soft/40")}>
                <TableCell className="font-medium text-ink">{f.entidad}</TableCell>
                <TableCell>
                  <Badge tone="neutral" size="sm">
                    {f.clase}
                  </Badge>
                  <span className="num ml-2 text-[12px] text-ink-secondary">{f.numero}</span>
                </TableCell>
                <TableCell className="num text-ink-secondary">{fechaCorta(f.fecha)}</TableCell>
                <TableCell>
                  <SemaforoVencimiento fecha={f.fechaVencimiento} />
                </TableCell>
                <TableCell className="num text-right text-ink-secondary">
                  {formatearImporte(f.total, f.moneda)}
                </TableCell>
                <TableCell className="num text-right font-semibold text-ink">
                  {formatearImporte(f.saldo, f.moneda)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/* ── Saldos por cuenta ────────────────────────────────────────────────────── */

function Saldos() {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch("/api/admin/cuentas")
      .then((r) => r.json())
      .then((d) => setCuentas(d.cuentas ?? []))
      .catch(() => setCuentas([]))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <LoadingState label="Cargando saldos…" />

  const porMoneda = (m: "ARS" | "USD") =>
    cuentas.filter((c) => c.moneda === m).reduce((a, c) => a + (c.saldo ?? 0), 0)

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
        <Total rotulo="Total en pesos" valor={formatearImporte(porMoneda("ARS"), "ARS")} />
        <Total rotulo="Total en dólares" valor={formatearImporte(porMoneda("USD"), "USD")} />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            descargarCsv(
              "saldos-por-cuenta.csv",
              ["Cuenta", "Tipo", "Moneda", "Saldo"],
              cuentas.map((c) => [c.nombre, c.tipo, c.moneda, c.saldo ?? 0])
            )
          }
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {cuentas.length === 0 ? (
        <EmptyState icon={Wallet} title="No hay cuentas cargadas" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-ink">{c.nombre}</TableCell>
                <TableCell className="capitalize text-ink-secondary">{c.tipo}</TableCell>
                <TableCell className="text-ink-secondary">{c.moneda}</TableCell>
                <TableCell
                  className={cn(
                    "num text-right font-semibold",
                    (c.saldo ?? 0) < 0 ? "text-danger-text" : "text-ink"
                  )}
                >
                  {formatearImporte(c.saldo ?? 0, c.moneda)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/* ── Estado de cuenta ─────────────────────────────────────────────────────── */

function EstadoDeCuenta({ inicial }: { inicial: Preseleccion | null }) {
  const [tipo, setTipo] = useState<"cliente" | "proveedor">(inicial?.tipo ?? "cliente")
  // Alcanza con el nombre para el título y el CSV: la ficha entera la devuelve
  // el propio reporte, así que guardarla completa sería traerla dos veces.
  const [elegida, setElegida] = useState<{
    id: string
    razonSocial: string
    cuit: string | null
  } | null>(null)
  const [q, setQ] = useState("")
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<FilaCuenta[]>([])
  const [saldoFinal, setSaldoFinal] = useState(0)
  const [cargando, setCargando] = useState(false)

  const recurso = tipo === "cliente" ? "clientes" : "proveedores"

  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ porPagina: "8", estado: "todos" })
        if (q.trim()) params.set("q", q.trim())
        const res = await fetch(`/api/admin/${recurso}?${params}`)
        const data = await res.json()
        setResultados(data[recurso] ?? [])
      } catch {
        setResultados([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, abierto, recurso])

  const cargar = useCallback(
    async (id: string, deTipo: "cliente" | "proveedor" = tipo) => {
      setCargando(true)
      try {
        const res = await fetch(
          `/api/admin/reportes/estado-cuenta?tipo=${deTipo}&entidadId=${id}`
        )
        const data = await res.json()
        setFilas(data.filas ?? [])
        setSaldoFinal(data.saldoFinal ?? 0)
        // El reporte trae la ficha en la respuesta, así que llegar con la
        // entidad en la URL no necesita una consulta aparte para saber cómo se
        // llama.
        if (data.entidad) {
          setElegida({
            id: data.entidad.id,
            razonSocial: data.entidad.razonSocial,
            cuit: data.entidad.cuit ?? null,
          })
        }
      } catch {
        setFilas([])
      } finally {
        setCargando(false)
      }
    },
    [tipo]
  )

  // Solo al entrar: después manda el selector. Si esto siguiera a `inicial`, un
  // click en otra ficha se revertiría solo a la que vino en la URL.
  useEffect(() => {
    if (inicial) cargar(inicial.entidadId, inicial.tipo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="panel px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
            {(["cliente", "proveedor"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTipo(t)
                  setElegida(null)
                  setFilas([])
                }}
                aria-pressed={tipo === t}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition-colors",
                  tipo === t
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={abierto ? q : (elegida?.razonSocial ?? "")}
              onChange={(e) => {
                setQ(e.target.value)
                setAbierto(true)
              }}
              onFocus={() => {
                setQ("")
                setAbierto(true)
              }}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              placeholder={`Buscar ${tipo}…`}
              className="pl-9"
            />
            {abierto && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-e3">
                {resultados.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] text-ink-muted">Sin resultados</p>
                ) : (
                  resultados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setElegida(c)
                        setAbierto(false)
                        cargar(c.id)
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-brand-50"
                    >
                      <span className="text-[13px] font-medium text-ink">{c.razonSocial}</span>
                      {c.cuit && (
                        <span className="num text-[11px] text-ink-muted">
                          {formatearCuit(c.cuit)}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {filas.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                descargarCsv(
                  `estado-cuenta-${elegida?.razonSocial ?? "ficha"}.csv`,
                  ["Fecha", "Tipo", "Comprobante", "Moneda", "Dólares", "TC", "Pesos", "Saldo"],
                  filas.map((f) => [
                    f.fecha,
                    f.tipo,
                    f.comprobante ?? "",
                    f.moneda,
                    f.importeUsd ?? "",
                    f.tc,
                    f.importeArs,
                    f.saldo,
                  ])
                )
              }
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {cargando ? (
        <LoadingState label="Armando el estado de cuenta…" />
      ) : !elegida ? (
        <div className="panel">
          <EmptyState
            icon={PieChart}
            title="Elegí una ficha"
            description="El estado de cuenta muestra cada comprobante y cada pago con el saldo corrido."
          />
        </div>
      ) : filas.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={PieChart}
            title={`${elegida.razonSocial} no tiene movimientos`}
            description="Todavía no hay comprobantes ni pagos cargados para esta ficha."
          />
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-subtle px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold text-ink">{elegida.razonSocial}</p>
              {elegida.cuit && (
                <p className="num text-[11.5px] text-ink-muted">{formatearCuit(elegida.cuit)}</p>
              )}
            </div>
            <div className="text-right">
              <p className="eyebrow">Saldo</p>
              <p
                className={cn(
                  "num text-[19px] font-bold tracking-[-0.02em]",
                  saldoFinal > 0 ? "text-ink" : "text-success-text"
                )}
              >
                {formatearImporte(saldoFinal, "ARS")}
              </p>
            </div>
          </div>

          {/* El saldo corre en pesos históricos: cada fila valuada al TC que
              tenía su documento. Convertir todo al dólar de hoy daría un saldo
              que cambia solo sin que nadie haya facturado ni cobrado nada. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead className="text-right">Dólares</TableHead>
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">Pesos</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f, i) => {
                const esPago = f.importeArs < 0
                return (
                  <TableRow key={i}>
                    <TableCell className="num whitespace-nowrap text-ink-secondary">
                      {fechaCorta(f.fecha)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={esPago ? "success" : "neutral"} size="sm">
                        {f.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="num text-ink-secondary">
                      {f.comprobante ?? <span className="text-ink-faint">—</span>}
                    </TableCell>
                    <TableCell className="num text-right text-ink-secondary">
                      {f.importeUsd !== null ? (
                        formatearImporte(f.importeUsd, "USD")
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TableCell>
                    <TableCell className="num text-right text-ink-muted">
                      {f.moneda === "USD" ? formatearTc(f.tc) : <span className="text-ink-faint">—</span>}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num text-right font-medium",
                        esPago ? "text-danger-text" : "text-ink"
                      )}
                    >
                      {formatearImporte(f.importeArs, "ARS")}
                    </TableCell>
                    <TableCell className="num text-right font-semibold text-ink">
                      {formatearImporte(f.saldo, "ARS")}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p className="num mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-ink">{valor}</p>
    </div>
  )
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}

/**
 * CSV para Excel argentino: separador punto y coma y BOM al principio.
 *
 * Sin el punto y coma, Excel en configuración regional castellana mete toda la
 * fila en una sola columna, porque acá la coma es el separador decimal. Sin el
 * BOM, los acentos y las eñes salen rotos. Los dos detalles son la diferencia
 * entre un archivo que se abre bien de una y uno que hay que importar a mano.
 */
function descargarCsv(nombre: string, cabeceras: string[], filas: (string | number)[][]) {
  const escapar = (v: string | number) => {
    const s = String(v ?? "")
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const contenido = [
    cabeceras.map(escapar).join(";"),
    ...filas.map((f) => f.map(escapar).join(";")),
  ].join("\r\n")

  const blob = new Blob([`﻿${contenido}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
