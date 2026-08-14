"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Ban,
  Eye,
  FileInput,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { EntidadDialog, type BorradorCliente } from "@/components/admin/entidad-dialog"
import { ConfirmarDialog } from "@/components/admin/confirmar-dialog"
import { FichaDetalle } from "@/components/admin/ficha-detalle"
import { LecturaFichaDialog } from "@/components/admin/lectura-ficha-dialog"
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
import { formatearCuit } from "@/lib/admin/cuit"
import { RESUMEN_VACIO, type EntidadConResumen } from "@/lib/admin/detalle"
import {
  type CategoriaEntidad,
  type Cliente,
  type TipoEntidad,
  type Vendedor,
} from "@/lib/admin/entidades"
import { formatearImporte } from "@/lib/admin/moneda"
import { useTablaAdmin } from "@/lib/admin/use-tabla"
import { cn } from "@/lib/utils"

type Estado = "activos" | "todos" | "inactivos"

const ESTADOS: { valor: Estado; etiqueta: string }[] = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "inactivos", etiqueta: "Dados de baja" },
  { valor: "todos", etiqueta: "Todos" },
]

/**
 * El listado de clientes.
 *
 * La tabla pagina contra el servidor (ver `useTablaAdmin`), así que lo que se ve
 * es una ventana sobre el total y no un `slice` de algo que ya estaba en
 * memoria. Eso cambia dos cosas del comportamiento respecto de la tabla de
 * productos: la búsqueda tiene debounce porque cada tecleo es un pedido, y
 * mientras carga la tabla se atenúa en lugar de vaciarse — un salto a esqueleto
 * en cada búsqueda parpadea tanto que marea.
 *
 * **Qué columnas hay y por qué.** La versión anterior mostraba la ficha entera
 * —condición de IVA, provincia, domicilio— y ninguna de esas columnas cambia lo
 * que alguien hace después de leerlas: son datos que se consultan al facturar,
 * de a uno, no escaneando una lista. Lo que sí se escanea es la plata, así que
 * ahora las dos columnas del medio son cuánto debe y cuánto de eso está vencido.
 * El resto de la ficha está a un click, en el panel de detalle.
 */
