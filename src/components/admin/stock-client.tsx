"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Boxes, Check, Eye, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Preguntar } from "@/components/chatbot/preguntar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { DatoRevision, DialogoPasos } from "@/components/ui/dialogo-pasos"
import { Input } from "@/components/ui/input"
import { Paginacion, usePaginado } from "@/components/ui/paginacion"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatearFecha, hoyArgentina } from "@/lib/admin/fecha"
import { formatearImporte, parsearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  DESTINO_LABEL,
  UNIDADES,
  UNIDAD_INFO,
  aDolares,
  decimalesUsd,
  formatearCantidad,
  parsearSeries,
  type Destino,
  type FichaStock,
  type ItemStock,
  type MonedaStock,
  type Unidad,
} from "@/lib/admin/stock"
import { renglon, resumen } from "@/lib/chatbot/pantalla"
import { cn } from "@/lib/utils"

/**
 * El stock: qué hay de cada cosa, cuánto costó y cuándo se movió por última vez.
 *
 * Separado en lo que se tiene para vender y lo que se tiene como material de
 * trabajo, porque se miran distinto: lo primero es mercadería, lo segundo es lo
 * que hay en el depósito para las instalaciones. Cada fila lleva a la ficha del
 * ítem, que es donde se registran las compras, las ventas, el uso en trabajos y
 * los ajustes.
 */

const URL = "/api/admin/stock"

type Filtro = "todo" | Destino

/**
 * Después de escribir, la respuesta trae la ficha ya actualizada: va directo a
 * la caché —la ficha y su fila en el listado— y la pantalla se repinta sin otro
 * pedido. El resto del administrador queda marcado como viejo, para refrescarse
 * cuando se lo vuelva a mirar, pero no se pide ahora: el stock no mueve nada de
 * lo demás (no genera asientos).
 */
export function useAplicarStock() {
  const qc = useQueryClient()
  return useCallback(
    (ficha: FichaStock | null | undefined, borradoId?: string) => {
      void qc.invalidateQueries({
        queryKey: claves.todo,
        predicate: (q) => q.queryKey[1] !== claves.cotizacion[1],
        refetchType: "none",
      })
      if (ficha) qc.setQueryData(claves.url(`${URL}/${ficha.item.id}`), ficha)
      if (borradoId) qc.removeQueries({ queryKey: claves.url(`${URL}/${borradoId}`) })
      qc.setQueryData<{ items: ItemStock[] }>(claves.url(URL), (prev) => {
        if (!prev) return prev
        let items = prev.items.filter((i) => i.id !== borradoId)
        if (ficha) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { notas, ...fila } = ficha.item
          items = items.some((i) => i.id === fila.id)
            ? items.map((i) => (i.id === fila.id ? fila : i))
            : [...items, fila].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        }
        return { items }
      })
    },
    [qc]
  )
}

/** Lo que se va a necesitar al abrir un diálogo, pedido de antemano: abren sin esperar. */
export function usePrefetchStock(urls: string[]) {
  const qc = useQueryClient()
  const clave = urls.join("|")
  useEffect(() => {
    for (const url of clave.split("|")) {
      void qc.prefetchQuery({
        queryKey: claves.url(url),
        queryFn: ({ signal }) => pedirJson(url, { signal }),
        staleTime: 5 * 60_000,
      })
    }
  }, [qc, clave])
}

