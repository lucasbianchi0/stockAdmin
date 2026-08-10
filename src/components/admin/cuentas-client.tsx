"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeftRight,
  Check,
  Eye,
  FileInput,
  Loader2,
  Receipt,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmarDialog } from "@/components/admin/confirmar-dialog"
import { LecturaGastoDialog } from "@/components/admin/lectura-gasto-dialog"
import { MovimientoDetalle } from "@/components/admin/movimiento-detalle"
import {
  MovimientoDialog,
  type BorradorMovimiento,
} from "@/components/admin/movimiento-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import {
  CATEGORIA_LABEL,
  ORIGEN_LABEL,
  esEditable,
  type Movimiento,
} from "@/lib/admin/movimientos"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

/**
 * Caja y bancos.
 *
 * Arriba los saldos, abajo el detalle. El orden importa: la pregunta que trae a
 * alguien a esta pantalla es "¿cuánta plata hay?", y recién después "¿de dónde
 * salió?". Un listado de movimientos sin los saldos arriba obliga a sumar
 * mentalmente para contestar lo primero.
 *
 * Los saldos vienen de la vista `cuentas_saldo` —saldo inicial más movimientos—
 * y no de un campo guardado, así que anular un cobro los corrige solos.
 */
export function CuentasClient() {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])
  const [cargandoCuentas, setCargandoCuentas] = useState(true)
  const [cuentaId, setCuentaId] = useState("")
  const [conciliado, setConciliado] = useState<"" | "si" | "no">("")
  const [dialogo, setDialogo] = useState<null | "gasto" | "transferencia" | "ajuste">(null)
  const [ver, setVer] = useState<Movimiento | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null)
  const [aBorrar, setABorrar] = useState<Movimiento | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const filtros = useMemo(
    () => ({ cuentaId: cuentaId || undefined, conciliado: conciliado || undefined }),
    [cuentaId, conciliado]
  )

  const tabla = useTablaAdmin<Movimiento>({
    endpoint: "/api/admin/movimientos",
    clave: "movimientos",
    filtros,
  })

  const cargarCuentas = useCallback(async () => {
    setCargandoCuentas(true)
    try {
      const res = await fetch("/api/admin/cuentas")
      const data = await res.json()
      setCuentas(data.cuentas ?? [])
    } catch {
      setCuentas([])
    } finally {
      setCargandoCuentas(false)
    }
  }, [])

  useEffect(() => {
    cargarCuentas()
  }, [cargarCuentas])

  const { recargar } = tabla

  const alGuardar = useCallback(() => {
    setDialogo(null)
    setBorrador(null)
    toast.success("Movimiento registrado")
    recargar()
    cargarCuentas()
  }, [recargar, cargarCuentas])

  const conciliar = async (m: Movimiento) => {
    setOcupado(m.id)
    try {
      const res = await fetch(`/api/admin/movimientos/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conciliado: !m.conciliado }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo actualizar")
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar")
    } finally {
      setOcupado(null)
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    setBorrando(true)
    try {
      const res = await fetch(`/api/admin/movimientos/${aBorrar.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar")
      toast.success("Movimiento borrado")
      setABorrar(null)
      recargar()
      cargarCuentas()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    } finally {
      setBorrando(false)
    }
  }

  return (
    <>
      {/* Saldos */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cargandoCuentas
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-xl bg-surface-muted" />
            ))
          : cuentas.map((c) => (
              <button
                key={c.id}
                onClick={() => setCuentaId(cuentaId === c.id ? "" : c.id)}
                aria-pressed={cuentaId === c.id}
                className={cn(
                  "rounded-xl border bg-surface px-4 py-3.5 text-left shadow-e1 transition-all duration-150",
                  cuentaId === c.id
                    ? "border-brand-300 ring-2 ring-brand-100"
                    : "border-line hover:border-brand-200 hover:shadow-e2"
                )}
              >
                <p className="eyebrow truncate">{c.nombre}</p>
                <p
                  className={cn(
                    "num mt-1 text-[18px] font-bold tracking-[-0.02em]",
                    (c.saldo ?? 0) < 0 ? "text-danger-text" : "text-ink"
                  )}
                >
                  {formatearImporte(c.saldo ?? 0, c.moneda)}
                </p>
                <p className="mt-0.5 text-[11px] capitalize text-ink-muted">{c.tipo}</p>
              </button>
            ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-surface-subtle px-4 py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={tabla.busqueda}
              onChange={(e) => tabla.setBusqueda(e.target.value)}
              placeholder="Buscar por detalle o referencia…"
              className="pl-9 pr-9"
              type="search"
            />
            {tabla.busqueda && (
              <button
                onClick={() => tabla.setBusqueda("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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

          <div className="flex items-center gap-2 lg:ml-auto">
            <Button variant="outline" onClick={() => setDialogo("transferencia")}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transferencia
            </Button>
            <Button variant="outline" onClick={() => setLeyendo(true)}>
              <FileInput className="h-3.5 w-3.5" />
              Carga inteligente
            </Button>
            <Button onClick={() => setDialogo("gasto")}>
              <Receipt className="h-3.5 w-3.5" />
              Nuevo gasto
            </Button>
          </div>
        </div>

        {tabla.cargandoInicial ? (
          <LoadingState label="Cargando movimientos…" />
        ) : tabla.error ? (
          <ErrorState message={tabla.error} onRetry={tabla.recargar} />
        ) : (
          <>
            <div
              className={cn(
                "transition-opacity duration-150",
                tabla.cargando && "pointer-events-none opacity-55"
              )}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="w-[124px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabla.filas.length > 0 ? (
                    tabla.filas.map((m) => (
                      <TableRow
                        key={m.id}
                        onClick={() => setVer(m)}
                        className={cn("cursor-pointer", m.conciliado && "bg-success-soft/25")}
                      >
                        <TableCell className="num whitespace-nowrap text-ink-secondary">
                          {formatearFecha(m.fecha)}
                        </TableCell>

                        <TableCell className="text-ink-secondary">{m.cuentaNombre ?? "—"}</TableCell>

                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral" size="sm">
                              {ORIGEN_LABEL[m.origen]}
                            </Badge>
                            {m.categoria && (
                              <span className="text-[11px] text-ink-muted">
                                {CATEGORIA_LABEL[m.categoria]}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="max-w-[240px]">
                          {m.detalle ? (
                            <span className="block truncate text-ink-secondary" title={m.detalle}>
                              {m.detalle}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                          {m.referencia && (
                            <span className="num block text-[11px] text-ink-muted">
                              {m.referencia}
                            </span>
                          )}
                        </TableCell>

                        {/* El signo va en el número y en el color: verde entra,
                            rojo sale. Un importe sin signo obliga a mirar la
                            columna de origen para saber para qué lado va. */}
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "num font-semibold",
                              m.signo === 1 ? "text-success-text" : "text-danger-text"
                            )}
                          >
                            {m.signo === 1 ? "+" : "−"}
                            {formatearImporte(m.importe, m.moneda)}
                          </span>
                        </TableCell>

                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setVer(m)}
                              aria-label="Ver detalle"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={ocupado === m.id}
                              onClick={() => conciliar(m)}
                              aria-label={m.conciliado ? "Desmarcar" : "Marcar conciliado"}
                              title={m.conciliado ? "Desmarcar conciliado" : "Marcar conciliado"}
                              className={cn(m.conciliado && "text-success")}
                            >
                              {ocupado === m.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </Button>

                            {esEditable(m.origen) && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setABorrar(m)}
                                aria-label="Borrar"
                                className="text-ink-faint hover:bg-danger-soft hover:text-danger-text"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={Wallet}
                          title="Todavía no hay movimientos"
                          description="Los cobros y pagos aparecen acá solos. También podés cargar un gasto o una transferencia."
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
          </>
        )}
      </div>

      <MovimientoDetalle
        abierto={ver !== null}
        movimiento={ver}
        onCerrar={() => setVer(null)}
        onConciliar={() => {
          if (ver) {
            conciliar(ver)
            setVer({ ...ver, conciliado: !ver.conciliado })
          }
        }}
        onBorrar={() => {
          setABorrar(ver)
          setVer(null)
        }}
      />

      <LecturaGastoDialog
        abierto={leyendo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setDialogo("gasto")
        }}
      />

      <MovimientoDialog
        modo={dialogo}
        cuentas={cuentas}
        borrador={borrador}
        onCerrar={() => {
          setDialogo(null)
          setBorrador(null)
        }}
        onGuardado={alGuardar}
      />

      <ConfirmarDialog
        abierto={aBorrar !== null}
        titulo="¿Borrar el movimiento?"
        descripcion="Se borra definitivamente y el saldo de la cuenta se recalcula solo."
        confirmar="Borrar"
        trabajando={borrando}
        onCerrar={() => setABorrar(null)}
        onConfirmar={borrar}
      />
    </>
  )
}
