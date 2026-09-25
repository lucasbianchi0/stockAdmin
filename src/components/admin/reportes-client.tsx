"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, PieChart } from "lucide-react"

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
import { descargarCsv } from "@/lib/admin/csv"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
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
  /** -1 en las notas de crédito. Todos los importes ya vienen con él aplicado:
   *  una NC pendiente es crédito a favor del cliente, no deuda suya. */
  signo: 1 | -1
  /** Neto e impuestos en la moneda del comprobante. Suman el total exacto. */
  neto: number
  impuestos: number
  /** Solo en las facturas en dólares; en las de pesos `null`. */
  totalUsd: number | null
  /** El dólar del día de emisión. `null` en las facturas en pesos. */
  tcEmision: number | null
  /** El total valuado en pesos: el suyo si está en pesos, o al TC de emisión. */
  totalArs: number
  total: number
  imputado: number
  saldo: number
  detalle: string | null
  vencida: boolean
  /** Cuándo se calcula que se va a cobrar (o pagar). Se edita desde acá mismo. */
  fechaEstimadaPago: string | null
}

type Totales = {
  cantidad: number
  /** Todo en pesos, cada factura a su propio tipo de cambio. */
  ars: number
  /** Esa suma llevada a dólares de hoy. `null` sin cotización cargada. */
  usdHoy: number | null
  dolar: number | null
  dolarActualizado: string | null
  vencidas: number
  vencidoArs: number
  truncado: boolean
}

type Solapa = "cobrar" | "pagar"

/**
 * Había una tercera, «Saldos por cuenta», y se fue.
 *
 * Mostraba el saldo de cada caja y cada banco, que es exactamente lo que ya
 * muestra Caja y Bancos en el tablero —ahí y con más datos: entradas y salidas
 * del mes, lo que falta conciliar, y el link al extracto de cada una—. Tener el
 * mismo número en dos pantallas no es redundancia inofensiva: el día que una de
 * las dos se calcula distinto, nadie sabe cuál creer.
 */
const SOLAPAS: { valor: Solapa; etiqueta: string }[] = [
  { valor: "cobrar", etiqueta: "Pendientes de cobro" },
  { valor: "pagar", etiqueta: "Pendientes de pago" },
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
    </>
  )
}

/* ── Pendientes de cobro / de pago ────────────────────────────────────────── */