export function StockClient() {
  const router = useRouter()
  const [nuevo, setNuevo] = useState(false)
  const [buscar, setBuscar] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todo")
  const [editando, setEditando] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<ItemStock | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const aplicar = useAplicarStock()
  // El dólar de hoy, para que el alta abra con el tipo de cambio ya puesto.
  usePrefetchStock([`/api/admin/stock/comprobantes?dolar=${hoyArgentina()}`])
  /** Al pasar por una fila, la ficha se trae de antemano: el clic abre al instante. */
  const anticipar = (id: string) => router.prefetch(`/admin/stock/${id}`, { kind: PrefetchKind.FULL })
  const query = useQuery({
    queryKey: claves.url(URL),
    queryFn: ({ signal }) => pedirJson<{ items: ItemStock[] }>(URL, { signal }),
  })
  const todos = useMemo(() => query.data?.items ?? [], [query.data])
  const items = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return todos.filter(
      (i) =>
        (filtro === "todo" || i.destino === filtro) &&
        (!t || i.nombre.toLowerCase().includes(t) || (i.codigo ?? "").toLowerCase().includes(t))
    )
  }, [todos, buscar, filtro])
  const paginado = usePaginado(items, 50, `${buscar}|${filtro}`)

  const valorDe = (lista: ItemStock[]) =>
    lista.reduce((s, i) => s + Math.max(i.saldo, 0) * (i.costoPromedioUsd ?? 0), 0)
  const negativos = items.filter((i) => i.saldo < 0).length
  const cuenta = (d: Destino) => todos.filter((i) => i.destino === d).length

  const borrar = async () => {
    if (!borrando) return
    setTrabajando(true)
    try {
      await pedirJson(`/api/admin/stock/${borrando.id}`, { method: "DELETE" })
      aplicar(null, borrando.id)
      toast.success(`${borrando.nombre} borrado`)
      setBorrando(null)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar"))
    } finally {
      setTrabajando(false)
    }
  }

  if (query.isPending) return <LoadingState label="Cargando el stock…" />
  if (query.isError) {
    return <ErrorState message={mensajeError(query.error, "No se pudo cargar el stock")} onRetry={() => query.refetch()} />
  }

  return (
    <div className="space-y-4">
      {todos.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Todavía no hay ítems en el stock"
          description="Empezá por dar de alta lo que hay hoy en el depósito: lo que tenés para vender y los materiales para los trabajos, con su cantidad y lo que costaron."
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
            <div role="tablist" aria-label="Qué mostrar" className="inline-flex rounded-xl border border-line bg-surface-subtle p-0.5">
              {(
                [
                  ["todo", "Todo", todos.length],
                  ["venta", "Para vender", cuenta("venta")],
                  ["material", "Materiales", cuenta("material")],
                ] as const
              ).map(([valor, rotulo, n]) => (
                <button
                  key={valor}
                  role="tab"
                  aria-selected={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    "rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    filtro === valor ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {rotulo}
                  <span className="num ml-1.5 text-[11px] text-ink-faint">{n}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full max-w-[280px]">
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
              {filtro !== "material" && (
                <div>
                  <p className="eyebrow">Para vender</p>
                  <p className="num mt-0.5 text-[16px] font-bold text-ink">
                    {formatearImporte(valorDe(items.filter((i) => i.destino === "venta")), "USD")}
                  </p>
                </div>
              )}
              {filtro !== "venta" && (
                <div>
                  <p className="eyebrow">Materiales</p>
                  <p className="num mt-0.5 text-[16px] font-bold text-ink">
                    {formatearImporte(valorDe(items.filter((i) => i.destino === "material")), "USD")}
                  </p>
                </div>
              )}
              {negativos > 0 && (
                <p className="flex items-center gap-1.5 text-[12px] text-danger-text">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {negativos} ítem{negativos === 1 ? "" : "s"} con saldo negativo: falta cargar alguna compra
                </p>
              )}
              <Preguntar
                agente="finanzas"
                className="ml-auto"
                pantalla={() => ({
                  titulo: `Administración · Stock${filtro === "todo" ? "" : ` · ${DESTINO_LABEL[filtro]}`}`,
                  texto: textoStock(items, buscar),
                })}
                pregunta="¿Cómo está el stock? ¿Qué está parado, qué tiene saldo raro y dónde hay plata inmovilizada?"
                ayuda="Le pasa los valores, los ítems con saldo negativo o sin costo y los que más pesan."
                seguimientos={SEGUIMIENTOS}
              />
            </div>
            {items.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                {buscar ? "Nada con esa búsqueda." : `No hay ítems ${filtro === "venta" ? "para vender" : "de material"} todavía.`}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ítem</TableHead>
                    <TableHead className="text-right">Hay</TableHead>
                    <TableHead className="text-right">Costo promedio</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Último movimiento</TableHead>
                    <TableHead className="w-[108px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginado.visibles.map((i) => (
                    <TableRow
                      key={i.id}
                      onClick={() => router.push(`/admin/stock/${i.id}`)}
                      onMouseEnter={() => anticipar(i.id)}
                      onFocus={() => anticipar(i.id)}
                      className="group cursor-pointer"
                    >
                      <TableCell>
                        <p className="text-[13px] font-medium text-ink group-hover:text-brand-700 group-hover:underline">{i.nombre}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
                          {i.codigo && <span className="font-mono">{i.codigo}</span>}
                          {filtro === "todo" && (
                            <Badge tone={i.destino === "venta" ? "brand" : "neutral"} size="sm">
                              {i.destino === "venta" ? "Para vender" : "Material"}
                            </Badge>
                          )}
                          {i.llevaSerie && (
                            <Badge tone="neutral" size="sm">
                              Con N° de serie
                            </Badge>
                          )}
                        </p>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "num whitespace-nowrap text-right text-[14px] font-semibold",
                          i.saldo < 0 ? "text-danger-text" : "text-ink"
                        )}
                      >
                        {formatearCantidad(i.saldo, i.unidad)}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right text-ink-secondary">
                        {i.costoPromedioUsd === null ? (
                          "—"
                        ) : (
                          <>
                            {formatearImporte(i.costoPromedioUsd, "USD", { decimales: decimalesUsd(i.costoPromedioUsd) })}
                            <span className="text-[11px] text-ink-faint"> / {UNIDAD_INFO[i.unidad].uno}</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="num text-right text-ink-secondary">
                        {i.costoPromedioUsd === null || i.saldo <= 0
                          ? "—"
                          : formatearImporte(i.saldo * i.costoPromedioUsd, "USD")}
                      </TableCell>
                      <TableCell className="num text-ink-muted">
                        {i.ultimoMovimiento ? formatearFecha(i.ultimoMovimiento) : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => router.push(`/admin/stock/${i.id}`)}
                            aria-label="Ver ficha"
                            title="Ver la ficha: movimientos, compras y ventas"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditando(i.id)}
                            aria-label="Editar"
                            title="Editar el ítem"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setBorrando(i)}
                            aria-label="Borrar"
                            title="Borrar el ítem"
                            className="text-ink-faint hover:bg-danger-soft hover:text-danger-text"
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
            {paginado.hayMasDeUna && (
              <Paginacion
                pagina={paginado.pagina}
                totalPaginas={paginado.totalPaginas}
                total={paginado.total}
                porPagina={paginado.porPagina}
                onIr={paginado.irA}
              />
            )}
          </div>
        </>
      )}

      {nuevo && <NuevoItem destinoInicial={filtro === "todo" ? null : filtro} onCerrar={() => setNuevo(false)} />}
      {editando && <EditarItem id={editando} onCerrar={() => setEditando(null)} />}

      <ConfirmarDialog
        abierto={Boolean(borrando)}
        titulo={`¿Borrar ${borrando?.nombre ?? "el ítem"}?`}
        descripcion={
          borrando &&
          (borrando.entradas + borrando.salidas > 0 || borrando.ultimoMovimiento
            ? "Se borra con todos sus movimientos y números de serie. Las facturas no se tocan. No se puede deshacer."
            : "No tiene movimientos. No se puede deshacer.")
        }
        confirmar="Borrar"
        trabajando={trabajando}
        onCerrar={() => setBorrando(null)}
        onConfirmar={borrar}
      />
    </div>
  )
}

/* ── Piezas que comparten el alta y la ficha ─────────────────────────────── */

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

/** Tarjetas para elegir una opción entre pocas, con una línea de ayuda cada una. */
export function Opciones<T extends string | boolean>({
  nombre,
  valor,
  onCambio,
  opciones,
}: {
  nombre: string
  valor: T | null
  onCambio: (v: T) => void
  opciones: readonly (readonly [T, string, string])[]
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {opciones.map(([v, rotulo, ayuda]) => (
        <label
          key={String(v)}
          className={cn(
            "flex cursor-pointer gap-2.5 rounded-xl border px-3.5 py-3 transition-colors",
            valor === v ? "border-brand-400 bg-brand-50/60" : "border-line hover:bg-surface-muted"
          )}
        >
          <input
            type="radio"
            name={nombre}
            checked={valor === v}
            onChange={() => onCambio(v)}
            className="mt-1 accent-brand-600"
          />
          <span>
            <span className="block text-[13px] font-medium text-ink">{rotulo}</span>
            <span className="block text-[11.5px] text-ink-muted">{ayuda}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export type DatosDelItem = {
  nombre: string
  codigo: string
  notas: string
  destino: Destino | null
  unidad: Unidad
  llevaSerie: boolean
}

/** Lo que falta en los datos del ítem, en palabras. `null` si nada. */
export function faltaEnItem(d: DatosDelItem): string | null {
  if (!d.nombre.trim()) return "Poné el nombre del ítem"
  if (!d.destino) return "Elegí si es para vender o material de trabajo"
  return null
}

/**
 * Nombre, código, para qué es, en qué se mide y si lleva número de serie. El
 * número de serie sólo se pregunta si se cuenta por unidades: un metro de cable
 * no tiene serie.
 *
 * Arriba, un buscador del catálogo de Distecna que completa nombre, código y
 * descripción. El precio no: el de Distecna no es lo que pagó Accedra.
 */
export function CamposDelItem({
  datos,
  onCambio,
  serieBloqueada,
}: {
  datos: DatosDelItem
  onCambio: (d: DatosDelItem) => void
  /** En la edición, si ya hay series cargadas. */
  serieBloqueada?: boolean
}) {
  const set = (p: Partial<DatosDelItem>) => onCambio({ ...datos, ...p })
  return (
    <div className="space-y-4">
      <BuscarEnCatalogo
        onElegir={(p) =>
          set({
            nombre: p.nombre,
            codigo: p.codigo,
            notas: p.descripcion && p.descripcion !== p.nombre ? p.descripcion : datos.notas,
          })
        }
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Campo id="nombre" rotulo="Nombre" ayuda="Como lo nombran en el depósito: «Tableta Wacom STU-540», «Cable UTP Cat6».">
          <Input id="nombre" value={datos.nombre} onChange={(e) => set({ nombre: e.target.value })} />
        </Campo>
        <Campo id="codigo" rotulo="Código" opcional ayuda="El del proveedor o uno propio.">
          <Input id="codigo" value={datos.codigo} onChange={(e) => set({ codigo: e.target.value })} />
        </Campo>
      </div>
      <Campo id="notas" rotulo="Descripción" opcional>
        <Textarea id="notas" rows={2} value={datos.notas} onChange={(e) => set({ notas: e.target.value })} />
      </Campo>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink">¿Para qué lo tienen?</p>
        <Opciones<Destino>
          nombre="destino"
          valor={datos.destino}
          onCambio={(destino) => set({ destino })}
          opciones={[
            ["venta", DESTINO_LABEL.venta, "Mercadería: sale con una factura de venta."],
            ["material", DESTINO_LABEL.material, "Se usa en las instalaciones: sale cuando se usa en un trabajo."],
          ]}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink">¿En qué se mide?</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Unidad de medida">
          {UNIDADES.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={datos.unidad === u}
              disabled={serieBloqueada && datos.llevaSerie && u !== "unidad"}
              onClick={() => set({ unidad: u, llevaSerie: u === "unidad" ? datos.llevaSerie : false })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12.5px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                datos.unidad === u
                  ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                  : "border-line text-ink-secondary hover:bg-surface-muted"
              )}
            >
              {UNIDAD_INFO[u].varios}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          {UNIDAD_INFO[datos.unidad].fraccion
            ? `Admite decimales: 2,5 ${UNIDAD_INFO[datos.unidad].varios}.`
            : `Se cuenta sin decimales: 3 ${UNIDAD_INFO[datos.unidad].varios}.`}
        </p>
      </div>

      {datos.unidad === "unidad" && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink">¿Cada unidad tiene número de serie?</p>
          {serieBloqueada ? (
            <p className="text-[12.5px] text-ink-secondary">
              {datos.llevaSerie ? "Sí" : "No"}. No se puede cambiar: ya hay números de serie cargados.
            </p>
          ) : (
            <Opciones<boolean>
              nombre="serie"
              valor={datos.llevaSerie}
              onCambio={(llevaSerie) => set({ llevaSerie })}
              opciones={[
                [true, "Sí, se controla cada unidad", "Tabletas, equipos: al sacarlas se elige cuál sale."],
                [false, "No, sólo la cantidad", "Conectores, insumos: se cuenta, no se identifica."],
              ]}
            />
          )}
        </div>
      )}
    </div>
  )
}

type ProductoCatalogo = { codigo: string; nombre: string; marca: string | null; descripcion: string | null }

/** Buscar un producto de Distecna y traer sus datos al ítem. */
function BuscarEnCatalogo({ onElegir }: { onElegir: (p: ProductoCatalogo) => void }) {
  const [q, setQ] = useState("")
  const [diferido, setDiferido] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState<ProductoCatalogo | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDiferido(q), 180)
    return () => clearTimeout(t)
  }, [q])
  const url = `/api/admin/stock/catalogo?${new URLSearchParams({ q: diferido.trim().toLowerCase() })}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ productos: ProductoCatalogo[] }>(url, { signal }),
    enabled: diferido.trim().length >= 2,
    staleTime: 5 * 60_000,
    // Mientras llega la búsqueda nueva se siguen viendo los resultados de la
    // anterior, en vez de un "Buscando…" en cada letra.
    placeholderData: keepPreviousData,
  })
  const lista = query.data?.productos ?? []

  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-subtle px-3.5 py-3">
      <p className="text-[13px] font-medium text-ink">
        Traerlo del catálogo de Distecna
        <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">opcional</span>
      </p>
      <p className="mb-2 text-[11.5px] text-ink-muted">
        Si está, buscalo y se completan solos el nombre, el código y la descripción. Si no, cargalo a mano abajo. El
        costo lo ponés vos después.
      </p>
      {elegido ? (
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <Check className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{elegido.nombre}</span>
            <span className="block font-mono text-[11px] text-ink-muted">{elegido.codigo}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setElegido(null)}>
            Buscar otro
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAbierto(true)
            }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            placeholder="Wacom One, STU-540, cable UTP…"
            className="bg-surface pl-8"
            aria-label="Buscar en el catálogo de Distecna"
            autoFocus
          />
          {abierto && diferido.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-[260px] overflow-y-auto rounded-xl border border-line bg-surface shadow-e2">
              {query.isPending && !query.data ? (
                <p className="px-3.5 py-3 text-[12.5px] text-ink-muted">Buscando…</p>
              ) : lista.length === 0 ? (
                <p className="px-3.5 py-3 text-[12.5px] text-ink-muted">No está en el catálogo. Cargalo a mano abajo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {lista.map((p) => (
                    <li key={p.codigo}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setElegido(p)
                          setAbierto(false)
                          onElegir(p)
                        }}
                        className="block w-full px-3.5 py-2 text-left hover:bg-surface-muted"
                      >
                        <span className="block truncate text-[13px] text-ink">{p.nombre}</span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          <span className="font-mono">{p.codigo}</span>
                          {p.marca && ` · ${p.marca}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * El precio unitario con su moneda: se elige si se pagó en dólares o en pesos,
 * y abajo se ve lo mismo en la otra moneda. El stock se valoriza en dólares, así
 * que un precio en pesos se pasa al tipo de cambio que se ponga al lado.
 */
export function PrecioConMoneda({
  id,
  rotulo,
  unidad,
  moneda,
  onMoneda,
  precio,
  onPrecio,
  tc,
  opcional,
  ayudaTc,
  onTc,
}: {
  id: string
  rotulo: string
  unidad: Unidad
  moneda: MonedaStock
  onMoneda: (m: MonedaStock) => void
  precio: string
  onPrecio: (v: string) => void
  tc: string
  opcional?: boolean
  ayudaTc?: string
  onTc: (v: string) => void
}) {
  const nPrecio = parsearImporte(precio)
  const nTc = parsearImporte(tc)
  const otra =
    nPrecio !== null && nTc
      ? moneda === "USD"
        ? formatearImporte(nPrecio * nTc)
        : (() => {
            const usd = aDolares(nPrecio, "ARS", nTc)
            return formatearImporte(usd, "USD", { decimales: decimalesUsd(usd) })
          })()
      : null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
          {rotulo} <span className="font-normal text-ink-muted">por {UNIDAD_INFO[unidad].uno}</span>
          {opcional && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">opcional</span>}
        </label>
        <div className="flex gap-1.5">
          <div role="radiogroup" aria-label="Moneda" className="inline-flex shrink-0 rounded-lg border border-line bg-surface-subtle p-0.5">
            {(["USD", "ARS"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={moneda === m}
                onClick={() => onMoneda(m)}
                className={cn(
                  "rounded-md px-2.5 text-[12px] font-medium transition-colors",
                  moneda === m ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink"
                )}
              >
                {m === "USD" ? "USD" : "Pesos"}
              </button>
            ))}
          </div>
          <Input id={id} inputMode="decimal" value={precio} onChange={(e) => onPrecio(e.target.value)} placeholder={moneda === "USD" ? "300,00" : "450.000,00"} />
        </div>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          {otra ? `Equivale a ${otra} por ${UNIDAD_INFO[unidad].uno}.` : moneda === "USD" ? "En dólares." : "En pesos: se pasa a dólares al tipo de cambio."}
        </p>
      </div>
      <Campo id={`${id}-tc`} rotulo="Tipo de cambio" opcional={opcional} ayuda={ayudaTc}>
        <Input id={`${id}-tc`} inputMode="decimal" value={tc} onChange={(e) => onTc(e.target.value)} />
      </Campo>
    </div>
  )
}

/**
 * Un casillero por unidad que entra, numerado: «Unidad 1», «Unidad 2»… Enter
 * pasa al siguiente (como con un lector de código de barras), y si se pega una
 * lista —de un Excel, de un remito— se reparte sola desde ese casillero hacia
 * abajo. Las repetidas se marcan en rojo, acá mismo y no al final.
 *
 * `series` siempre tiene tantos lugares como unidades; los vacíos son "".
 */
export function CargarSeries({
  cantidad,
  series,
  onCambio,
  yaCargadas = [],
}: {
  cantidad: number
  series: string[]
  onCambio: (s: string[]) => void
  /** Las que ya están en el ítem, para avisar antes de guardar. */
  yaCargadas?: string[]
}) {
  const lugares = Array.from({ length: cantidad }, (_, i) => series[i] ?? "")
  const conteo = new Map<string, number>()
  for (const s of lugares) if (s.trim()) conteo.set(s.trim().toLowerCase(), (conteo.get(s.trim().toLowerCase()) ?? 0) + 1)
  const existentes = new Set(yaCargadas.map((s) => s.toLowerCase()))
  const problema = (s: string) => {
    const k = s.trim().toLowerCase()
    if (!k) return null
    if ((conteo.get(k) ?? 0) > 1) return "Repetida"
    if (existentes.has(k)) return "Ya está cargada"
    return null
  }
  const cargadas = lugares.filter((s) => s.trim()).length

  const poner = (desde: number, valores: string[]) => {
    const nuevas = [...lugares]
    valores.forEach((v, j) => {
      if (desde + j < cantidad) nuevas[desde + j] = v
    })
    onCambio(nuevas)
  }
  const enfocar = (i: number) => document.getElementById(`serie-${i}`)?.focus()

  if (cantidad <= 0) {
    return <p className="text-[12.5px] text-ink-muted">Poné primero la cantidad: aparece un casillero por unidad.</p>
  }

  return (
    <div className="rounded-xl border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-surface-subtle px-3.5 py-2.5">
        <p className="text-[13px] font-medium text-ink">Número de serie de cada unidad</p>
        <p className={cn("num text-[12px] font-medium", cargadas === cantidad ? "text-success-text" : "text-ink-muted")}>
          {cargadas} de {cantidad} cargados
        </p>
        <p className="w-full text-[11.5px] text-ink-muted">
          Está en la etiqueta del equipo o en la caja. Escribilo y apretá Enter para pasar al siguiente. Si los tenés en
          un Excel, copiá la columna y pegala en el primero: se completan todos.
        </p>
      </div>
      <ol className="grid max-h-[280px] gap-x-4 gap-y-2 overflow-y-auto p-3.5 sm:grid-cols-2">
        {lugares.map((s, i) => {
          const p = problema(s)
          return (
            <li key={i} className="flex items-center gap-2">
              <label htmlFor={`serie-${i}`} className="num w-[64px] shrink-0 text-[11.5px] text-ink-muted">
                Unidad {i + 1}
              </label>
              <div className="min-w-0 flex-1">
                <Input
                  id={`serie-${i}`}
                  value={s}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(p)}
                  onChange={(e) => poner(i, [e.target.value])}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      enfocar(i + 1)
                    }
                  }}
                  onPaste={(e) => {
                    const { series: pegadas } = parsearSeries(e.clipboardData.getData("text"))
                    if (pegadas.length > 1) {
                      e.preventDefault()
                      poner(i, pegadas)
                      enfocar(Math.min(i + pegadas.length, cantidad - 1))
                      if (i + pegadas.length > cantidad) {
                        toast.warning(`Pegaste ${pegadas.length} y quedaban ${cantidad - i} lugares: sobraron ${i + pegadas.length - cantidad}.`)
                      }
                    }
                  }}
                  className={cn("h-8 font-mono text-[12.5px]", p && "border-danger-line bg-danger-soft/50")}
                />
                {p && <p className="mt-0.5 text-[11px] text-danger-text">{p}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Lo que falta en las series de una entrada, en palabras. `null` si nada. */
export function faltaEnSeries(series: string[], cantidad: number, yaCargadas: string[] = []): string | null {
  const llenas = series.slice(0, cantidad).map((s) => s.trim()).filter(Boolean)
  const vistas = new Set<string>()
  const repetida = llenas.find((s) => vistas.size === vistas.add(s.toLowerCase()).size)
  if (repetida) return `La serie ${repetida} está dos veces`
  const ya = new Set(yaCargadas.map((s) => s.toLowerCase()))
  const vieja = llenas.find((s) => ya.has(s.toLowerCase()))
  if (vieja) return `La serie ${vieja} ya está cargada en este ítem`
  if (llenas.length < cantidad) {
    const faltan = cantidad - llenas.length
    return `Falta${faltan === 1 ? "" : "n"} ${faltan} número${faltan === 1 ? "" : "s"} de serie`
  }
  return null
}

/** El tipo de cambio propuesto (el dólar de la fecha) mientras no se escriba uno a mano. */
export function useTcPropuesto(propuesto: number | null | undefined) {
  const [tc, setTc] = useState("")
  const [tocado, setTocado] = useState(false)
  useEffect(() => {
    if (!tocado && propuesto) setTc(formatearImporte(propuesto, "ARS", { simbolo: false }))
  }, [propuesto, tocado])
  return {
    tc,
    setTc: (v: string) => {
      setTc(v)
      setTocado(true)
    },
  }
}

/* ── Editar y borrar un ítem ──────────────────────────────────────────────── */

/** Corregir los datos del ítem. Se usa desde el listado y desde la ficha. */
export function EditarItem({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const router = useRouter()
  const aplicar = useAplicarStock()
  const url = `/api/admin/stock/${id}`
  const ficha = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<FichaStock>(url, { signal }),
  })
  const [datos, setDatos] = useState<DatosDelItem | null>(null)
  useEffect(() => {
    const i = ficha.data?.item
    if (i && !datos) {
      setDatos({
        nombre: i.nombre,
        codigo: i.codigo ?? "",
        notas: i.notas ?? "",
        destino: i.destino,
        unidad: i.unidad,
        llevaSerie: i.llevaSerie,
      })
    }
  }, [ficha.data, datos])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const falta = datos ? faltaEnItem(datos) : null

  const guardar = async () => {
    if (!datos) return
    setGuardando(true)
    setError(null)
    try {
      const r = await pedirJson<{ ficha: FichaStock | null }>(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...datos,
          codigo: datos.codigo || null,
          llevaSerie: datos.unidad === "unidad" && datos.llevaSerie,
          notas: datos.notas || null,
        }),
      })
      aplicar(r.ficha)
      // El encabezado de la ficha (nombre, para qué es) se arma en el servidor.
      router.refresh()
      toast.success("Ítem actualizado")
      onCerrar()
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"))
      setGuardando(false)
    }
  }

  return (
    <DialogoPasos
      abierto
      ancho="lg"
      titulo={`Editar · ${ficha.data?.item.nombre ?? "ítem"}`}
      pasos={["Datos del ítem"]}
      paso={0}
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={
        <>
          <span className="mr-auto text-[12px] text-ink-muted">{falta}</span>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !datos || Boolean(falta)}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </>
      }
    >
      {ficha.isError ? (
        <ErrorState message={mensajeError(ficha.error, "No se pudo cargar el ítem")} onRetry={() => ficha.refetch()} />
      ) : !datos ? (
        <LoadingState label="Cargando el ítem…" />
      ) : (
        <div className="space-y-4">
          <CamposDelItem datos={datos} onCambio={setDatos} serieBloqueada={(ficha.data?.series.length ?? 0) > 0} />
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">{error}</p>
          )}
        </div>
      )}
    </DialogoPasos>
  )
}

