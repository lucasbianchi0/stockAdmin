"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, PieChart, Search } from "lucide-react"

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
import { descargarCsv } from "@/lib/admin/csv"
import { formatearCuit } from "@/lib/admin/cuit"
import type { Cliente, TipoEntidad } from "@/lib/admin/entidades"
import { formatearImporte, formatearTc } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

type FilaCuenta = {
  fecha: string
  tipo: string
  comprobante: string | null
  detalle: string | null
  observaciones: string | null
  moneda: "ARS" | "USD"
  importe: number
  importeUsd: number | null
  tc: number | null
  importeArs: number
  saldo: number
}

/**
 * La cuenta corriente de una ficha: cada comprobante y cada pago en orden, con
 * el saldo corrido.
 *
 * Era una solapa de Reportes —«estado de cuenta»— con un selector cliente /
 * proveedor arriba. Se partió en dos pantallas, una en cada módulo, porque
 * nadie entra a "ver un estado de cuenta" en abstracto: se entra a ver la
 * cuenta de un proveedor, desde el módulo de proveedores, y la primera cosa que
 * había que hacer al abrir el reporte era decirle cuál de los dos maestros ya
 * se sabía de antemano. Con la pantalla adentro del módulo, ese paso no existe.
 */
export function CuentaCorrienteClient({ tipo }: { tipo: TipoEntidad }) {
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
    async (id: string) => {
      setCargando(true)
      try {
        const res = await fetch(
          `/api/admin/reportes/estado-cuenta?tipo=${tipo}&entidadId=${id}`
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

  /**
   * La ficha puede venir en la URL: es lo que hace que el botón «Cuenta
   * corriente» del panel de un proveedor caiga directo en su cuenta en vez de
   * dejar a alguien buscándolo otra vez en el selector.
   *
   * Se lee de `window` dentro de un efecto y no con `useSearchParams` para no
   * arrastrar toda la pantalla a un límite de Suspense por un parámetro
   * opcional que solo se usa al entrar. Y corre una sola vez: después manda el
   * selector, o un click en otra ficha se revertiría solo a la de la URL.
   */
  useEffect(() => {
    const entidadId = new URLSearchParams(window.location.search).get("entidadId")
    if (entidadId) cargar(entidadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="panel px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
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
                  `cuenta-corriente-${elegida?.razonSocial ?? "ficha"}.csv`,
                  [
                    "Fecha",
                    "Tipo",
                    "Comprobante",
                    "Moneda",
                    "Dólares",
                    "TC",
                    "Pesos",
                    "Saldo",
                    "Observaciones",
                  ],
                  filas.map((f) => [
                    f.fecha,
                    f.tipo,
                    f.comprobante ?? "",
                    f.moneda,
                    f.importeUsd ?? "",
                    f.tc ?? "",
                    f.importeArs,
                    f.saldo,
                    f.observaciones ?? "",
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
        <LoadingState label="Armando la cuenta corriente…" />
      ) : !elegida ? (
        <div className="panel">
          <EmptyState
            icon={PieChart}
            title={`Elegí un ${tipo}`}
            description="La cuenta corriente muestra cada comprobante y cada pago con el saldo corrido."
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
                <TableHead>Observaciones</TableHead>
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
                      {f.tc !== null ? (
                        formatearTc(f.tc)
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
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
                    {/* Última y sin ancho fijo: es texto libre y de largo
                        impredecible, y en el medio de la tabla empujaría los
                        importes fuera de la vista. */}
                    <TableCell className="max-w-[260px] text-[12px] text-ink-secondary">
                      {f.observaciones ? (
                        <span className="line-clamp-2" title={f.observaciones}>
                          {f.observaciones}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
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

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}
