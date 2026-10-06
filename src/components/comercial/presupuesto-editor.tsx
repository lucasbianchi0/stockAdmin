"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { Legajo } from "@/components/comercial/legajo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Textarea } from "@/components/ui/textarea"
import {
  MONEDAS,
  NOMBRE_MONEDA,
  formatearImporte,
  numeroEditable,
  parsearImporte,
} from "@/lib/admin/moneda"
import type { Moneda } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import {
  ALICUOTAS_IVA,
  ALICUOTA_IVA_LABEL,
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  TIPOS_ITEM,
  TIPO_ITEM_LABEL,
  calcularItem,
  calcularIva,
  calcularTotales,
  ventaSugerida,
  type AlicuotaIva,
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
 *
 * `IVA` es la alícuota del renglón. No toca ninguna cuenta de la planilla —la
 * rentabilidad se lee sobre el neto, como en la Excel—; lo que hace es que la
 * propuesta salga con el IVA discriminado al 10,5 y al 21.
 *
 * LOS NÚMEROS DENTRO DE LOS CAMPOS
 *
 * Siempre con coma decimal y sin punto de miles (`numeroEditable`), y se
 * reescriben así al salir de cada celda. Cargar `String(70.7544)` = "70.7544"
 * hacía que el parser leyera 707.544 al reabrir el presupuesto; y normalizar al
 * salir muestra en el momento cómo se entendió lo tipeado: quien escribe
 * "70.754" ve aparecer "70754" antes de guardar, no después.
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
  iva: AlicuotaIva
  stock: boolean
}

const RENGLON_VACIO = (): Renglon => ({
  key: Math.random().toString(36).slice(2),
  proveedor: "",
  parte: "",
  cantidad: "1",
  descripcion: "",
  tipo: "material",
  costoUnitario: "",
  venta: "",
  ventaPisada: false,
  iva: 0.21,
  stock: true,
})

