"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Boxes, Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatoRevision, DialogoPasos } from "@/components/ui/dialogo-pasos"
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
import { Textarea } from "@/components/ui/textarea"
import { formatearFecha, hoyArgentina } from "@/lib/admin/fecha"
import { formatearImporte, parsearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { formatearCantidad, parsearSeries, type ItemStock } from "@/lib/admin/stock"
import { cn } from "@/lib/utils"

/**
 * El stock: qué hay de cada cosa, cuánto costó y cuándo se movió por última vez.
 *
 * Arriba de todo el botón para dar de alta un ítem, porque es lo primero que se
 * hace y lo único que se puede hacer con la pantalla vacía. Cada fila lleva a la
 * ficha del ítem, que es donde se registran las compras, las ventas y los
 * ajustes.
 */

const URL = "/api/admin/stock"

export function StockClient() {
  const router = useRouter()
  const [nuevo, setNuevo] = useState(false)
  const [buscar, setBuscar] = useState("")
  const query = useQuery({
    queryKey: claves.url(URL),
    queryFn: ({ signal }) => pedirJson<{ items: ItemStock[] }>(URL, { signal }),
  })
  const items = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    const todos = query.data?.items ?? []
    return t
      ? todos.filter((i) => i.nombre.toLowerCase().includes(t) || (i.codigo ?? "").toLowerCase().includes(t))
      : todos
  }, [query.data, buscar])

  const valorTotal = items.reduce((s, i) => s + Math.max(i.saldo, 0) * (i.costoPromedioUsd ?? 0), 0)
  const negativos = items.filter((i) => i.saldo < 0).length

  if (query.isPending) return <LoadingState label="Cargando el stock…" />
  if (query.isError) {
    return <ErrorState message={mensajeError(query.error, "No se pudo cargar el stock")} onRetry={() => query.refetch()} />
  }

  return (
    <div className="space-y-4">
      {(query.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Todavía no hay ítems en el stock"
          description="Empezá por dar de alta lo que hay hoy en el depósito, con su cantidad y su costo en dólares. Después cada compra y cada venta se registra desde la ficha del ítem."
          action={
            <Button onClick={() => setNuevo(true)}>
              <Plus className="h-4 w-4" />
              Cargar el primer ítem
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[320px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="pl-8"
                aria-label="Buscar ítem"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button onClick={() => setNuevo(true)}>
                <Plus className="h-4 w-4" />
                Nuevo ítem
              </Button>
            </div>
          </div>

          <div className="panel overflow-clip">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-surface-subtle px-5 py-4">
              <div>
                <p className="eyebrow">Ítems</p>
                <p className="num mt-0.5 text-[16px] font-bold text-ink">{items.length}</p>
              </div>
              <div>
                <p className="eyebrow">Valor del stock</p>
                <p className="num mt-0.5 text-[16px] font-bold text-ink">{formatearImporte(valorTotal, "USD")}</p>
              </div>
              {negativos > 0 && (
                <p className="flex items-center gap-1.5 text-[12px] text-danger-text">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {negativos} ítem{negativos === 1 ? "" : "s"} con saldo negativo: falta cargar alguna compra
                </p>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Costo promedio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Último movimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} onClick={() => router.push(`/admin/stock/${i.id}`)} className="cursor-pointer">
                    <TableCell>
                      <p className="text-[13px] font-medium text-ink">{i.nombre}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                        {i.codigo && <span className="font-mono">{i.codigo}</span>}
                        {i.llevaSerie && (
                          <Badge tone="neutral" size="sm">
                            Con N° de serie
                          </Badge>
                        )}
                      </p>
                    </TableCell>
                    <TableCell
                      className={cn("num text-right text-[14px] font-semibold", i.saldo < 0 ? "text-danger-text" : "text-ink")}
                    >
                      {formatearCantidad(i.saldo)}
                    </TableCell>
                    <TableCell className="num text-right text-ink-secondary">
                      {i.costoPromedioUsd === null ? "—" : formatearImporte(i.costoPromedioUsd, "USD")}
                    </TableCell>
                    <TableCell className="num text-right text-ink-secondary">
                      {i.costoPromedioUsd === null || i.saldo <= 0
                        ? "—"
                        : formatearImporte(i.saldo * i.costoPromedioUsd, "USD")}
                    </TableCell>
                    <TableCell className="num text-ink-muted">
                      {i.ultimoMovimiento ? formatearFecha(i.ultimoMovimiento) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {nuevo && <NuevoItem onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

/* ── Alta guiada ──────────────────────────────────────────────────────────── */

/** El dólar de una fecha, para proponer el tipo de cambio de una entrada. */
export function useDolarDe(fecha: string) {
  const url = `/api/admin/stock/comprobantes?dolar=${fecha}`
  return useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ tc: number | null }>(url, { signal }),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    staleTime: 60 * 60_000,
  })
}

function NuevoItem({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter()
  const invalidar = useInvalidarAdmin()
  const [paso, setPaso] = useState(0)
  const [nombre, setNombre] = useState("")
  const [codigo, setCodigo] = useState("")
  const [llevaSerie, setLlevaSerie] = useState(false)
  const [hayStock, setHayStock] = useState(true)
  const [cantidad, setCantidad] = useState("")
  const [costo, setCosto] = useState("")
  const [tc, setTc] = useState("")
  const [fecha, setFecha] = useState(hoyArgentina())
  const [textoSeries, setTextoSeries] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const dolar = useDolarDe(fecha)
  // Se propone el dólar de la fecha mientras no se haya escrito uno a mano.
  const [tcTocado, setTcTocado] = useState(false)
  useEffect(() => {
    if (!tcTocado && dolar.data?.tc) setTc(formatearImporte(dolar.data.tc, "ARS", { simbolo: false }))
  }, [dolar.data, tcTocado])

  const nCantidad = parsearImporte(cantidad)
  const nCosto = parsearImporte(costo)
  const nTc = parsearImporte(tc)
  const { series, repetidas } = parsearSeries(textoSeries)

  /** Lo que falta para pasar del paso actual, en palabras. `null` si nada. */
  const falta = (() => {
    if (paso === 0) return nombre.trim() ? null : "Poné el nombre del ítem"
    if (paso === 1 && hayStock) {
      if (!nCantidad || nCantidad <= 0) return "Poné cuántas unidades hay"
      if (llevaSerie && !Number.isInteger(nCantidad)) return "Con número de serie la cantidad va en unidades enteras"
      if (nCosto === null) return "Poné el costo unitario en dólares"
      if (!nTc) return "Poné el tipo de cambio"
      if (llevaSerie && repetidas.length) return `La serie ${repetidas[0]} está repetida`
      if (llevaSerie && series.length !== nCantidad) {
        return `Hay ${formatearCantidad(nCantidad)} unidades y ${series.length} número${series.length === 1 ? "" : "s"} de serie`
      }
    }
    return null
  })()

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const r = await pedirJson<{ id: string }>(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          codigo: codigo || null,
          llevaSerie,
          notas: null,
          inicial: hayStock
            ? { fecha, cantidad: nCantidad, precioUsd: nCosto, tc: nTc, detalle: "Stock inicial", seriesNuevas: series }
            : null,
        }),
      })
      await invalidar()
      toast.success(`${nombre.trim()} quedó cargado`)
      router.push(`/admin/stock/${r.id}`)
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear el ítem"))
      setGuardando(false)
    }
  }

  const pie = (
    <>
      <span className="mr-auto text-[12px] text-ink-muted">{paso < 2 ? falta : null}</span>
      {paso === 0 ? (
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setPaso(paso - 1)} disabled={guardando}>
          Atrás
        </Button>
      )}
      {paso < 2 ? (
        <Button onClick={() => setPaso(paso + 1)} disabled={Boolean(falta)}>
          Siguiente
        </Button>
      ) : (
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Crear el ítem
        </Button>
      )}
    </>
  )

  return (
    <DialogoPasos
      abierto
      titulo="Nuevo ítem de stock"
      pasos={["El ítem", "Lo que hay hoy", "Revisar"]}
      paso={paso}
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={pie}
    >
      {paso === 0 && (
        <div className="space-y-4">
          <Campo id="nombre" rotulo="Nombre" ayuda="Como lo nombran en el depósito: «Tableta Wacom STU-540», «Cable UTP Cat6 caja 305 m».">
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Campo>
          <Campo id="codigo" rotulo="Código" opcional ayuda="El del proveedor o uno propio. Sirve para buscarlo.">
            <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="max-w-[220px]" />
          </Campo>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">¿Cada unidad tiene número de serie?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  [true, "Sí, se controla cada unidad", "Tabletas, equipos: al vender se elige cuál sale."],
                  [false, "No, sólo la cantidad", "Cables, conectores: se cuenta, no se identifica."],
                ] as const
              ).map(([valor, rotulo, ayuda]) => (
                <label
                  key={String(valor)}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-xl border px-3.5 py-3 transition-colors",
                    llevaSerie === valor ? "border-brand-400 bg-brand-50/60" : "border-line hover:bg-surface-muted"
                  )}
                >
                  <input
                    type="radio"
                    name="serie"
                    checked={llevaSerie === valor}
                    onChange={() => setLlevaSerie(valor)}
                    className="mt-1 accent-brand-600"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{rotulo}</span>
                    <span className="block text-[11.5px] text-ink-muted">{ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="space-y-4">
          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <input type="checkbox" checked={hayStock} onChange={(e) => setHayStock(e.target.checked)} className="accent-brand-600" />
            Hay unidades hoy y quiero cargar el stock inicial
          </label>

          {!hayStock ? (
            <p className="rounded-lg bg-surface-subtle px-3 py-2.5 text-[12.5px] text-ink-secondary">
              El ítem arranca en cero. Las unidades entran después, con la factura de compra.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="cantidad" rotulo="Cantidad">
                  <Input id="cantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
                </Campo>
                <Campo id="fecha" rotulo="Fecha del stock inicial">
                  <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Campo>
                <Campo id="costo" rotulo="Costo unitario (USD)" ayuda="Lo que se pagó por cada unidad, en dólares.">
                  <Input id="costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="300,00" />
                </Campo>
                <Campo
                  id="tc"
                  rotulo="Tipo de cambio"
                  ayuda={dolar.data?.tc ? "Propuesto: el dólar de esa fecha. Cambialo si se compró a otro." : "Al que se compró."}
                >
                  <Input
                    id="tc"
                    inputMode="decimal"
                    value={tc}
                    onChange={(e) => {
                      setTc(e.target.value)
                      setTcTocado(true)
                    }}
                  />
                </Campo>
              </div>

              {llevaSerie && (
                <Campo
                  id="series"
                  rotulo="Números de serie"
                  ayuda="Uno por renglón. Podés pegarlos de un Excel."
                >
                  <Textarea id="series" rows={5} value={textoSeries} onChange={(e) => setTextoSeries(e.target.value)} className="font-mono text-[12.5px]" />
                  <p
                    className={cn(
                      "mt-1 text-[11.5px]",
                      nCantidad && series.length === nCantidad ? "text-success-text" : "text-ink-muted"
                    )}
                  >
                    {series.length} de {nCantidad ? formatearCantidad(nCantidad) : "—"} cargados
                  </p>
                </Campo>
              )}
            </>
          )}
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
            <DatoRevision rotulo="Ítem">
              <span className="font-semibold">{nombre.trim()}</span>
              {codigo && <span className="ml-2 font-mono text-[12px] text-ink-muted">{codigo}</span>}
            </DatoRevision>
            <DatoRevision rotulo="Número de serie">{llevaSerie ? "Sí, por unidad" : "No, sólo cantidad"}</DatoRevision>
            {hayStock && nCantidad && nCosto !== null && nTc ? (
              <>
                <DatoRevision rotulo="Stock inicial">
                  {formatearCantidad(nCantidad)} unidades al {formatearFecha(fecha)}
                </DatoRevision>
                <DatoRevision rotulo="Costo">
                  {formatearImporte(nCosto, "USD")} c/u · TC {formatearImporte(nTc, "ARS", { simbolo: false })}
                </DatoRevision>
                <DatoRevision rotulo="Valor en dólares">{formatearImporte(nCantidad * nCosto, "USD")}</DatoRevision>
                <DatoRevision rotulo="Valor en pesos">{formatearImporte(nCantidad * nCosto * nTc)}</DatoRevision>
              </>
            ) : (
              <DatoRevision rotulo="Stock inicial">Arranca en cero</DatoRevision>
            )}
          </div>
          {hayStock && llevaSerie && (
            <div>
              <p className="eyebrow mb-1.5">Series</p>
              <div className="flex flex-wrap gap-1.5">
                {series.map((s) => (
                  <span key={s} className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[11.5px] text-ink-secondary">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-[12px] text-ink-muted">El stock no genera asientos: sólo controla cantidades.</p>
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">{error}</p>
          )}
        </div>
      )}
    </DialogoPasos>
  )
}

export function Campo({
  id,
  rotulo,
  ayuda,
  opcional,
  children,
}: {
  id: string
  rotulo: string
  ayuda?: string
  opcional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {rotulo}
        {opcional && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">opcional</span>}
      </label>
      {children}
      {ayuda && <p className="mt-1 text-[11.5px] text-ink-muted">{ayuda}</p>}
    </div>
  )
}
