"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { MarcoFormulario } from "@/components/admin/marco-formulario"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
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
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  type EstadoPresupuesto,
  type PresupuestoFila,
} from "@/lib/comercial/presupuestos"
import { cn } from "@/lib/utils"

/**
 * El listado de presupuestos.
 *
 * "A medida que se cargan los presupuestos se vayan cargando en un listado fácil
 * de buscar", dice el pedido. Lo que hace fácil buscar acá no es el buscador
 * sino la referencia: nadie recuerda que el de Río Gallegos era el PRES-3927,
 * pero sí que era "el cambio de AP". Por eso la referencia va grande y al lado
 * del cliente, y el número queda como dato de identificación.
 */
export function PresupuestosClient() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState<EstadoPresupuesto | "">("")
  const [creando, setCreando] = useState(false)
  /** El presupuesto que se está por borrar. Se pregunta antes: un presupuesto
   *  es media hora de trabajo y el botón vive al lado de la fila. */
  const [borrando, setBorrando] = useState<PresupuestoFila | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const invalidar = useInvalidarAdmin()

  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (estado) params.set("estado", estado)
  const url = `/api/comercial/presupuestos${params.toString() ? `?${params}` : ""}`

  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ presupuestos?: PresupuestoFila[] }>(url, { signal }),
    placeholderData: keepPreviousData,
  })

  const filas = consulta.data?.presupuestos ?? []

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, referencia, cliente o vendedor…"
              className="pl-8"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
            {([["", "Todos"], ...ESTADOS.map((e) => [e, ESTADO_LABEL[e]] as const)] as const).map(
              ([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setEstado(v as EstadoPresupuesto | "")}
                  aria-pressed={estado === v}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    estado === v
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  {etiqueta}
                </button>
              )
            )}
          </div>

          <Button onClick={() => setCreando(true)} className="ml-auto">
            <Plus className="h-3.5 w-3.5" />
            Nuevo presupuesto
          </Button>
        </div>

        {consulta.isPending ? (
          <LoadingState label="Cargando presupuestos…" />
        ) : consulta.isError ? (
          <ErrorState
            message={mensajeError(consulta.error, "No se pudieron cargar los presupuestos")}
            onRetry={() => consulta.refetch()}
          />
        ) : filas.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={q || estado ? "Ningún presupuesto coincide" : "Todavía no hay presupuestos"}
            description={
              q || estado
                ? "Probá con otra búsqueda o sacá el filtro de estado."
                : "Armá el primero: elegís el cliente, escribís la referencia y el sistema le pone el número."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N.º</TableHead>
                <TableHead>Cliente y referencia</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Validez</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Venta</TableHead>
                <TableHead className="text-right">Renta</TableHead>
                <TableHead className="w-[76px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((p) => (
                <TableRow
                  key={p.id}
                  onClick={() => router.push(`/comercial/presupuestos/${p.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="num whitespace-nowrap font-semibold text-ink">
                    {p.numero}
                  </TableCell>
                  <TableCell className="max-w-[340px]">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {p.clienteNombre ?? "—"}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-muted">{p.referencia}</p>
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-ink-secondary">
                    {formatearFecha(p.fecha)}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-ink-secondary">
                    {p.fechaValidez ? (
                      formatearFecha(p.fechaValidez)
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-[12px] text-ink-secondary">
                    {p.vendedorNombre ?? <span className="text-ink-faint">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={ESTADO_TONO[p.estado]} size="sm">
                      {ESTADO_LABEL[p.estado]}
                    </Badge>
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-right font-semibold text-ink">
                    {formatearImporte(p.totales.venta, p.moneda)}
                  </TableCell>
                  {/* La renta en porcentaje y no en importe: es el número con el
                      que se decide si un presupuesto vale la pena, y compararlo
                      entre presupuestos de distinto tamaño solo funciona así. */}
                  <TableCell
                    className={cn(
                      "num whitespace-nowrap text-right font-medium",
                      p.totales.rentabilidad < 0 ? "text-danger-text" : "text-ink-secondary"
                    )}
                  >
                    {p.totales.venta === 0
                      ? "—"
                      : `${Math.round(p.totales.rentaPct * 100)} %`}
                  </TableCell>

                  {/* Editar y borrar, como en el resto del sistema: aparecen al
                      pasar por encima de la fila. `stopPropagation` para que
                      borrar no abra además el presupuesto. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="acciones-fila flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => router.push(`/comercial/presupuestos/${p.id}`)}
                        aria-label={`Editar el presupuesto ${p.numero}`}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setBorrando(p)}
                        aria-label={`Borrar el presupuesto ${p.numero}`}
                        title="Borrar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmarDialog
        abierto={borrando !== null}
        titulo={`Borrar el presupuesto ${borrando?.numero ?? ""}`}
        descripcion={
          <>
            Se va <strong>{borrando?.referencia}</strong> de {borrando?.clienteNombre}, con su
            planilla de costos entera. No se puede deshacer.
          </>
        }
        confirmar="Borrar"
        trabajando={trabajando}
        onCerrar={() => !trabajando && setBorrando(null)}
        onConfirmar={async () => {
          if (!borrando) return
          setTrabajando(true)
          try {
            await pedirJson(`/api/comercial/presupuestos/${borrando.id}`, { method: "DELETE" })
            await invalidar()
            toast.success(`Presupuesto ${borrando.numero} borrado`)
            setBorrando(null)
          } catch (e) {
            toast.error(mensajeError(e, "No se pudo borrar"))
          } finally {
            setTrabajando(false)
          }
        }}
      />

      {creando && (
        <DialogoNuevo
          onCerrar={() => setCreando(false)}
          onCreado={(id) => router.push(`/comercial/presupuestos/${id}`)}
        />
      )}
    </div>
  )
}

/**
 * El alta pide lo mínimo: cliente y referencia.
 *
 * Todo lo demás —moneda, validez, vendedor, la planilla entera— se carga en el
 * presupuesto ya creado. Es lo que permite cumplir con el pedido de que el
 * número exista desde el principio: con un formulario largo, el número recién
 * aparecería al final, que es cuando ya no sirve para nombrar nada.
 */
function DialogoNuevo({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void
  onCreado: (id: string) => void
}) {
  const [cliente, setCliente] = useState<{ id: string; razonSocial: string } | null>(null)
  const [referencia, setReferencia] = useState("")
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    if (!cliente || !referencia.trim() || guardando) return
    setGuardando(true)
    try {
      const { presupuesto } = await pedirJson<{ presupuesto: { id: string; numero: number } }>(
        "/api/comercial/presupuestos",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, referencia: referencia.trim() }),
        }
      )
      toast.success(`Presupuesto ${presupuesto.numero} creado`)
      onCreado(presupuesto.id)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo crear el presupuesto"))
      setGuardando(false)
    }
  }

  return (
    <MarcoFormulario
      embebido={false}
      etiqueta="Crear presupuesto"
      alto="max-h-[80vh]"
      onFondo={() => {
        if (!guardando) onCerrar()
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileText className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
              Nuevo presupuesto
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              El número se asigna solo. El resto se carga adentro.
            </p>
          </div>
        </div>
        <button
          onClick={onCerrar}
          disabled={guardando}
          aria-label="Cerrar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <SelectorEntidad
          id="cliente-presupuesto"
          tipo="cliente"
          valor={cliente?.id ?? ""}
          nombre={cliente?.razonSocial ?? ""}
          disabled={guardando}
          permitirAlta
          onElegir={(c) => setCliente(c)}
        />

        <div>
          <label htmlFor="referencia" className="text-[12.5px] font-semibold text-ink">
            Referencia
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            De qué es el presupuesto. Es con lo que se lo va a encontrar después.
          </p>
          <Input
            id="referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Cambio de AP — Sucursal Río Gallegos"
            disabled={guardando}
            className="mt-1.5"
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5">
        <Button variant="outline" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={crear} disabled={!cliente || !referencia.trim() || guardando}>
          Crear y cargar
        </Button>
      </div>
    </MarcoFormulario>
  )
}