/* ── Alta guiada ──────────────────────────────────────────────────────────── */

function NuevoItem({ destinoInicial, onCerrar }: { destinoInicial: Destino | null; onCerrar: () => void }) {
  const router = useRouter()
  const aplicar = useAplicarStock()
  const [paso, setPaso] = useState(0)
  const [datos, setDatos] = useState<DatosDelItem>({
    nombre: "",
    codigo: "",
    notas: "",
    destino: destinoInicial,
    unidad: "unidad",
    llevaSerie: false,
  })
  const [hayStock, setHayStock] = useState(true)
  const [cantidad, setCantidad] = useState("")
  const [moneda, setMoneda] = useState<MonedaStock>("USD")
  const [costo, setCosto] = useState("")
  const [fecha, setFecha] = useState(hoyArgentina())
  const [series, setSeries] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const dolar = useDolarDe(fecha)
  const { tc, setTc } = useTcPropuesto(dolar.data?.tc)

  const u = UNIDAD_INFO[datos.unidad]
  const llevaSerie = datos.unidad === "unidad" && datos.llevaSerie
  const nCantidad = parsearImporte(cantidad)
  const nCosto = parsearImporte(costo)
  const nTc = parsearImporte(tc)
  const cantidadSeries = nCantidad && Number.isInteger(nCantidad) && nCantidad <= 500 ? nCantidad : 0
  const seriesLlenas = series.slice(0, cantidadSeries).map((s) => s.trim())
  const usd = nCosto !== null && nTc ? aDolares(nCosto, moneda, nTc) : null

  /** Lo que falta para pasar del paso actual, en palabras. `null` si nada. */
  const falta = (() => {
    if (paso === 0) return faltaEnItem(datos)
    if (paso === 1 && hayStock) {
      if (!nCantidad || nCantidad <= 0) return `Poné cuántos ${u.varios} hay`
      if (!u.fraccion && !Number.isInteger(nCantidad)) return `En ${u.varios} va sin decimales`
      if (nCosto === null) return "Poné lo que costó cada uno"
      if (!nTc) return "Poné el tipo de cambio"
      if (llevaSerie && nCantidad > 500) return "Con número de serie, de a 500 unidades como máximo"
      if (llevaSerie) return faltaEnSeries(series, nCantidad)
    }
    return null
  })()

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const r = await pedirJson<{ id: string; ficha: FichaStock | null }>(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: datos.nombre,
          codigo: datos.codigo || null,
          destino: datos.destino,
          unidad: datos.unidad,
          llevaSerie,
          notas: datos.notas || null,
          inicial: hayStock
            ? { fecha, cantidad: nCantidad, moneda, precio: nCosto, tc: nTc, detalle: "Stock inicial", seriesNuevas: llevaSerie ? seriesLlenas : [] }
            : null,
        }),
      })
      aplicar(r.ficha)
      toast.success(`${datos.nombre.trim()} quedó cargado`)
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
      ancho="lg"
      titulo="Nuevo ítem de stock"
      pasos={["El ítem", "Lo que hay hoy", "Revisar"]}
      paso={paso}
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={pie}
    >
      {paso === 0 && <CamposDelItem datos={datos} onCambio={setDatos} />}

      {paso === 1 && (
        <div className="space-y-4">
          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <input type="checkbox" checked={hayStock} onChange={(e) => setHayStock(e.target.checked)} className="accent-brand-600" />
            Hoy hay {u.varios} en el depósito y quiero cargar cuántos
          </label>

          {!hayStock ? (
            <p className="rounded-lg bg-surface-subtle px-3 py-2.5 text-[12.5px] text-ink-secondary">
              El ítem arranca en cero. Lo que entre después se carga con la factura de compra.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="cantidad" rotulo={`Cantidad (${u.varios})`}>
                  <Input id="cantidad" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
                </Campo>
                <Campo id="fecha" rotulo="Al día">
                  <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Campo>
              </div>
              <PrecioConMoneda
                id="costo"
                rotulo="Costo"
                unidad={datos.unidad}
                moneda={moneda}
                onMoneda={setMoneda}
                precio={costo}
                onPrecio={setCosto}
                tc={tc}
                onTc={setTc}
                ayudaTc={dolar.data?.tc ? "Propuesto: el dólar de esa fecha. Cambialo si se compró a otro." : "Al que se compró."}
              />

              {llevaSerie && <CargarSeries cantidad={cantidadSeries} series={series} onCambio={setSeries} />}
            </>
          )}
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
            <DatoRevision rotulo="Ítem">
              <span className="font-semibold">{datos.nombre.trim()}</span>
              {datos.codigo && <span className="ml-2 font-mono text-[12px] text-ink-muted">{datos.codigo}</span>}
            </DatoRevision>
            <DatoRevision rotulo="Para">{datos.destino && DESTINO_LABEL[datos.destino]}</DatoRevision>
            <DatoRevision rotulo="Se mide en">
              {u.varios}
              {llevaSerie ? ", con número de serie cada una" : ""}
            </DatoRevision>
            {hayStock && nCantidad && nCosto !== null && nTc && usd !== null ? (
              <>
                <DatoRevision rotulo="Hay hoy">
                  {formatearCantidad(nCantidad, datos.unidad, true)} al {formatearFecha(fecha)}
                </DatoRevision>
                <DatoRevision rotulo="Costo">
                  {formatearImporte(nCosto, moneda)} por {u.uno} · TC {formatearImporte(nTc, "ARS", { simbolo: false })}
                </DatoRevision>
                <DatoRevision rotulo="Valor">
                  {formatearImporte(nCantidad * usd, "USD")} · {formatearImporte(moneda === "ARS" ? nCantidad * nCosto : nCantidad * nCosto * nTc)}
                </DatoRevision>
              </>
            ) : (
              <DatoRevision rotulo="Hay hoy">Arranca en cero</DatoRevision>
            )}
          </div>
          {hayStock && llevaSerie && (
            <div>
              <p className="eyebrow mb-1.5">Números de serie</p>
              <div className="flex flex-wrap gap-1.5">
                {seriesLlenas.map((s) => (
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

/* ── Para el chat ─────────────────────────────────────────────────────────── */

const SEGUIMIENTOS = [
  { emoji: "🧮", corto: "¿Qué ajusto?", texto: "¿Qué ítems revisarías con un conteo físico o un ajuste antes que nada, y por qué?" },
  { emoji: "🐢", corto: "Lo que no rota", texto: "De lo que está parado hace tiempo, ¿qué conviene liquidar, usar en trabajos o dejar como está?" },
  { emoji: "🛒", corto: "¿Qué compro?", texto: "¿Hay algo para vender que se está por agotar y convendría reponer?" },
]

/**
 * El stock en texto, para el chat: lo que se ve con el filtro puesto. Son
 * productos y materiales, no fichas de clientes ni proveedores.
 */
function textoStock(items: ItemStock[], buscar: string): string {
  const usd = (n: number) => formatearImporte(n, "USD")
  const valor = (i: ItemStock) => Math.max(i.saldo, 0) * (i.costoPromedioUsd ?? 0)
  const hoy = Date.parse(hoyArgentina())
  const parado = (i: ItemStock) =>
    i.saldo > 0 && (!i.ultimoMovimiento || hoy - Date.parse(i.ultimoMovimiento.slice(0, 10)) > 90 * 86_400_000)
  const linea = (i: ItemStock) =>
    `${i.nombre}: hay ${formatearCantidad(i.saldo, i.unidad)}${i.costoPromedioUsd !== null ? ` · ${usd(valor(i))}` : " · sin costo"}${
      i.ultimoMovimiento ? ` · último movimiento ${i.ultimoMovimiento.slice(0, 10)}` : ""
    }`

  const total = (d: Destino) => items.filter((i) => i.destino === d).reduce((a, i) => a + valor(i), 0)
  const negativos = items.filter((i) => i.saldo < 0)
  const sinCosto = items.filter((i) => i.saldo > 0 && i.costoPromedioUsd === null)
  const sinStock = items.filter((i) => i.saldo === 0 && i.destino === "venta" && i.activo)
  const parados = items.filter(parado).sort((a, b) => valor(b) - valor(a))
  const mayores = [...items].sort((a, b) => valor(b) - valor(a)).slice(0, 10)

  return resumen(
    buscar.trim() && renglon("Búsqueda", buscar.trim()),
    renglon("Ítems", items.length),
    renglon("Valor para vender", usd(total("venta"))),
    renglon("Valor de materiales", usd(total("material"))),
    "Valuado a costo promedio de compra, en dólares.",
    "",
    `## Saldo negativo (${negativos.length})`,
    negativos.slice(0, 10).map(linea),
    `## Con existencias y sin costo (${sinCosto.length})`,
    sinCosto.slice(0, 10).map(linea),
    `## Para vender y agotados (${sinStock.length})`,
    sinStock.slice(0, 10).map((i) => i.nombre),
    `## Sin movimiento hace más de 90 días (${parados.length}, ${usd(parados.reduce((a, i) => a + valor(i), 0))})`,
    parados.slice(0, 10).map(linea),
    "",
    "## Los que más valen",
    mayores.map(linea)
  )
}
