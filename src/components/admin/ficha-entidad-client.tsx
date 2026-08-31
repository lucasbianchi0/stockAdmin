"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Download,
  FileText,
  HandCoins,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
} from "lucide-react"

import { SemaforoVencimiento } from "@/components/admin/semaforo-vencimiento"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Paginacion } from "@/components/ui/paginacion"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Comprobante } from "@/lib/admin/comprobantes"
import { estadoDeSaldo, etiquetaSaldo, formatearNumero } from "@/lib/admin/comprobantes"
import type { Cobro } from "@/lib/admin/cobros"
import { formatearCuit } from "@/lib/admin/cuit"
import type { ResumenEntidad } from "@/lib/admin/detalle"
import type { Cliente, TipoEntidad } from "@/lib/admin/entidades"
import { FORMA_JURIDICA_LABEL } from "@/lib/admin/entidades"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearContravalor, formatearImporte } from "@/lib/admin/moneda"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

/**
 * La ficha completa de un cliente o un proveedor.
 *
 * Antes esto era un panel lateral que mostraba los últimos ocho comprobantes y
 * los últimos seis recibos. Servía para espiar, no para trabajar: la pregunta
 * real al abrir un proveedor es "¿qué le compré, qué le pagué y cuánto le
 * debo?", y ocho filas no la contestan.
 *
 * Acá está todo, y sin endpoints nuevos: las solapas de facturas y de pagos
 * usan los mismos listados paginados que las pantallas generales, con el
 * `entidadId` puesto. Eso significa que el orden, la paginación y el saldo se
 * calculan igual en los dos lugares — que es la única forma de que dos pantallas
 * no puedan discrepar.
 */

type Solapa = "resumen" | "comprobantes" | "pagos" | "cuenta" | "datos"

type FilaCuenta = {
  fecha: string
  tipo: string
  comprobante: string | null
  detalle: string | null
  moneda: "ARS" | "USD"
  importe: number
  importeUsd: number | null
  tc: number | null
  importeArs: number
  saldo: number
}

/** Cómo se llama cada cosa de cada lado del mostrador. */
const VOZ = {
  cliente: {
    comprobantes: "Facturas de venta",
    pagos: "Cobros",
    recursoComprobantes: "ventas",
    recursoPagos: "cobros",
    deuda: "Nos debe",
    altaComprobante: "/admin/ventas",
    altaPago: "/admin/cobros",
    volver: { href: "/admin/clientes", label: "Clientes" },
  },
  proveedor: {
    comprobantes: "Facturas de compra",
    pagos: "Pagos",
    recursoComprobantes: "compras",
    recursoPagos: "pagos",
    deuda: "Le debemos",
    altaComprobante: "/admin/compras",
    altaPago: "/admin/pagos",
    volver: { href: "/admin/proveedores", label: "Proveedores" },
  },
} as const

