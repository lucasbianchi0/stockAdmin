"use client"

import { useCallback, useMemo, useState } from "react"
import { Eye, FileInput, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarDialog } from "@/components/admin/confirmar-dialog"
import { ComprobanteDetalle } from "@/components/admin/comprobante-detalle"
import { ComprobanteDialog } from "@/components/admin/comprobante-dialog"
import { ImportarFacturasDialog } from "@/components/admin/importar-facturas-dialog"
import {
  SemaforoVencimiento,
  claseFilaVencimiento,
} from "@/components/admin/semaforo-vencimiento"
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
import {
  etiquetaSaldo,
  buscarClase,
  estadoDeSaldo,
  estadoVencimiento,
  formatearNumero,
  type Comprobante,
  type TipoComprobante,
} from "@/lib/admin/comprobantes"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearCompacto, formatearImporte, formatearTc } from "@/lib/admin/moneda"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

type FiltroVencimiento = "" | "vencidas" | "por_vencer"

const FILTROS: { valor: FiltroVencimiento; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todas" },
  { valor: "vencidas", etiqueta: "Vencidas" },
  { valor: "por_vencer", etiqueta: "Por vencer" },
]

/**
 * Listado de facturas de venta.
 *
 * Lo que gobierna esta pantalla es el vencimiento: el orden por defecto es la
 * fecha del comprobante, pero lo vencido se tiñe, lleva punto rojo y dice cuánto
 * hace que venció. La pregunta que esta tabla tiene que contestar de un vistazo
 * no es "qué facturé" sino "qué tengo que ir a cobrar".
 *
 * Los totales de arriba van en las dos monedas por separado y **no se suman
 * entre sí**: convertir los dólares a pesos para dar un número único obligaría a
 * elegir un tipo de cambio (¿el de cada factura? ¿el de hoy?) y cualquiera de
 * las dos respuestas es engañosa según para qué se mire.
 */
