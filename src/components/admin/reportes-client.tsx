"use client"

import { useEffect, useState } from "react"
import { Download, PieChart, Wallet } from "lucide-react"

import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { descargarCsv } from "@/lib/admin/csv"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { formatearImporte } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Los reportes operativos del pliego, en una sola pantalla con pestañas.
 *
 * El estado de cuenta era la cuarta y se fue: ahora es «cuenta corriente» y
 * vive adentro de cada módulo —`/admin/proveedores/cuenta-corriente` y
 * `/admin/clientes/cuenta-corriente`—, porque siempre se la mira de una ficha
 * concreta y no como un reporte transversal. Lo que queda acá son los tres que
 * sí se leen de arriba hacia abajo, sin elegir a nadie primero.
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
  tc: number | null
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

type Solapa = "cobrar" | "pagar" | "saldos"

const SOLAPAS: { valor: Solapa; etiqueta: string }[] = [
  { valor: "cobrar", etiqueta: "Pendientes de cobro" },
  { valor: "pagar", etiqueta: "Pendientes de pago" },
  { valor: "saldos", etiqueta: "Saldos por cuenta" },
]

export function ReportesClient() {
  const [solapa, setSolapa] = useState<Solapa>("cobrar")

  /**
   * La solapa puede venir en la URL, para poder linkear a un reporte concreto.
   *
   * Se lee de `window` dentro de un efecto y no con `useSearchParams` para no
   * arrastrar toda la pantalla a un límite de Suspense por un parámetro
   * opcional que solo se usa al entrar.
   */
  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get("solapa")
    if (pedida && SOLAPAS.some((s) => s.valor === pedida)) setSolapa(pedida as Solapa)
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
        f.tc ?? "",
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