export function FichaEntidadClient({
  tipo,
  entidadId,
}: {
  tipo: TipoEntidad
  entidadId: string
}) {
  const voz = VOZ[tipo]
  const [solapa, setSolapa] = useState<Solapa>("resumen")
  const [entidad, setEntidad] = useState<Cliente | null>(null)
  const [resumen, setResumen] = useState<ResumenEntidad | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recurso = tipo === "cliente" ? "clientes" : "proveedores"

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/${recurso}/${entidadId}/detalle`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la ficha")
      setEntidad(data.entidad)
      setResumen(data.resumen)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la ficha")
    } finally {
      setCargando(false)
    }
  }, [recurso, entidadId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filtros = useMemo(() => ({ entidadId }), [entidadId])

  // Los dos listados completos, paginados contra los mismos endpoints que usan
  // las pantallas generales.
  const comprobantes = useTablaAdmin<Comprobante>({
    endpoint: `/api/admin/${voz.recursoComprobantes}`,
    clave: "comprobantes",
    filtros,
  })

  const pagos = useTablaAdmin<Cobro>({
    endpoint: `/api/admin/${voz.recursoPagos}`,
    clave: voz.recursoPagos,
    filtros,
  })

  if (cargando) return <LoadingState label="Cargando la ficha…" />
  if (error) return <ErrorState message={error} onRetry={cargar} />
  if (!entidad || !resumen) return null

  const debe = resumen.pendienteArs !== 0 || resumen.pendienteUsd !== 0

  return (
    <>
      {/* ── Identidad ─────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {entidad.categoriaNombre && (
              <Badge tone="brand" size="sm">
                {entidad.categoriaNombre}
              </Badge>
            )}
            {entidad.formaJuridica && (
              <Badge tone="neutral" size="sm">
                {FORMA_JURIDICA_LABEL[entidad.formaJuridica]}
              </Badge>
            )}
            {!entidad.activo && (
              <Badge tone="warning" size="sm">
                Dado de baja
              </Badge>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
            {entidad.cuit && <span className="num">CUIT {formatearCuit(entidad.cuit)}</span>}
            {entidad.provincia && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {entidad.provincia}
              </span>
            )}
            {entidad.telefono && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {entidad.telefono}
              </span>
            )}
            {entidad.email && (
              <a
                href={`mailto:${entidad.email}`}
                className="inline-flex items-center gap-1 hover:text-brand-600"
              >
                <Mail className="h-3 w-3" />
                {entidad.email}
              </a>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`${voz.altaPago}?entidadId=${entidad.id}`}>
              <HandCoins className="h-3.5 w-3.5" />
              {tipo === "cliente" ? "Registrar cobro" : "Registrar pago"}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${voz.altaComprobante}?entidadId=${entidad.id}`}>
              <Plus className="h-3.5 w-3.5" />
              Nueva factura
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Los números ───────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          rotulo={voz.deuda}
          principal={formatearImporte(resumen.pendienteArs, "ARS")}
          secundario={
            resumen.pendienteUsd !== 0
              ? formatearImporte(resumen.pendienteUsd, "USD")
              : undefined
          }
          tono={debe ? "atencion" : "ok"}
        />
        <Kpi
          rotulo="Vencido"
          principal={formatearImporte(resumen.vencidoArs, "ARS")}
          secundario={
            resumen.vencidoUsd !== 0 ? formatearImporte(resumen.vencidoUsd, "USD") : undefined
          }
          tono={resumen.vencidas > 0 ? "alerta" : "ok"}
        />
        <Kpi
          rotulo="Comprobantes pendientes"
          principal={String(resumen.cantidad)}
          secundario={resumen.vencidas > 0 ? `${resumen.vencidas} vencidos` : undefined}
        />
        <Kpi
          rotulo="Próximo vencimiento"
          principal={
            resumen.proximoVencimiento ? formatearFecha(resumen.proximoVencimiento) : "—"
          }
          secundario={
            entidad.condicionPagoDias !== null
              ? `Condición: ${entidad.condicionPagoDias} días`
              : undefined
          }
        />
      </div>

      {/* ── Solapas ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1">
        {(
          [
            ["resumen", "Resumen"],
            ["comprobantes", `${voz.comprobantes}${comprobantes.total ? ` (${comprobantes.total})` : ""}`],
            ["pagos", `${voz.pagos}${pagos.total ? ` (${pagos.total})` : ""}`],
            ["cuenta", "Cuenta corriente"],
            ["datos", "Datos"],
          ] as const
        ).map(([v, etiqueta]) => (
          <button
            key={v}
            onClick={() => setSolapa(v as Solapa)}
            aria-pressed={solapa === v}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              solapa === v
                ? "bg-brand-50 text-brand-700"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink"
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {solapa === "resumen" && (
        <ResumenFicha
          tipo={tipo}
          voz={voz}
          comprobantes={comprobantes.filas.slice(0, 6)}
          pagos={pagos.filas.slice(0, 6)}
          onVerTodo={setSolapa}
        />
      )}

      {solapa === "comprobantes" && (
        <TablaComprobantes tipo={tipo} tabla={comprobantes} />
      )}

      {solapa === "pagos" && <TablaPagos voz={voz} tabla={pagos} />}

      {solapa === "cuenta" && <EstadoCuenta tipo={tipo} entidadId={entidadId} />}

      {solapa === "datos" && <DatosFicha entidad={entidad} tipo={tipo} />}
    </>
  )
}

/* ── Resumen ──────────────────────────────────────────────────────────────── */

function ResumenFicha({
  tipo,
  voz,
  comprobantes,
  pagos,
  onVerTodo,
}: {
  tipo: TipoEntidad
  voz: (typeof VOZ)[TipoEntidad]
  comprobantes: Comprobante[]
  pagos: Cobro[]
  onVerTodo: (s: Solapa) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-surface-subtle px-4 py-2.5">
          <p className="eyebrow">Últimos {voz.comprobantes.toLowerCase()}</p>
          <Button variant="ghost" size="sm" onClick={() => onVerTodo("comprobantes")}>
            Ver todos
          </Button>
        </div>
        {comprobantes.length === 0 ? (
          <EmptyState icon={FileText} title="Todavía no hay comprobantes" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {comprobantes.map((c) => {
              const estado = estadoDeSaldo(c.total, c.saldo)
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {c.clase} {formatearNumero(c.puntoVenta, c.numero)}
                    </span>
                    <span className="num block text-[11px] text-ink-muted">
                      {formatearFecha(c.fecha)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right text-[12.5px] font-semibold text-ink">
                    {formatearImporte(c.total, c.moneda)}
                  </span>
                  <Badge
                    tone={estado === "saldado" ? "success" : estado === "parcial" ? "warning" : "neutral"}
                    size="sm"
                    className="shrink-0"
                  >
                    {etiquetaSaldo(estado, c.tipo)}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-surface-subtle px-4 py-2.5">
          <p className="eyebrow">Últimos {voz.pagos.toLowerCase()}</p>
          <Button variant="ghost" size="sm" onClick={() => onVerTodo("pagos")}>
            Ver todos
          </Button>
        </div>
        {pagos.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title={tipo === "cliente" ? "Todavía no hay cobros" : "Todavía no hay pagos"}
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="num block text-[12.5px] font-medium text-ink">
                    {formatearFecha(p.fecha)}
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    {p.imputaciones.length}{" "}
                    {p.imputaciones.length === 1 ? "comprobante" : "comprobantes"}
                  </span>
                </span>
                <span className="num shrink-0 text-[12.5px] font-semibold text-ink">
                  {formatearImporte(p.totalMedios + p.totalRetenciones, p.moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── Comprobantes ─────────────────────────────────────────────────────────── */

function TablaComprobantes({
  tipo,
  tabla,
}: {
  tipo: TipoEntidad
  tabla: ReturnType<typeof useTablaAdmin<Comprobante>>
}) {
  const recurso = tipo === "cliente" ? "ventas" : "compras"

  if (tabla.cargandoInicial) return <LoadingState label="Cargando comprobantes…" />
  if (tabla.error) return <ErrorState message={tabla.error} onRetry={tabla.recargar} />

  return (
    <div className="panel overflow-hidden">
      <div className={cn("overflow-x-auto", tabla.cargando && "pointer-events-none opacity-55")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comprobante</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Cuenta contable</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tabla.filas.length > 0 ? (
              tabla.filas.map((c) => {
                const estado = estadoDeSaldo(c.total, c.saldo)
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/admin/${recurso}?q=${c.numero ?? ""}`}
                        className="text-[12.5px] font-medium text-ink hover:text-brand-600"
                      >
                        {c.clase} {formatearNumero(c.puntoVenta, c.numero)}
                      </Link>
                      {c.detalle && (
                        <span className="block max-w-[260px] truncate text-[11px] text-ink-muted">
                          {c.detalle}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-ink-secondary">
                      {formatearFecha(c.fecha)}
                    </TableCell>
                    <TableCell>
                      {c.fechaVencimiento ? (
                        <SemaforoVencimiento fecha={c.fechaVencimiento} saldado={c.saldo <= 0.01} />
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-ink-muted">
                      {c.cuentaContableNombre ?? <span className="text-ink-faint">Sin imputar</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="num block font-semibold text-ink">
                        {c.signo === -1 ? "−" : ""}
                        {formatearImporte(c.total, c.moneda)}
                      </span>
                      <span className="num block text-[11px] text-ink-muted">
                        {c.moneda === "USD"
                          ? formatearImporte(c.totalArs, "ARS")
                          : formatearContravalor(c.totalUsd, "USD")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {estado === "saldado" ? (
                        <Badge tone="success" size="sm">
                          {etiquetaSaldo(estado, c.tipo)}
                        </Badge>
                      ) : (
                        <span className="num font-semibold text-danger-text">
                          {formatearImporte(c.saldo, c.moneda)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState icon={FileText} title="Todavía no hay comprobantes de esta ficha" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Paginacion
        pagina={tabla.pagina}
        totalPaginas={tabla.totalPaginas}
        total={tabla.total}
        porPagina={tabla.porPagina}
        cargando={tabla.cargando}
        onIr={tabla.irA}
      />
    </div>
  )
}

/* ── Pagos ────────────────────────────────────────────────────────────────── */

function TablaPagos({
  voz,
  tabla,
}: {
  voz: (typeof VOZ)[TipoEntidad]
  tabla: ReturnType<typeof useTablaAdmin<Cobro>>
}) {
  if (tabla.cargandoInicial) return <LoadingState label="Cargando…" />
  if (tabla.error) return <ErrorState message={tabla.error} onRetry={tabla.recargar} />

  return (
    <div className="panel overflow-hidden">
      <div className={cn("overflow-x-auto", tabla.cargando && "pointer-events-none opacity-55")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Comprobantes cancelados</TableHead>
              <TableHead>Por dónde</TableHead>
              <TableHead className="text-right">Retenciones</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tabla.filas.length > 0 ? (
              tabla.filas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="num whitespace-nowrap text-ink-secondary">
                    {formatearFecha(p.fecha)}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <span className="block truncate text-[12.5px] text-ink">
                      {p.imputaciones.length > 0
                        ? p.imputaciones
                            .map((i) => `${i.clase} ${formatearNumero(i.puntoVenta, i.numero)}`)
                            .join(" · ")
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-[12px] text-ink-muted">
                    {p.medios.length > 0
                      ? [...new Set(p.medios.map((m) => m.cuentaNombre).filter(Boolean))].join(" · ")
                      : "Solo retenciones"}
                  </TableCell>
                  <TableCell className="num text-right text-ink-secondary">
                    {p.totalRetenciones > 0
                      ? formatearImporte(p.totalRetenciones, p.moneda)
                      : "—"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-ink">
                    {formatearImporte(p.totalMedios + p.totalRetenciones, p.moneda)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={HandCoins}
                    title={`Todavía no hay ${voz.pagos.toLowerCase()} de esta ficha`}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Paginacion
        pagina={tabla.pagina}
        totalPaginas={tabla.totalPaginas}
        total={tabla.total}
        porPagina={tabla.porPagina}
        cargando={tabla.cargando}
        onIr={tabla.irA}
      />
    </div>
  )
}

/* ── Cuenta corriente ─────────────────────────────────────────────────────── */

function EstadoCuenta({ tipo, entidadId }: { tipo: TipoEntidad; entidadId: string }) {
  const [filas, setFilas] = useState<FilaCuenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/reportes/estado-cuenta?tipo=${tipo}&entidadId=${entidadId}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el estado de cuenta")
      setFilas(data.filas ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el estado de cuenta")
    } finally {
      setCargando(false)
    }
  }, [tipo, entidadId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const exportar = () => {
    const csv = [
      ["FECHA", "TIPO", "COMPROBANTE", "DETALLE", "MONEDA", "IMPORTE", "TC", "IMPORTE ARS", "SALDO"],
      ...filas.map((f) => [
        f.fecha,
        f.tipo,
        f.comprobante ?? "",
        f.detalle ?? "",
        f.moneda,
        f.importe,
        f.tc ?? "",
        f.importeArs,
        f.saldo,
      ]),
    ]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    a.download = `estado-de-cuenta.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (cargando) return <LoadingState label="Cargando el estado de cuenta…" />
  if (error) return <ErrorState message={error} onRetry={cargar} />

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-subtle px-4 py-2.5">
        <p className="text-[12px] text-ink-muted">
          Cada comprobante y cada recibo, con el saldo corrido en pesos históricos.
        </p>
        <Button variant="outline" size="sm" onClick={exportar} disabled={filas.length === 0}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-right">TC</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length > 0 ? (
              filas.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="num whitespace-nowrap text-ink-secondary">
                    {formatearFecha(f.fecha)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={f.importeArs >= 0 ? "neutral" : "success"} size="sm">
                      {f.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-secondary">
                    {f.comprobante ?? f.detalle ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "num text-right font-medium",
                      f.importeArs < 0 ? "text-success-text" : "text-ink"
                    )}
                  >
                    {formatearImporte(f.importe, f.moneda)}
                  </TableCell>
                  <TableCell className="num text-right text-ink-muted">
                    {f.tc !== null ? f.tc.toLocaleString("es-AR") : "—"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-ink">
                    {formatearImporte(f.saldo, "ARS")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState icon={Receipt} title="Sin movimientos" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/* ── Datos ────────────────────────────────────────────────────────────────── */

function DatosFicha({ entidad, tipo }: { entidad: Cliente; tipo: TipoEntidad }) {
  const datos: [string, string | null][] = [
    ["Razón social", entidad.razonSocial],
    ["CUIT", entidad.cuit ? formatearCuit(entidad.cuit) : null],
    ["Condición frente al IVA", entidad.formaJuridica ? FORMA_JURIDICA_LABEL[entidad.formaJuridica] : null],
    ["Categoría", entidad.categoriaNombre],
    ["Origen", entidad.origen === "exterior" ? "Del exterior" : "Nacional"],
    ["Contacto", entidad.contacto],
    ["Teléfono", entidad.telefono],
    ["Email", entidad.email],
    ["Dirección", entidad.direccion],
    ["Provincia", entidad.provincia],
    [
      "Condición de pago",
      entidad.condicionPagoDias !== null ? `${entidad.condicionPagoDias} días` : null,
    ],
    ...(tipo === "cliente"
      ? ([["Vendedor", entidad.vendedorNombre]] as [string, string | null][])
      : []),
    ["Notas", entidad.notas],
  ]

  return (
    <div className="panel p-5">
      <dl className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
        {datos.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-col gap-0.5">
            <dt className="eyebrow">{rotulo}</dt>
            <dd className="text-[13px] text-ink">
              {valor ?? <span className="text-ink-faint">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Kpi({
  rotulo,
  principal,
  secundario,
  tono,
}: {
  rotulo: string
  principal: string
  secundario?: string
  tono?: "ok" | "atencion" | "alerta"
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-e1">
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-[19px] font-bold tracking-[-0.02em]",
          tono === "alerta" ? "text-danger-text" : "text-ink"
        )}
      >
        {principal}
      </p>
      {secundario && <p className="num mt-0.5 text-[11.5px] text-ink-muted">{secundario}</p>}
    </div>
  )
}