export function EntidadesClient({ tipo }: { tipo: TipoEntidad }) {
  const esProveedor = tipo === "proveedor"
  const recurso = esProveedor ? "proveedores" : "clientes"
  const rotulo = esProveedor ? "proveedor" : "cliente"
  const rotuloPlural = esProveedor ? "proveedores" : "clientes"

  const [estado, setEstado] = useState<Estado>("activos")
  const [categoriaId, setCategoriaId] = useState("")
  const [conDeuda, setConDeuda] = useState(false)
  const [categorias, setCategorias] = useState<CategoriaEntidad[]>([])

  const filtros = useMemo(
    () => ({
      estado,
      categoriaId: categoriaId || undefined,
      conDeuda: conDeuda ? "1" : undefined,
    }),
    [estado, categoriaId, conDeuda]
  )

  const tabla = useTablaAdmin<EntidadConResumen>({
    endpoint: `/api/admin/${recurso}`,
    clave: recurso,
    filtros,
  })

  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [dialogo, setDialogo] = useState<{ abierto: boolean; cliente: Cliente | null }>({
    abierto: false,
    cliente: null,
  })
  const [verId, setVerId] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<Partial<BorradorCliente> | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aEliminar, setAEliminar] = useState<Cliente | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const cargarVendedores = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vendedores")
      const data = await res.json()
      if (res.ok) setVendedores(data.vendedores ?? [])
    } catch {
      // La ficha funciona igual sin la lista: el campo es texto libre y el
      // autocompletado es una ayuda, no un requisito.
    }
  }, [])

  useEffect(() => {
    cargarVendedores()
  }, [cargarVendedores])

  useEffect(() => {
    fetch(`/api/admin/categorias?tipo=${esProveedor ? "proveedor" : "cliente"}`)
      .then((r) => r.json())
      .then((d) => setCategorias(d.categorias ?? []))
      .catch(() => setCategorias([]))
  }, [esProveedor])

  const { recargar } = tabla

  const alGuardar = useCallback(
    (c: Cliente, esNuevo: boolean) => {
      setDialogo({ abierto: false, cliente: null })
      setBorrador(null)
      toast.success(esNuevo ? `${c.razonSocial} dado de alta` : "Cambios guardados")
      recargar()
      cargarVendedores()
    },
    [recargar, cargarVendedores]
  )

  /** Baja y alta lógicas. No hay borrado: un cliente con facturas es historia
   *  contable, y darlo de baja lo saca de los selectores sin perder nada. */
  const cambiarEstado = async (c: Cliente, activo: boolean) => {
    setOcupado(c.id)
    try {
      const res = await fetch(`/api/admin/${recurso}/${c.id}`, {
        method: activo ? "PATCH" : "DELETE",
        headers: { "content-type": "application/json" },
        ...(activo ? { body: JSON.stringify({ ...aBody(c), activo: true }) } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar")
      toast.success(activo ? `${c.razonSocial} reactivado` : `${c.razonSocial} dado de baja`)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar")
    } finally {
      setOcupado(null)
    }
  }

  /** Borrado definitivo. Para el error de carga —la ficha duplicada, la prueba—,
   *  no para el cliente que dejó de operar: para eso está la baja. */
  const eliminar = async () => {
    if (!aEliminar) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/admin/${recurso}/${aEliminar.id}?modo=eliminar`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar")
      toast.success(`${aEliminar.razonSocial} eliminado`)
      setAEliminar(null)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    } finally {
      setEliminando(false)
    }
  }

  return (
    <>
      <div className="panel overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-line bg-surface-subtle px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={tabla.busqueda}
              onChange={(e) => tabla.setBusqueda(e.target.value)}
              placeholder="Buscar por razón social, CUIT, email…"
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
            {ESTADOS.map((e) => (
              <button
                key={e.valor}
                onClick={() => setEstado(e.valor)}
                aria-pressed={estado === e.valor}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  estado === e.valor
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {e.etiqueta}
              </button>
            ))}
          </div>

          {/* El filtro que convierte el listado en algo que contesta preguntas:
              "¿quiénes son mis proveedores de networking?" en vez de recorrer
              nombres a ojo. */}
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            aria-label="Filtrar por categoría"
            className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-ink"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
            <option value="sin">— Sin categoría —</option>
          </select>

          <button
            onClick={() => setConDeuda((v) => !v)}
            aria-pressed={conDeuda}
            className={cn(
              "h-9 rounded-lg border px-3 text-[11.5px] font-medium transition-colors",
              conDeuda
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
            )}
          >
            {esProveedor ? "Con deuda" : "Que deben"}
          </button>

          <div className="flex items-center gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setLeyendo(true)}>
              <FileInput className="h-3.5 w-3.5" />
              Carga inteligente
            </Button>
            <Button onClick={() => setDialogo({ abierto: true, cliente: null })}>
              <Plus className="h-3.5 w-3.5" />
              Nuevo {rotulo}
            </Button>
          </div>
        </div>

        {/* Cuerpo */}
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
                    <TableHead>Razón social</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-right">
                      {esProveedor ? "Le debemos" : "Nos debe"}
                    </TableHead>
                    <TableHead className="text-right">Vencido</TableHead>
                    <TableHead className="text-right">Plazo</TableHead>
                    {!esProveedor && <TableHead>Vendedor</TableHead>}
                    <TableHead className="w-[150px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabla.filas.length > 0 ? (
                    tabla.filas.map((c) => (
                      <Fila
                        key={c.id}
                        cliente={c}
                        ocupado={ocupado === c.id}
                        href={`/admin/${esProveedor ? "proveedores" : "clientes"}/${c.id}`}
                        mostrarVendedor={!esProveedor}
                        onVer={() => setVerId(c.id)}
                        onEditar={() => setDialogo({ abierto: true, cliente: c })}
                        onCambiarEstado={(activo) => cambiarEstado(c, activo)}
                        onEliminar={() => setAEliminar(c)}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={esProveedor ? 7 : 8} className="p-0">
                        <EmptyState
                          icon={Users}
                          title={
                            tabla.busqueda ? "Sin resultados" : `Todavía no hay ${rotuloPlural}`
                          }
                          description={
                            tabla.busqueda
                              ? `No hay ${rotuloPlural} que coincidan con «${tabla.busqueda}».`
                              : esProveedor
                              ? "Cargá el primero para poder registrar sus facturas."
                              : "Cargá el primero para poder empezar a facturar."
                          }
                          action={
                            !tabla.busqueda && (
                              <Button
                                onClick={() => setDialogo({ abierto: true, cliente: null })}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Nuevo {rotulo}
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

      <FichaDetalle
        abierto={verId !== null}
        tipo={tipo}
        entidadId={verId}
        onCerrar={() => setVerId(null)}
        onEditar={() => {
          const ficha = tabla.filas.find((f) => f.id === verId) ?? null
          setVerId(null)
          setDialogo({ abierto: true, cliente: ficha })
        }}
      />

      <LecturaFichaDialog
        abierto={leyendo}
        tipo={tipo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setDialogo({ abierto: true, cliente: null })
        }}
      />

      <EntidadDialog
        abierto={dialogo.abierto}
        tipo={tipo}
        cliente={dialogo.cliente}
        borrador={borrador}
        vendedores={vendedores}
        onCerrar={() => {
          setDialogo({ abierto: false, cliente: null })
          setBorrador(null)
        }}
        onGuardado={alGuardar}
      />

      <ConfirmarDialog
        abierto={aEliminar !== null}
        titulo={`¿Eliminar ${aEliminar?.razonSocial ?? ""}?`}
        descripcion={
          <>
            Se borra la ficha definitivamente y no se puede deshacer. Si el cliente
            tiene comprobantes cargados, el sistema no va a dejar borrarlo.
            <br />
            <br />
            Si el cliente dejó de operar pero tiene historia, conviene{" "}
            <strong>darlo de baja</strong> en vez de eliminarlo.
          </>
        }
        confirmar="Eliminar definitivamente"
        trabajando={eliminando}
        onCerrar={() => setAEliminar(null)}
        onConfirmar={eliminar}
      />
    </>
  )
}

/* ── Fila ─────────────────────────────────────────────────────────────────── */

function Fila({
  cliente: c,
  ocupado,
  href,
  mostrarVendedor,
  onVer,
  onEditar,
  onCambiarEstado,
  onEliminar,
}: {
  cliente: EntidadConResumen
  ocupado: boolean
  /** A dónde lleva el nombre. Lo arma el listado, que es quien sabe de qué
   *  maestro son estas filas. */
  href: string
  mostrarVendedor: boolean
  onVer: () => void
  onEditar: () => void
  onCambiarEstado: (activo: boolean) => void
  onEliminar: () => void
}) {
  // Con un default en vez de `c.resumen` a secas: si algún endpoint devuelve la
  // ficha sin la parte de saldos, la columna queda en cero y la tabla se dibuja
  // igual. Un `undefined` acá voltea la pantalla entera por una columna.
  const r = c.resumen ?? RESUMEN_VACIO

  return (
    // La fila entera abre el detalle. Los botones del final cortan la
    // propagación: si editar abriera también el panel, cada click haría dos
    // cosas y una de las dos siempre sería la que no se quería.
    <TableRow
      onClick={onVer}
      className={cn("cursor-pointer", !c.activo && "opacity-60")}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          {/* Entrar a la ficha es el gesto principal de la fila: es donde está
              todo lo del cliente, no solo lo que entra en estas columnas. El
              panel lateral sigue disponible con el ojo, para espiar sin salir
              del listado. */}
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-ink hover:text-brand-600 hover:underline"
          >
            {c.razonSocial}
          </Link>
          {c.origen === "exterior" && (
            <Badge tone="neutral" size="sm">
              Exterior
            </Badge>
          )}
          {!c.activo && (
            <Badge tone="danger" size="sm">
              De baja
            </Badge>
          )}
        </div>
        {c.cuit && (
          <span className="num text-[11.5px] text-ink-muted">{formatearCuit(c.cuit)}</span>
        )}
      </TableCell>

      <TableCell>
        {c.categoriaNombre ? (
          <Badge tone="neutral" size="sm">
            {c.categoriaNombre}
          </Badge>
        ) : (
          <span className="text-[11.5px] text-ink-faint">Sin categoría</span>
        )}
      </TableCell>

      <TableCell className="text-ink-secondary">
        {c.contacto || c.email ? (
          <div className="min-w-0">
            {c.contacto && <p className="truncate">{c.contacto}</p>}
            {c.email && (
              <p className="truncate text-[11.5px] text-ink-muted">{c.email}</p>
            )}
          </div>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </TableCell>

      {/* Pendiente y vencido, cada moneda en su renglón y nunca sumadas: para
          consolidarlas habría que elegir un tipo de cambio y el saldo cambiaría
          solo de un día para el otro. */}
      <TableCell className="text-right">
        {r.pendienteArs === 0 && r.pendienteUsd === 0 ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <div>
            {r.pendienteArs !== 0 && (
              <span className="num block font-semibold text-ink">
                {formatearImporte(r.pendienteArs, "ARS")}
              </span>
            )}
            {r.pendienteUsd !== 0 && (
              <span className="num block text-[11.5px] font-medium text-ink-secondary">
                {formatearImporte(r.pendienteUsd, "USD")}
              </span>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="text-right">
        {r.vencidas === 0 ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <div>
            {r.vencidoArs !== 0 && (
              <span className="num block font-semibold text-danger-text">
                {formatearImporte(r.vencidoArs, "ARS")}
              </span>
            )}
            {r.vencidoUsd !== 0 && (
              <span className="num block text-[11.5px] font-medium text-danger-text">
                {formatearImporte(r.vencidoUsd, "USD")}
              </span>
            )}
            <span className="text-[10.5px] text-ink-muted">
              {r.vencidas} comprobante{r.vencidas !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </TableCell>

      <TableCell className="num text-right text-ink-secondary">
        {c.condicionPagoDias !== null ? (
          `${c.condicionPagoDias} d`
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </TableCell>

      {mostrarVendedor && (
        <TableCell className="text-ink-secondary">
          {c.vendedorNombre ?? <span className="text-ink-faint">—</span>}
        </TableCell>
      )}

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
            disabled={ocupado}
            onClick={() => onCambiarEstado(!c.activo)}
            aria-label={c.activo ? "Dar de baja" : "Reactivar"}
            title={c.activo ? "Dar de baja" : "Reactivar"}
          >
            {ocupado ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : c.activo ? (
              <Ban className="h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEliminar}
            aria-label="Eliminar"
            title="Eliminar definitivamente"
            className="text-ink-faint hover:bg-danger-soft hover:text-danger-text"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

/** La ficha como la espera el PATCH. Reactivar es una edición completa y no un
 *  parche de un campo: el handler valida la ficha entera. */
function aBody(c: Cliente) {
  return {
    razonSocial: c.razonSocial,
    origen: c.origen,
    cuit: c.cuit ?? "",
    formaJuridica: c.formaJuridica ?? "",
    contacto: c.contacto ?? "",
    direccion: c.direccion ?? "",
    provincia: c.provincia ?? "",
    telefono: c.telefono ?? "",
    email: c.email ?? "",
    vendedor: c.vendedorNombre ?? "",
    condicionPagoDias: c.condicionPagoDias ?? "",
    notas: c.notas ?? "",
  }
}