const pct = (v: string): number => (parsearImporte(v) ?? 0) / 100
const aPct = (v: number): string => numeroEditable(Math.round(v * 10000) / 100, 2)

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

  /** El maestro de vendedores, el mismo que usa la ficha del cliente. */
  const vendedores =
    useQuery({
      queryKey: claves.url("/api/admin/vendedores"),
      queryFn: ({ signal }) =>
        pedirJson<{ vendedores?: { id: string; nombre: string }[] }>(
          "/api/admin/vendedores",
          { signal }
        ),
    }).data?.vendedores ?? []

  /* ── Estado del formulario ─────────────────────────────────────────────── */

  const [cliente, setCliente] = useState<{ id: string; razonSocial: string } | null>(null)
  const [referencia, setReferencia] = useState("")
  const [fecha, setFecha] = useState("")
  const [fechaValidez, setFechaValidez] = useState("")
  const [moneda, setMoneda] = useState<Moneda>("USD")
  const [tc, setTc] = useState("")
  const [estado, setEstado] = useState<EstadoPresupuesto>("borrador")
  const [vendedorId, setVendedorId] = useState("")
  const [breakPct, setBreakPct] = useState("10")
  const [margenMateriales, setMargenMateriales] = useState("1,7")
  const [margenManoObra, setMargenManoObra] = useState("1,7")
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
    setTc(p.tc ? numeroEditable(p.tc) : "")
    setEstado(p.estado)
    setVendedorId(p.vendedorId ?? "")
    setBreakPct(aPct(p.breakPct))
    setMargenMateriales(numeroEditable(p.margenMateriales))
    setMargenManoObra(numeroEditable(p.margenManoObra))
    setObservaciones(p.observaciones ?? "")
    setRenglones(
      p.items.map((i) => ({
        key: i.id,
        proveedor: i.proveedor ?? "",
        parte: i.parte ?? "",
        cantidad: numeroEditable(i.cantidad),
        descripcion: i.descripcion,
        tipo: i.tipo,
        costoUnitario: numeroEditable(i.costoUnitario),
        venta: numeroEditable(i.venta),
        // Lo guardado ya es una decisión tomada: no se recalcula solo.
        ventaPisada: true,
        iva: i.iva,
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

  /*
   * El impuesto de cada renglón sale del break de la cabecera, siempre.
   *
   * Antes cada renglón se quedaba con el break que había cuando se lo creó, así
   * que cambiar el "Break %" de arriba no movía ni un número de los renglones
   * ya cargados: la cabecera decía 15 % y la cuenta seguía usando 10. Un número
   * equivocado en silencio, que es la peor clase de error que puede tener una
   * planilla. En la Excel el break es uno solo para todo el presupuesto y acá
   * también.
   */
  const impuestoPct = pct(breakPct)

  const calculados = useMemo(
    () =>
      renglones.map((r) => {
        const base = {
          cantidad: parsearImporte(r.cantidad) ?? 0,
          costoUnitario: parsearImporte(r.costoUnitario) ?? 0,
          venta: parsearImporte(r.venta) ?? 0,
          impPct: impuestoPct,
        }
        return { ...base, ...calcularItem(base) }
      }),
    [renglones, impuestoPct]
  )

  const totales = useMemo(() => calcularTotales(calculados), [calculados])

  const desgloseIva = useMemo(
    () => calcularIva(calculados.map((c, i) => ({ ...c, iva: renglones[i].iva }))),
    [calculados, renglones]
  )

  /* ── Acciones sobre la planilla ────────────────────────────────────────── */

  const cambiar = (i: number, parche: Partial<Renglon>) => {
    setSucio(true)
    return setRenglones((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r
        const siguiente = { ...r, ...parche }
        /* La venta se recalcula al tocar el costo o el tipo, salvo que alguien
           ya la haya escrito a mano: ahí el número de la persona gana. */
        const tocoLaBase = parche.costoUnitario !== undefined || parche.tipo !== undefined
        if (tocoLaBase && !siguiente.ventaPisada) {
          const costo = parsearImporte(siguiente.costoUnitario) ?? 0
          siguiente.venta = costo ? numeroEditable(ventaSugerida(costo, siguiente.tipo, margenes)) : ""
        }
        return siguiente
      })
    )
  }

  /*
   * Cambiar un margen de la cabecera mueve las ventas que todavía son
   * sugeridas. Antes solo se recalculaban al tocar el costo o el tipo, así que
   * pasar Materiales de 1,7 a 1,8 dejaba los renglones con la venta del 1,7 sin
   * ningún aviso. Las escritas a mano no se tocan: ahí manda la persona.
   */
  const cambiarMargen = (cual: "materiales" | "manoObra", valor: string) => {
    setSucio(true)
    if (cual === "materiales") setMargenMateriales(valor)
    else setMargenManoObra(valor)

    const leido = parsearImporte(valor)
    if (leido === null) return
    const nuevos = {
      ...margenes,
      [cual === "materiales" ? "margenMateriales" : "margenManoObra"]: leido,
    }
    setRenglones((prev) =>
      prev.map((r) => {
        if (r.ventaPisada) return r
        const costo = parsearImporte(r.costoUnitario) ?? 0
        return { ...r, venta: costo ? numeroEditable(ventaSugerida(costo, r.tipo, nuevos)) : "" }
      })
    )
  }

  const agregar = () => {
    setSucio(true)
    setRenglones((prev) => [...prev, RENGLON_VACIO()])
  }

  const quitar = (i: number) => {
    setSucio(true)
    setRenglones((prev) => prev.filter((_, j) => j !== i))
  }

  /*
   * Aviso al salir con cambios sin guardar.
   *
   * Acá se pueden pasar veinte minutos armando una planilla y el guardado es
   * explícito. Cerrar la pestaña sin querer no puede costar esa media hora.
   * Autoguardado no: en un documento con precios, guardar solo lo que todavía
   * se está pensando es peor que perderlo.
   */
  const [sucio, setSucio] = useState(false)
  useEffect(() => {
    if (!sucio) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [sucio])

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
          vendedorId: vendedorId || null,
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
            iva: r.iva,
          })),
        }),
      })
      await invalidar()
      setSucio(false)
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <Campo id="vendedor" rotulo="Vendedor" opcional>
              <select
                id="vendedor"
                value={vendedorId}
                onChange={(e) => setVendedorId(e.target.value)}
                disabled={guardando}
                className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-ink disabled:opacity-60"
              >
                <option value="">Sin vendedor</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
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
            <Parametro rotulo="TC" valor={tc} onChange={(v) => { setSucio(true); setTc(v) }} ancho="w-24" />
            <Parametro rotulo="Break %" valor={breakPct} onChange={(v) => { setSucio(true); setBreakPct(v) }} />
            {/* El margen es un multiplicador, no un porcentaje: "1,7" quiere
                decir que se vende a 1,7 veces el costo. Se escribe como en la
                Excel —traducirlo obligaría a comparar mentalmente cada vez— y
                el título lo aclara, que es donde alguien nuevo lo va a buscar. */}
            <Parametro
              rotulo="Materiales"
              valor={margenMateriales}
              onChange={(v) => cambiarMargen("materiales", v)}
              ayuda="Multiplicador sobre el costo para Materiales, Hardware y Licencias: 1,7 = se vende a 1,7 veces el costo (70 % de recargo)"
            />
            <Parametro
              rotulo="Mano de obra"
              valor={margenManoObra}
              onChange={(v) => cambiarMargen("manoObra", v)}
              ayuda="Multiplicador sobre el costo para Mano de obra y Servicios: 1,7 = se vende a 1,7 veces el costo (70 % de recargo)"
            />
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
                <th className="w-[124px]">Tipo</th>
                <th className="w-[74px]" title="Alícuota de IVA del renglón: sale discriminada en la propuesta">
                  IVA
                </th>
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
                        numerico
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
                      <select
                        value={r.iva}
                        onChange={(e) => cambiar(i, { iva: Number(e.target.value) as AlicuotaIva })}
                        disabled={guardando}
                        aria-label="Alícuota de IVA"
                        className={cn(
                          "num h-7 w-full rounded-md border border-line bg-surface px-1.5 text-[11.5px]",
                          // El 10,5 es la excepción: se marca para que se vea
                          // de un vistazo qué renglones van aparte.
                          r.iva === 0.105 ? "border-brand-300 bg-brand-50 text-brand-700" : "text-ink"
                        )}
                      >
                        {ALICUOTAS_IVA.map((a) => (
                          <option key={a} value={a}>
                            {ALICUOTA_IVA_LABEL[a]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <CeldaTexto
                        valor={r.costoUnitario}
                        onChange={(v) => cambiar(i, { costoUnitario: v })}
                        numerico
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
                        numerico
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
                  <td colSpan={13} className="px-4 py-10 text-center text-[12.5px] text-ink-muted">
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

          {/* Lo que paga el cliente, aparte de la cuenta de la empresa: el IVA
              no es rentabilidad, y mezclarlo en la misma fila invitaría a
              leer el total con IVA como precio de venta. */}
          {desgloseIva.alicuotas.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:ml-auto sm:border-l sm:border-line sm:pl-6">
              {desgloseIva.alicuotas.map((a) => (
                <Total
                  key={a.alicuota}
                  rotulo={`IVA ${ALICUOTA_IVA_LABEL[a.alicuota]}`}
                  valor={formatearImporte(a.iva, moneda)}
                  ayuda={`Sobre ${formatearImporte(a.base, moneda)} de renglones al ${ALICUOTA_IVA_LABEL[a.alicuota]}`}
                />
              ))}
              <Total rotulo="Total con IVA" valor={formatearImporte(desgloseIva.total, moneda)} fuerte />
            </div>
          )}
        </div>
      </section>

      {/* El legajo va después de la planilla: primero se arma el presupuesto,
          después se le van colgando los papeles a medida que la operación
          avanza —la OC cuando llega, el remito cuando se entrega—. */}
      <Legajo presupuestoId={id} />

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
            {/* "renglones" pierde la tilde en plural: "0 renglónes" no existe. */}
            <span className="hidden sm:inline">
              {renglones.length} {renglones.length === 1 ? "renglón" : "renglones"} ·{" "}
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

/**
 * Al salir de un campo numérico, lo tipeado se reescribe como se entendió:
 * "61.42" → "61,42", "1.234" → "1234". Si el sistema leyó otra cosa que la que
 * la persona quiso, lo ve en ese momento y no en el total.
 */
function normalizarAlSalir(valor: string, onChange: (v: string) => void) {
  const n = parsearImporte(valor)
  if (n === null) return
  const normalizado = numeroEditable(n)
  if (normalizado !== valor) onChange(normalizado)
}

function CeldaTexto({
  valor,
  onChange,
  placeholder,
  numerico,
  disabled,
  className,
}: {
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  numerico?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      onBlur={numerico ? () => normalizarAlSalir(valor, onChange) : undefined}
      inputMode={numerico ? "decimal" : undefined}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[11.5px] text-ink",
        "transition-colors placeholder:text-ink-faint hover:border-line focus:border-brand-300 focus:bg-surface",
        numerico && "num text-right",
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
  ayuda,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  ancho?: string
  ayuda?: string
}) {
  return (
    <label className="flex items-center gap-1.5" title={ayuda}>
      <span
        className={cn(
          "text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle",
          ayuda && "cursor-help border-b border-dashed border-line-strong"
        )}
      >
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => normalizarAlSalir(valor, onChange)}
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
  ayuda,
}: {
  rotulo: string
  valor: string
  fuerte?: boolean
  tono?: "danger"
  ayuda?: string
}) {
  return (
    <div title={ayuda}>
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