export function ComprobantesClient({ tipo }: { tipo: TipoComprobante }) {
  const esCompra = tipo === "compra"
  const recurso = esCompra ? "compras" : "ventas"
  const rotuloPlural = esCompra ? "comprobantes" : "facturas"
  const rotuloEntidad = esCompra ? "Proveedor" : "Cliente"

  const [vencimiento, setVencimiento] = useState<FiltroVencimiento>("")
  const [moneda, setMoneda] = useState<"" | "ARS" | "USD">("")

  const filtros = useMemo(
    () => ({ vencimiento: vencimiento || undefined, moneda: moneda || undefined }),
    [vencimiento, moneda]
  )

  const tabla = useTablaAdmin<Comprobante>({
    endpoint: `/api/admin/${recurso}`,
    clave: "comprobantes",
    filtros,
  })

  const [dialogo, setDialogo] = useState<{ abierto: boolean; comprobante: Comprobante | null }>({
    abierto: false,
    comprobante: null,
  })
  const [verId, setVerId] = useState<string | null>(null)
  const [aEliminar, setAEliminar] = useState<Comprobante | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [importando, setImportando] = useState(false)

  const { recargar } = tabla

  const alGuardar = useCallback(
    (c: Comprobante, esNuevo: boolean) => {
      setDialogo({ abierto: false, comprobante: null })
      toast.success(
        esNuevo
          ? `${c.clase} ${formatearNumero(c.puntoVenta, c.numero)} registrado`
          : "Cambios guardados"
      )
      recargar()
    },
    [recargar]
  )

  const eliminar = async () => {
    if (!aEliminar) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/admin/${recurso}/${aEliminar.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar")
      toast.success("Factura eliminada")
      setAEliminar(null)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    } finally {
      setEliminando(false)
    }
  }

  /* Los totales son de la página visible, y el rótulo lo dice. Sumar el total
     real exigiría una consulta de agregación aparte — va a llegar con el módulo
     de reportes, donde ese número es el producto y no un adorno de la tabla. */
  const resumen = useMemo(() => {
    let ars = 0
    let usd = 0
    let vencidas = 0
    for (const c of tabla.filas) {
      if (c.moneda === "ARS") ars += c.total * c.signo
      else usd += c.total * c.signo
      // Vencida quiere decir vencida **e impaga**: contar las ya cobradas
      // infla el número que después manda a llamar a alguien.
      if (
        estadoDeSaldo(c.total, c.saldo) !== "saldado" &&
        estadoVencimiento(c.fechaVencimiento) === "vencido"
      ) {
        vencidas++
      }
    }
    return { ars, usd, vencidas }
  }, [tabla.filas])

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-surface-subtle px-4 py-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={tabla.busqueda}
              onChange={(e) => tabla.setBusqueda(e.target.value)}
              placeholder="Buscar por número o detalle…"
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
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => setVencimiento(f.valor)}
                aria-pressed={vencimiento === f.valor}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  vencimiento === f.valor
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
            {([["", "$ y USD"], ["ARS", "Pesos"], ["USD", "Dólares"]] as const).map(
              ([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setMoneda(v)}
                  aria-pressed={moneda === v}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    moneda === v
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {etiqueta}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <Button variant="outline" onClick={() => setImportando(true)}>
              <FileInput className="h-3.5 w-3.5" />
              Carga inteligente
            </Button>
            <Button onClick={() => setDialogo({ abierto: true, comprobante: null })}>
              <Plus className="h-3.5 w-3.5" />
              {esCompra ? "Nuevo comprobante" : "Nueva factura"}
            </Button>
          </div>
        </div>

        {/* Resumen de la página */}
        {tabla.filas.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line-soft px-4 py-2.5">
            <span className="eyebrow">En esta página</span>
            {resumen.ars !== 0 && (
              <span className="num text-[12.5px] font-semibold text-ink">
                {formatearCompacto(resumen.ars, "ARS")}
              </span>
            )}
            {resumen.usd !== 0 && (
              <span className="num text-[12.5px] font-semibold text-ink">
                {formatearCompacto(resumen.usd, "USD")}
              </span>
            )}
            {resumen.vencidas > 0 && (
              <Badge tone="danger" size="sm">
                {resumen.vencidas} vencida{resumen.vencidas !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}

        {tabla.cargandoInicial ? (
          <LoadingState label={`Cargando ${rotuloPlural}…`} />
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
                    <TableHead>Comprobante</TableHead>
                    <TableHead>{rotuloEntidad}</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">
                      {esCompra ? "Falta pagar" : "Falta cobrar"}
                    </TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="w-[116px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabla.filas.length > 0 ? (
                    tabla.filas.map((c) => (
                      <Fila
                        key={c.id}
                        c={c}
                        onVer={() => setVerId(c.id)}
                        onEditar={() => setDialogo({ abierto: true, comprobante: c })}
                        onEliminar={() => setAEliminar(c)}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <EmptyState
                          icon={FileText}
                          title={
                            tabla.busqueda || vencimiento
                              ? "Sin resultados"
                              : `Todavía no hay ${rotuloPlural}`
                          }
                          description={
                            tabla.busqueda || vencimiento
                              ? "Probá con otro criterio de búsqueda."
                              : esCompra
                                ? "Cargá el primer comprobante recibido."
                                : "Registrá la primera factura emitida en AFIP."
                          }
                          action={
                            !tabla.busqueda &&
                            !vencimiento && (
                              <Button
                                onClick={() =>
                                  setDialogo({ abierto: true, comprobante: null })
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {esCompra ? "Nuevo comprobante" : "Nueva factura"}
                              </Button>
                            )
                          }
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

      <ComprobanteDetalle
        abierto={verId !== null}
        tipo={tipo}
        comprobanteId={verId}
        onCerrar={() => setVerId(null)}
        onEditar={(c) => {
          setVerId(null)
          setDialogo({ abierto: true, comprobante: c })
        }}
      />

      <ComprobanteDialog
        abierto={dialogo.abierto}
        tipo={tipo}
        comprobante={dialogo.comprobante}
        onCerrar={() => setDialogo({ abierto: false, comprobante: null })}
        onGuardado={alGuardar}
      />

      <ImportarFacturasDialog
        tipo={tipo}
        abierto={importando}
        onCerrar={() => setImportando(false)}
        onImportadas={() => recargar()}
      />

      <ConfirmarDialog
        abierto={aEliminar !== null}
        titulo={esCompra ? "¿Eliminar el comprobante?" : "¿Eliminar la factura?"}
        descripcion={
          <>
            {aEliminar && (
              <>
                <strong>
                  {aEliminar.clase} {formatearNumero(aEliminar.puntoVenta, aEliminar.numero)}
                </strong>{" "}
                de {aEliminar.clienteNombre ?? aEliminar.proveedorNombre} por{" "}
                {formatearImporte(aEliminar.total, aEliminar.moneda)}.
                <br />
                <br />
              </>
            )}
            Se borra definitivamente. El comprobante existe igual fuera del sistema:
            eliminalo solo si lo cargaste por error.
          </>
        }
        confirmar="Eliminar"
        trabajando={eliminando}
        onCerrar={() => setAEliminar(null)}
        onConfirmar={eliminar}
      />
    </>
  )
}

function Fila({
  c,
  onVer,
  onEditar,
  onEliminar,
}: {
  c: Comprobante
  onVer: () => void
  onEditar: () => void
  onEliminar: () => void
}) {
  const clase = buscarClase(c.tipo, c.clase)
  const esNota = clase?.signo === -1
  const saldado = estadoDeSaldo(c.total, c.saldo) === "saldado"

  return (
    <TableRow
      onClick={onVer}
      className={cn("cursor-pointer", claseFilaVencimiento(c.fechaVencimiento, saldado))}
    >
      <TableCell className="num whitespace-nowrap text-ink-secondary">
        {formatearFecha(c.fecha)}
      </TableCell>

      {/* El detalle pasó de columna propia a segundo renglón del comprobante.
          Como columna competía en ancho con la plata y casi siempre se leía
          truncado; acá acompaña al número, que es lo que identifica la fila. */}
      <TableCell className="max-w-[230px]">
        <div className="flex items-center gap-2">
          <Badge tone={esNota ? "warning" : "neutral"} size="sm">
            {c.clase}
          </Badge>
          <span className="num text-[12px] text-ink-secondary">
            {formatearNumero(c.puntoVenta, c.numero)}
          </span>
        </div>
        {c.detalle && (
          <span className="block truncate text-[11.5px] text-ink-muted" title={c.detalle}>
            {c.detalle}
          </span>
        )}
      </TableCell>

      <TableCell>
        <span className="font-medium text-ink">
          {c.clienteNombre ?? c.proveedorNombre ?? "—"}
        </span>
      </TableCell>

      <TableCell className="text-right">
        <span
          className={cn(
            "num block font-semibold",
            esNota ? "text-danger-text" : "text-ink"
          )}
        >
          {esNota ? "−" : ""}
          {formatearImporte(c.total, c.moneda)}
        </span>
        {/* El contravalor siempre visible: es lo que pidió administración —ver la
            factura en las dos monedas sin abrir nada. El tipo de cambio viaja
            pegado acá en vez de tener columna propia: solo dice algo cuando la
            factura está en dólares, y una columna vacía en ocho de cada diez
            filas es ancho regalado. */}
        <span className="num block text-[11px] text-ink-muted">
          {c.moneda === "USD"
            ? `${formatearImporte(c.totalArs, "ARS")} · ${formatearTc(c.tc)}`
            : formatearImporte(c.totalUsd, "USD")}
        </span>
      </TableCell>

      {/* Saldo: lo que falta cobrar. Es la columna que dice si hay que salir a
          buscar la plata, así que va al lado del total y no escondida. */}
      <TableCell className="text-right">
        {(() => {
          const estado = estadoDeSaldo(c.total, c.saldo)
          if (estado === "saldado") {
            return (
              <Badge tone="success" size="sm">
                {etiquetaSaldo("saldado", c.tipo)}
              </Badge>
            )
          }
          return (
            <div>
              <span className="num block font-medium text-ink">
                {formatearImporte(c.saldo, c.moneda)}
              </span>
              {estado === "parcial" && (
                <span className="text-[10.5px] text-ink-muted">
                  {etiquetaSaldo("parcial", c.tipo)}
                </span>
              )}
            </div>
          )
        })()}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <SemaforoVencimiento fecha={c.fechaVencimiento} saldado={saldado} />
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={onVer} aria-label="Ver detalle">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEditar} aria-label="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEliminar}
            aria-label="Eliminar"
            className="text-ink-faint hover:bg-danger-soft hover:text-danger-text"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