function Pendientes({ tipo }: { tipo: "venta" | "compra" }) {
  const esVenta = tipo === "venta"

  const url = `/api/admin/reportes/pendientes?tipo=${tipo}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ filas?: Pendiente[]; totales?: Totales }>(url, { signal }),
  })
  const filas = query.data?.filas ?? []
  const totales = query.data?.totales ?? null
  const cargando = query.isPending

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
        "Neto",
        "Impuestos",
        "Total USD",
        "TC",
        "Total $",
        esVenta ? "Cobro estimado" : "Pago estimado",
        "Detalle",
      ],
      filas.map((f) => [
        f.entidad,
        f.clase,
        f.numero,
        f.fecha,
        f.fechaVencimiento ?? "",
        f.moneda,
        f.neto,
        f.impuestos,
        f.totalUsd ?? "",
        f.tcEmision ?? "",
        f.totalArs,
        f.fechaEstimadaPago ?? "",
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
          {/* Un solo total, en pesos: cada factura valuada al dólar de su fecha
              de emisión. Antes eran dos números por moneda que no se podían
              sumar, y la pregunta "cuánto me deben" no tenía una respuesta. */}
          <Total
            rotulo={esVenta ? "Total a cobrar" : "Total a pagar"}
            valor={formatearImporte(totales.ars, "ARS")}
          />
          {/* Y recién acá entra el dólar de hoy: la suma entera llevada a
              dólares, que es otra pregunta —cuánto es esto si lo cobrara hoy— y
              por eso dice de cuándo es la cotización. */}
          {totales.usdHoy !== null && (
            <div>
              <p className="eyebrow">Equivale a</p>
              <p className="num mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-ink">
                {formatearImporte(totales.usdHoy, "USD")}
              </p>
              <p className="num mt-0.5 text-[10.5px] text-ink-muted">
                dólar {formatearImporte(totales.dolar ?? 0, "ARS", { decimales: 2 })}
                {totales.dolarActualizado && ` · ${cuandoSeActualizo(totales.dolarActualizado)}`}
              </p>
            </div>
          )}
          {totales.vencidas > 0 && (
            <div className="flex items-center gap-2">
              <Badge tone="danger" size="md">
                {totales.vencidas} vencida{totales.vencidas !== 1 ? "s" : ""}
              </Badge>
              <span className="num text-[12px] text-danger-text">
                {formatearImporte(totales.vencidoArs, "ARS")}
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
              {/* Abierta como la planilla que reemplaza, menos el neto: en
                  pantalla no aporta —se deduce del total menos los impuestos— y
                  era una columna más para barrer. Sigue saliendo en el CSV, que
                  es donde la planilla lo tenía. */}
              <TableHead className="text-right">Impuestos</TableHead>
              <TableHead className="text-right">Total USD</TableHead>
              <TableHead className="text-right">TC</TableHead>
              <TableHead className="text-right">Total $</TableHead>
              {/* Última porque es la única que se escribe: la vista se lee de
                  izquierda a derecha y termina en la decisión que hay que tomar. */}
              <TableHead>{esVenta ? "Cobro estimado" : "Pago estimado"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.id} className={cn(f.vencida && "bg-danger-soft/40")}>
                <TableCell className="font-medium text-ink">{f.entidad}</TableCell>
                <TableCell>
                  <Badge tone={f.signo === -1 ? "warning" : "neutral"} size="sm">
                    {f.clase}
                  </Badge>
                  <span className="num ml-2 text-[12px] text-ink-secondary">{f.numero}</span>
                </TableCell>
                <TableCell className="num text-ink-secondary">{fechaCorta(f.fecha)}</TableCell>
                <TableCell>
                  <SemaforoVencimiento fecha={f.fechaVencimiento} />
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {formatearImporte(f.impuestos, f.moneda)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                  {f.totalUsd !== null ? (
                    formatearImporte(f.totalUsd, "USD")
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right text-ink-muted">
                  {f.tcEmision !== null ? (
                    formatearImporte(f.tcEmision, "ARS", { simbolo: false })
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right font-semibold text-ink">
                  {formatearImporte(f.totalArs, "ARS")}
                </TableCell>
                <TableCell>
                  <CeldaPagoEstimado
                    id={f.id}
                    recurso={esVenta ? "ventas" : "compras"}
                    valor={f.fechaEstimadaPago}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

/**
 * La fecha estimada de pago, editable en la fila.
 *
 * Guarda al soltar el selector, sin botón: el gesto ya es explícito —se eligió
 * un día en un calendario— y un "guardar" por fila convertiría planificar la
 * cobranza de veinte facturas en cuarenta clics.
 *
 * El valor que se ve es el tipeado hasta que el servidor contesta; si falla,
 * vuelve al que tenía y se marca en rojo. Nunca se queda mostrando una fecha
 * que no se guardó, que es la única forma en que una celda así miente.
 */
function CeldaPagoEstimado({
  id,
  recurso,
  valor,
}: {
  id: string
  recurso: "ventas" | "compras"
  valor: string | null
}) {
  const invalidar = useInvalidarAdmin()
  const [local, setLocal] = useState(valor ?? "")
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState(false)

  // Si el reporte se vuelve a pedir —otra pestaña, otra pantalla— manda el
  // servidor.
  useEffect(() => setLocal(valor ?? ""), [valor])

  const guardar = async (v: string) => {
    setLocal(v)
    setGuardando(true)
    setFallo(false)
    try {
      await pedirJson(`/api/admin/${recurso}/${id}/pago-estimado`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fechaEstimadaPago: v || null }),
      })
      await invalidar()
    } catch {
      setFallo(true)
      setLocal(valor ?? "")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Input
      type="date"
      value={local}
      onChange={(e) => guardar(e.target.value)}
      disabled={guardando}
      aria-label="Fecha estimada de pago"
      title={fallo ? "No se pudo guardar. Probá de nuevo." : undefined}
      className={cn("num h-8 w-[132px] text-[12px]", fallo && "border-danger-line")}
    />
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

/**
 * "hoy 15:24", "ayer 09:12" o "22/9 18:03".
 *
 * El total en dólares se mueve solo con la cotización, así que tiene que decir
 * de cuándo es. En horas y no en fecha a secas porque el dólar cambia dentro
 * del mismo día, y lo que importa saber es si el número es de hace un rato o de
 * la semana pasada.
 */
function cuandoSeActualizo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // 24 horas: "15:24" y no "03:24 p. m.", que es como se lee la hora acá y
  // además no se parte en dos líneas al lado de la cotización.
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((dia(new Date()) - dia(d)) / 86_400_000)
  if (dias === 0) return `hoy ${hora}`
  if (dias === 1) return `ayer ${hora}`
  return `${d.getDate()}/${d.getMonth() + 1} ${hora}`
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}
