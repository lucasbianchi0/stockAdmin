"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeftRight, FileInput, Plus, Receipt, Search } from "lucide-react"
import { toast } from "sonner"

import { AvisoSinAsiento } from "@/components/admin/aviso-sin-asiento"
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
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import {
  CATEGORIA_LABEL,
  ORIGEN_LABEL,
  esEditable,
  type Movimiento,
} from "@/lib/admin/movimientos"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

/**
 * Otros movimientos — el punto 2.3.B del pliego.
 *
 * La definición es del documento y es la que ordena toda la pantalla: **todo
 * movimiento de dinero que no sea a través de facturas**. Sueldos, impuestos,
 * gastos bancarios, suscripciones a fondos; y del otro lado, las acreditaciones
 * que tampoco son una venta, como los rescates de FIMA.
 *
 * POR QUÉ EXISTE SI YA ESTÁ CAJA Y BANCOS
 *
 * Porque son dos preguntas distintas y hasta acá compartían pantalla. Caja y
 * bancos contesta «¿cuánto hay y qué pasó en el Galicia?» y para eso ordena por
 * cuenta: se entra a una y se lee su extracto. Esta contesta «¿qué se pagó este
 * mes que no vino con factura?», que cruza todas las cuentas y no se puede mirar
 * una cuenta por vez.
 *
 * Las dos escriben lo mismo —el mismo diálogo, la misma tabla— y por eso lo que
 * se carga acá aparece en el extracto de su cuenta al instante, y al revés.
 *
 * Lo que **no** entra: los movimientos que generó un cobro o un pago. Esos no se
 * editan desde ninguna de las dos pantallas; se anula el recibo y el `on delete
 * cascade` se los lleva, porque si no quedarían facturas canceladas sin la plata
 * que las respalda.
 */
