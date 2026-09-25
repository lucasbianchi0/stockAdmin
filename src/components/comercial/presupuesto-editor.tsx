"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Textarea } from "@/components/ui/textarea"
import { MONEDAS, NOMBRE_MONEDA, formatearImporte, parsearImporte } from "@/lib/admin/moneda"
import type { Moneda } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  TIPOS_ITEM,
  TIPO_ITEM_LABEL,
  calcularItem,
  calcularTotales,
  ventaSugerida,
  type EstadoPresupuesto,
  type Presupuesto,
  type TipoItem,
} from "@/lib/comercial/presupuestos"
import { cn } from "@/lib/utils"

/**
 * La planilla de costos de un presupuesto.
 *
 * Es la pantalla que reemplaza la Excel, así que respeta su forma: una fila por
 * concepto, las columnas en el orden en que se leen, y los totales abajo. Lo que
 * agrega es que las cuentas ya no hay que arrastrarlas — se recalculan mientras
 * se tipea— y que el proveedor, el costo y el margen no viajan al cliente.
 *
 * DOS COLUMNAS QUE NO ESTÁN EN LA EXCEL
 *
 * `Tipo` decide dos cosas que la planilla resolvía a ojo: qué margen se aplica
 * —materiales y mano de obra tienen el suyo— y bajo qué título sale el renglón
 * en la propuesta del cliente, que separa MANO DE OBRA de MATERIALES.
 *
 * La venta se propone como costo × margen y queda editable. Si alguien la pisa,
 * manda lo escrito: el pedido lo dice con todas las letras, y hay renglones —el
 * flete que se absorbe— donde la cuenta automática no es la que se quiere.
 */

type Renglon = {
  key: string
  proveedor: string
  parte: string
  cantidad: string
  descripcion: string
  tipo: TipoItem
  costoUnitario: string
  venta: string
  /** La venta se recalcula sola hasta que alguien la escribe. A partir de ahí
   *  manda el número escrito, aunque después cambie el costo. */
  ventaPisada: boolean
  impPct: string
  stock: boolean
}

const RENGLON_VACIO = (impPct: number): Renglon => ({
  key: Math.random().toString(36).slice(2),
  proveedor: "",
  parte: "",
  cantidad: "1",
  descripcion: "",
  tipo: "material",
  costoUnitario: "",
  venta: "",
  ventaPisada: false,
  impPct: String(impPct),
  stock: true,
})

const pct = (v: string): number => (parsearImporte(v) ?? 0) / 100
const aPct = (v: number): string => String(Math.round(v * 10000) / 100)