export function MovimientosClient() {
  const [cuentaId, setCuentaId] = useState("")
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([])

  const tabla = useTablaAdmin<Movimiento>({
    endpoint: "/api/admin/movimientos",
    clave: "movimientos",
    // `sueltos` es lo que hace que esta pantalla sea "otros movimientos" y no
    // "todos los movimientos": deja afuera lo que cuelga de un recibo.
    filtros: { sueltos: "1", cuentaId: cuentaId || undefined },
  })

  const [dialogo, setDialogo] = useState<null | "gasto" | "transferencia" | "ajuste">(null)
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null)
  const [ver, setVer] = useState<Movimiento | null>(null)
  const [editando, setEditando] = useState<Movimiento | null>(null)
  const [aBorrar, setABorrar] = useState<Movimiento | null>(null)
  const [borrando, setBorrando] = useState(false)

  const { recargar } = tabla

  useEffect(() => {
    fetch("/api/admin/cuentas")
      .then((r) => r.json())
      .then((d) => setCuentas(d.cuentas ?? []))
      .catch(() => setCuentas([]))
  }, [])

  const alGuardar = useCallback(
    (corregido = false) => {
      setDialogo(null)
      setBorrador(null)
      toast.success(corregido ? "Movimiento corregido" : "Movimiento registrado")
      recargar()
    },
    [recargar]
  )

  const conciliar = async (m: Movimiento) => {
    try {
      const res = await fetch(`/api/admin/movimientos/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conciliado: !m.conciliado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo conciliar")
      setVer(null)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conciliar")
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
      setVer(null)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar")
    } finally {
      setBorrando(false)
    }
  }

  return (
    <>
      {/* Un movimiento tipeado a mano es la fuente más común de documentos fuera
          del mayor: el asiento de un recibo lo arma el recibo, pero una comisión
          bancaria necesita que alguien le diga contra qué cuenta va. */}
      <AvisoSinAsiento filtro={{ origen: "movimiento" }} />

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3">
          <p className="text-[12.5px] text-ink-muted">
            Todo lo que se movió sin una factura de por medio: sueldos, impuestos, gastos
            bancarios, suscripciones y rescates de fondos
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setLeyendo(true)}>
              <FileInput className="h-3.5 w-3.5" />
              Carga inteligente
            </Button>
            <Button variant="outline" onClick={() => setDialogo("transferencia")}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transferencia
            </Button>
            <Button onClick={() => setDialogo("gasto")}>
              <Plus className="h-3.5 w-3.5" />
              Nuevo movimiento
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={tabla.busqueda}
              onChange={(e) => tabla.setBusqueda(e.target.value)}
              placeholder="Buscar por detalle o referencia…"
              className="pl-9"
              aria-label="Buscar un movimiento"
            />
          </div>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            aria-label="Filtrar por cuenta"
            className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink"
          >
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
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
                    <TableHead>Concepto</TableHead>
                    <TableHead>Imputación</TableHead>
                    {/* Débitos y créditos en columnas separadas, como en el
                        extracto del banco: es lo que deja sumar cada columna y
                        compararla contra el resumen. Y es la columna donde el
                        pliego quiere ver los rescates de FIMA. */}
                    <TableHead className="text-right">Débitos</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabla.filas.length > 0 ? (
                    tabla.filas.map((m) => {
                      const entra = m.signo === 1
                      return (
                        <TableRow
                          key={m.id}
                          onClick={() => setVer(m)}
                          className="cursor-pointer"
                        >
                          <TableCell className="num whitespace-nowrap text-ink-secondary">
                            {formatearFecha(m.fecha)}
                          </TableCell>
                          <TableCell className="text-[12.5px] text-ink">
                            {m.cuentaNombre ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone="neutral" size="sm">
                                {m.categoria
                                  ? CATEGORIA_LABEL[m.categoria]
                                  : ORIGEN_LABEL[m.origen]}
                              </Badge>
                              {!m.conciliado && (
                                <span className="text-[11px] text-ink-faint">sin conciliar</span>
                              )}
                            </div>
                            {(m.detalle || m.referencia) && (
                              <p className="mt-0.5 truncate text-[11.5px] text-ink-muted">
                                {m.detalle ?? m.referencia}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-[11.5px] text-ink-muted">
                            {m.cuentaContableNombre ?? (
                              <span className="text-warning-text">Sin imputar</span>
                            )}
                          </TableCell>
                          <TableCell className="num text-right font-medium text-ink">
                            {entra ? "" : formatearImporte(m.importe, m.moneda)}
                          </TableCell>
                          <TableCell className="num text-right font-medium text-success-text">
                            {entra ? formatearImporte(m.importe, m.moneda) : ""}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={Receipt}
                          title="Todavía no hay movimientos sueltos"
                          description="Lo que se paga sin factura —sueldos, impuestos, comisiones— y lo que se acredita sin ser una venta se carga acá."
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

      <LecturaGastoDialog
        abierto={leyendo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setDialogo("gasto")
        }}
      />

      {/* El listado ya trae el movimiento entero, así que corregirlo no necesita
          pedirlo de nuevo como en el extracto. */}
      <MovimientoDialog
        modo={dialogo}
        edicion={editando}
        cuentas={cuentas}
        borrador={borrador}
        onCerrar={() => {
          setDialogo(null)
          setBorrador(null)
          setEditando(null)
        }}
        onGuardado={() => {
          const corregia = editando !== null
          setEditando(null)
          alGuardar(corregia)
        }}
      />

      <MovimientoDetalle
        abierto={ver !== null}
        movimiento={ver}
        onCerrar={() => setVer(null)}
        onConciliar={() => ver && conciliar(ver)}
        onEditar={
          ver
            ? () => {
                setEditando(ver)
                setVer(null)
              }
            : undefined
        }
        onBorrar={ver && esEditable(ver.origen) ? () => setABorrar(ver) : undefined}
      />

      <ConfirmarDialog
        abierto={aBorrar !== null}
        titulo="Borrar el movimiento"
        descripcion="El saldo de la cuenta y el asiento que generó se deshacen con él."
        confirmar="Borrar"
        trabajando={borrando}
        onCerrar={() => setABorrar(null)}
        onConfirmar={borrar}
      />
    </>
  )
}