export function PresupuestoEditor({ id }: { id: string }) {
  const router = useRouter()
  const invalidar = useInvalidarAdmin()
  const url = `/api/comercial/presupuestos/${id}`

  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ presupuesto: Presupuesto }>(url, { signal }),
    refetchOnWindowFocus: false,
  })

  const p = consulta.data?.presupuesto

  /* ── Estado del formulario ─────────────────────────────────────────────── */

  const [cliente, setCliente] = useState<{ id: string; razonSocial: string } | null>(null)
  const [referencia, setReferencia] = useState("")
  const [fecha, setFecha] = useState("")
  const [fechaValidez, setFechaValidez] = useState("")
  const [moneda, setMoneda] = useState<Moneda>("USD")
  const [tc, setTc] = useState("")
  const [estado, setEstado] = useState<EstadoPresupuesto>("borrador")
  const [breakPct, setBreakPct] = useState("10")
  const [margenMateriales, setMargenMateriales] = useState("1.7")
  const [margenManoObra, setMargenManoObra] = useState("1.7")
  const [observaciones, setObservaciones] = useState("")
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [guardando, setGuardando] = useState(false)

  // Una sola vez, cuando llega el presupuesto: después manda lo que se edita en
  // pantalla, que si no se pisaría solo en cada refetch.
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    if (!p || cargado) return
    setCliente({ id: p.clienteId, razonSocial: p.clienteNombre ?? "" })
    setReferencia(p.referencia)
    setFecha(p.fecha)
    setFechaValidez(p.fechaValidez ?? "")
    setMoneda(p.moneda)
    setTc(p.tc ? String(p.tc) : "")
    setEstado(p.estado)
    setBreakPct(aPct(p.breakPct))
    setMargenMateriales(String(p.margenMateriales))
    setMargenManoObra(String(p.margenManoObra))
    setObservaciones(p.observaciones ?? "")
    setRenglones(
      p.items.map((i) => ({
        key: i.id,
        proveedor: i.proveedor ?? "",
        parte: i.parte ?? "",
        cantidad: String(i.cantidad),
        descripcion: i.descripcion,
        tipo: i.tipo,
        costoUnitario: String(i.costoUnitario),
        venta: String(i.venta),
        // Lo guardado ya es una decisión tomada: no se recalcula solo.
        ventaPisada: true,
        impPct: aPct(i.impPct),
        stock: i.stock,
      }))
    )
    setCargado(true)
  }, [p, cargado])

  /* ── Cálculos ──────────────────────────────────────────────────────────── */

  const margenes = useMemo(
    () => ({
      margenMateriales: parsearImporte(margenMateriales) ?? 1,
      margenManoObra: parsearImporte(margenManoObra) ?? 1,
    }),
    [margenMateriales, margenManoObra]
  )

  const calculados = useMemo(
    () =>
      renglones.map((r) => {
        const base = {
          cantidad: parsearImporte(r.cantidad) ?? 0,
          costoUnitario: parsearImporte(r.costoUnitario) ?? 0,
          venta: parsearImporte(r.venta) ?? 0,
          impPct: pct(r.impPct),
        }
        return { ...base, ...calcularItem(base) }
      }),
    [renglones]
  )

  const totales = useMemo(() => calcularTotales(calculados), [calculados])

  /* ── Acciones sobre la planilla ────────────────────────────────────────── */

  const cambiar = (i: number, parche: Partial<Renglon>) =>
    setRenglones((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r
        const siguiente = { ...r, ...parche }
        /* La venta se recalcula al tocar el costo o el tipo, salvo que alguien
           ya la haya escrito a mano: ahí el número de la persona gana. */
        const tocoLaBase = parche.costoUnitario !== undefined || parche.tipo !== undefined
        if (tocoLaBase && !siguiente.ventaPisada) {
          const costo = parsearImporte(siguiente.costoUnitario) ?? 0
          siguiente.venta = costo ? String(ventaSugerida(costo, siguiente.tipo, margenes)) : ""
        }
        return siguiente
      })
    )

  const agregar = () =>
    setRenglones((prev) => [...prev, RENGLON_VACIO(parsearImporte(breakPct) ?? 10)])

  const quitar = (i: number) => setRenglones((prev) => prev.filter((_, j) => j !== i))

  /* ── Guardar ───────────────────────────────────────────────────────────── */

  const guardar = async () => {
    if (guardando) return
    setGuardando(true)
    try {
      await pedirJson(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clienteId: cliente?.id,
          referencia,
          fecha,
          fechaValidez: fechaValidez || null,
          moneda,
          tc: parsearImporte(tc) ?? null,
          estado,
          breakPct: pct(breakPct),
          margenMateriales: margenes.margenMateriales,
          margenManoObra: margenes.margenManoObra,
          observaciones,
          items: renglones.map((r, i) => ({
            ...calculados[i],
            proveedor: r.proveedor,
            parte: r.parte,
            descripcion: r.descripcion,
            tipo: r.tipo,
            stock: r.stock,
            iva: 0.21,
          })),
        }),
      })
      await invalidar()
      toast.success("Presupuesto guardado")
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"))
    } finally {
      setGuardando(false)
    }
  }

  if (consulta.isPending) return <LoadingState label="Cargando el presupuesto…" />
  if (consulta.isError || !p) {
    return (
      <ErrorState
        message={mensajeError(consulta.error, "No se pudo cargar el presupuesto")}
        onRetry={() => consulta.refetch()}
      />
    )
  }

  return (
    <div className="space-y-4 pb-24">
      {/* ── Datos generales ─────────────────────────────────────────────── */}
      <section className="panel p-5">
        <div className="mb-4 flex items-center gap-3">
          <p className="eyebrow">Datos del presupuesto</p>
          <Badge tone={ESTADO_TONO[estado]} size="sm">
            {ESTADO_LABEL[estado]}
          </Badge>
        </div>

        <div className="space-y-4">
          <SelectorEntidad
            id="cliente"
            tipo="cliente"
            valor={cliente?.id ?? ""}
            nombre={cliente?.razonSocial ?? ""}
            disabled={guardando}
            onElegir={(c) => setCliente(c)}
          />

          <Campo id="referencia" rotulo="Referencia">
            <Input
              id="referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              disabled={guardando}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-4">
            <Campo id="fecha" rotulo="Fecha">
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="num"
                disabled={guardando}
              />
            </Campo>
            <Campo id="validez" rotulo="Validez" opcional>
              <Input
                id="validez"
                type="date"
                value={fechaValidez}
                onChange={(e) => setFechaValidez(e.target.value)}
                className="num"
                disabled={guardando}
              />
            </Campo>
            <Campo id="moneda" rotulo="Moneda">
              <div className="flex gap-2">
                {MONEDAS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={guardando}
                    onClick={() => setMoneda(m)}
                    aria-pressed={moneda === m}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors disabled:opacity-60",
                      moneda === m
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                    )}
                  >
                    {NOMBRE_MONEDA[m]}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo id="estado" rotulo="Estado">
              <select
                id="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoPresupuesto)}
                disabled={guardando}
                className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-ink disabled:opacity-60"
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>
      </section>

      {/* ── La planilla ─────────────────────────────────────────────────── */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3">
          <p className="eyebrow">Planilla de costos</p>

          {/* Los tres parámetros arriba de la planilla, como en la Excel: son de
              todo el presupuesto y cambian todas las cuentas de abajo. */}
          <div className="flex flex-wrap items-center gap-3">
            <Parametro rotulo="TC" valor={tc} onChange={setTc} ancho="w-24" />
            <Parametro rotulo="Break %" valor={breakPct} onChange={setBreakPct} />
            <Parametro
              rotulo="Materiales"
              valor={margenMateriales}
              onChange={setMargenMateriales}
            />
            <Parametro rotulo="Mano de obra" valor={margenManoObra} onChange={setMargenManoObra} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead className="[&_th]:border-b [&_th]:border-line [&_th]:bg-surface-subtle [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-ink-subtle">
              <tr>
                <th className="w-[130px]">Proveedor</th>
                <th className="w-[90px]">P/N</th>
                <th className="w-[62px]">Cant</th>
                <th>Descripción</th>
                <th className="w-[112px]">Tipo</th>
                <th className="w-[104px] text-right">Costo unit.</th>
                <th className="w-[104px] text-right">Costo total</th>
                <th className="w-[104px] text-right">Venta unit.</th>
                <th className="w-[104px] text-right">Venta total</th>
                <th className="w-[96px] text-right">Renta</th>
                <th className="w-[54px] text-right">%</th>
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => {
                const c = calculados[i]
                return (
                  <tr key={r.key} className="[&_td]:border-b [&_td]:border-line-soft [&_td]:px-2 [&_td]:py-1.5">
                    <td>
                      <CeldaTexto
                        valor={r.proveedor}
                        onChange={(v) => cambiar(i, { proveedor: v })}
                        placeholder="Quién cotiza"
                        disabled={guardando}
                      />
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.parte}
                        onChange={(v) => cambiar(i, { parte: v })}
                        disabled={guardando}
                      />
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.cantidad}
                        onChange={(v) => cambiar(i, { cantidad: v })}
                        alineado="text-right"
                        disabled={guardando}
                      />
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.descripcion}
                        onChange={(v) => cambiar(i, { descripcion: v })}
                        placeholder="Qué es"
                        disabled={guardando}
                      />
                    </td>
                    <td>
                      <select
                        value={r.tipo}
                        onChange={(e) => cambiar(i, { tipo: e.target.value as TipoItem })}
                        disabled={guardando}
                        className="h-7 w-full rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink"
                      >
                        {TIPOS_ITEM.map((t) => (
                          <option key={t} value={t}>
                            {TIPO_ITEM_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.costoUnitario}
                        onChange={(v) => cambiar(i, { costoUnitario: v })}
                        alineado="text-right"
                        disabled={guardando}
                      />
                    </td>
                    <td className="num text-right text-ink-muted">
                      {formatearImporte(c.costoTotal, moneda, { simbolo: false })}
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.venta}
                        onChange={(v) => cambiar(i, { venta: v, ventaPisada: true })}
                        alineado="text-right"
                        disabled={guardando}
                        // Lo que sale del margen se ve gris; lo escrito a mano,
                        // en tinta plena: la diferencia importa al revisar.
                        className={r.ventaPisada ? "text-ink" : "text-ink-muted"}
                      />
                    </td>
                    <td className="num text-right font-medium text-ink">
                      {formatearImporte(c.ventaTotal, moneda, { simbolo: false })}
                    </td>
                    <td
                      className={cn(
                        "num text-right font-medium",
                        c.rentabilidad < 0 ? "text-danger-text" : "text-ink-secondary"
                      )}
                    >
                      {formatearImporte(c.rentabilidad, moneda, { simbolo: false })}
                    </td>
                    <td
                      className={cn(
                        "num text-right",
                        c.rentabilidad < 0 ? "text-danger-text" : "text-ink-muted"
                      )}
                    >
                      {c.ventaTotal === 0 ? "—" : `${Math.round(c.rentaPct * 100)}%`}
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => quitar(i)}
                        disabled={guardando}
                        aria-label="Quitar renglón"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}

              {renglones.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-[12.5px] text-ink-muted">
                    La planilla está vacía. Agregá el primer renglón.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={agregar} disabled={guardando}>
            <Plus className="h-3.5 w-3.5" />
            Agregar renglón
          </Button>
        </div>

        {/* El cuadro de totales del pedido: costo, venta, renta y % de renta. */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line bg-surface-subtle px-4 py-3.5">
          <Total rotulo="Total costo" valor={formatearImporte(totales.costo, moneda)} />
          <Total rotulo="Precio de venta" valor={formatearImporte(totales.venta, moneda)} fuerte />
          <Total
            rotulo="Rentabilidad"
            valor={formatearImporte(totales.rentabilidad, moneda)}
            tono={totales.rentabilidad < 0 ? "danger" : undefined}
          />
          <Total
            rotulo="% de renta"
            valor={totales.venta === 0 ? "—" : `${Math.round(totales.rentaPct * 100)} %`}
            tono={totales.rentabilidad < 0 ? "danger" : undefined}
          />
        </div>
      </section>

      <section className="panel p-5">
        <Campo id="observaciones" rotulo="Observaciones" opcional>
          <Textarea
            id="observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={guardando}
            className="min-h-[72px]"
          />
        </Campo>
      </section>

      {/* La barra de guardar, siempre a la vista: la planilla es larga y volver
          arriba para guardar es el camino más corto a perder lo cargado. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:left-[268px]">
        {/* El `pr` grande de la derecha es para el botón del asistente, que vive
            fijo en esa esquina: sin esto, "Guardar" queda debajo del globo y no
            se puede clickear. Es el precio de tener una barra fija, y se paga
            acá y no moviendo el asistente, que está donde está en toda la app. */}
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3 pr-[88px] md:pr-[112px]">
          {/* En teléfono queda solo el total: el conteo de renglones es un dato
              de contexto y compite por el ancho con los dos botones, que son lo
              que la barra existe para ofrecer. */}
          <span className="num truncate text-[12.5px] text-ink-muted">
            <span className="hidden sm:inline">
              {renglones.length} renglón{renglones.length === 1 ? "" : "es"} ·{" "}
            </span>
            <span className="font-semibold text-ink">
              {formatearImporte(totales.venta, moneda)}
            </span>
          </span>
          <div className="flex shrink-0 gap-2">
            {/* "Volver" es una comodidad: en teléfono el botón de atrás del
                navegador hace lo mismo y el ancho se necesita para Guardar. */}
            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => router.push("/comercial/presupuestos")}
            >
              Volver al listado
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function CeldaTexto({
  valor,
  onChange,
  placeholder,
  alineado,
  disabled,
  className,
}: {
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  alineado?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[11.5px] text-ink",
        "transition-colors placeholder:text-ink-faint hover:border-line focus:border-brand-300 focus:bg-surface",
        alineado === "text-right" && "num text-right",
        className
      )}
    />
  )
}

function Parametro({
  rotulo,
  valor,
  onChange,
  ancho = "w-16",
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  ancho?: string
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className={cn(
          "num h-7 rounded-md border border-line-strong bg-surface px-2 text-right text-[11.5px] text-ink",
          ancho
        )}
      />
    </label>
  )
}

function Total({
  rotulo,
  valor,
  fuerte,
  tono,
}: {
  rotulo: string
  valor: string
  fuerte?: boolean
  tono?: "danger"
}) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p
        className={cn(
          "num mt-0.5 tracking-[-0.02em]",
          fuerte ? "text-[17px] font-bold" : "text-[15px] font-semibold",
          tono === "danger" ? "text-danger-text" : "text-ink"
        )}
      >
        {valor}
      </p>
    </div>
  )
}

function Campo({
  id,
  rotulo,
  opcional,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
          {rotulo}
        </label>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
