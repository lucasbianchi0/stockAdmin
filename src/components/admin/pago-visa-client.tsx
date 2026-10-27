"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CreditCard, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { hoyArgentina } from "@/lib/admin/fecha"
import { formatearImporte, redondear } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

/**
 * Pago de tarjetas VISA.
 *
 * Lo que pidió el estudio: las facturas se siguen cargando como siempre, con
 * la marca VISA, y cuando el banco debita el resumen se aplican todas juntas —
 * cada pago a la cuenta de su proveedor— con un único débito en el banco.
 *
 * Cómo queda registrado, en dos pasos que esta pantalla hace de una vez:
 *
 *  1. Un pago por proveedor, que sale de la cuenta «TARJETA VISA GALICIA»
 *     (contable 220). Cada proveedor ve su factura cancelada en su cuenta
 *     corriente, igual que con cualquier otro pago.
 *  2. Una transferencia del banco a la tarjeta por el total. En el extracto del
 *     Galicia es una sola línea, y la tarjeta vuelve a cero.
 *
 * Las facturas en dólares van igual, marcadas VISA. El banco las debita en un
 * segundo débito, pesificado al tipo de cambio del resumen: por eso piden ese
 * TC, se cancelan a ese cambio (la diferencia con el de la factura va a
 * diferencia de cambio, como en cualquier pago) y salen en una segunda
 * transferencia, separada de la de pesos.
 */

type FacturaVisa = {
  id: string
  proveedorId: string | null
  proveedor: string
  clase: string
  numero: string
  fecha: string
  moneda: "ARS" | "USD"
  total: number
  saldo: number
  detalle: string | null
}

const URL_FACTURAS = "/api/admin/pagos/visa"
const URL_CUENTAS = "/api/admin/cuentas"
const SIN_CUENTAS: CuentaFinanciera[] = []

export function PagoVisaClient() {
  const invalidar = useInvalidarAdmin()
  const facturasQ = useQuery({
    queryKey: claves.url(URL_FACTURAS),
    queryFn: ({ signal }) =>
      pedirJson<{ facturas: FacturaVisa[]; sinMigracion?: boolean }>(URL_FACTURAS, { signal }),
  })
  const { data: cuentas = SIN_CUENTAS } = useQuery({
    queryKey: claves.url(URL_CUENTAS),
    queryFn: ({ signal }) => pedirJson<{ cuentas?: CuentaFinanciera[] }>(URL_CUENTAS, { signal }),
    select: (d) => d.cuentas ?? SIN_CUENTAS,
  })

  const tarjeta = cuentas.find((c) => c.tipo === "tarjeta")
  const bancos = cuentas.filter((c) => c.tipo === "banco" && c.moneda === "ARS")
  const [bancoId, setBancoId] = useState("")
  const banco = bancoId || bancos.find((c) => /galicia/i.test(c.nombre))?.id || bancos[0]?.id || ""
  const [fecha, setFecha] = useState(hoyArgentina())
  const [tcTexto, setTcTexto] = useState("")
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [trabajando, setTrabajando] = useState(false)

  const facturas = useMemo(() => facturasQ.data?.facturas ?? [], [facturasQ.data])
  const elegidas = facturas.filter((f) => !fuera.has(f.id))
  const tc = Number(tcTexto.replace(",", "."))
  const tcValido = Number.isFinite(tc) && tc > 0
  const enDolares = elegidas.filter((f) => f.moneda === "USD")
  const totalArs = redondear(elegidas.filter((f) => f.moneda === "ARS").reduce((a, f) => a + f.saldo, 0))
  const totalUsd = redondear(enDolares.reduce((a, f) => a + f.saldo, 0))
  // Cada factura se pesifica por separado, que es como lo convierte el recibo.
  const usdEnPesos = (lista: FacturaVisa[]) =>
    redondear(lista.filter((f) => f.moneda === "USD").reduce((a, f) => a + redondear(f.saldo * tc), 0))
  const faltaTc = enDolares.length > 0 && !tcValido
  const hayDolares = facturas.some((f) => f.moneda === "USD")

  const porProveedor = useMemo(() => {
    const m = new Map<string, FacturaVisa[]>()
    for (const f of facturas) m.set(f.proveedor, [...(m.get(f.proveedor) ?? []), f])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [facturas])

  const alternar = (id: string) =>
    setFuera((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const registrar = async () => {
    if (!tarjeta || !banco || !elegidas.length || faltaTc) return
    setTrabajando(true)
    const grupos = new Map<string, FacturaVisa[]>()
    for (const f of elegidas) {
      if (!f.proveedorId) continue
      grupos.set(f.proveedorId, [...(grupos.get(f.proveedorId) ?? []), f])
    }
    let pagadoArs = 0
    let pagadoUsd = 0
    const fallas: string[] = []
    try {
      // Uno por proveedor: el recibo es de una ficha, y así cada uno ve el
      // suyo en su cuenta corriente.
      for (const [proveedorId, lista] of grupos) {
        const enPesos = redondear(lista.filter((f) => f.moneda === "ARS").reduce((a, f) => a + f.saldo, 0))
        const pesificado = usdEnPesos(lista)
        const importe = redondear(enPesos + pesificado)
        try {
          await pedirJson("/api/admin/pagos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              entidadId: proveedorId,
              fecha,
              moneda: "ARS",
              tc: null,
              retenciones: [],
              imputaciones: lista.map((f) => ({
                comprobanteId: f.id,
                importe: f.saldo,
                tcAplicado: f.moneda === "USD" ? tc : null,
              })),
              aplicaciones: [],
              medios: [{ cuentaId: tarjeta.id, importe, referencia: "Resumen VISA" }],
              observaciones: `Pago con tarjeta VISA · ${lista.map((f) => `${f.clase} ${f.numero}`).join(", ")}`,
            }),
          })
          pagadoArs = redondear(pagadoArs + enPesos)
          pagadoUsd = redondear(pagadoUsd + pesificado)
        } catch (e) {
          fallas.push(`${lista[0].proveedor}: ${mensajeError(e)}`)
        }
      }

      // Los débitos del banco, como los hace el banco: uno por los pesos y otro
      // por los dólares pesificados. Por lo que efectivamente se pagó, para que
      // la tarjeta quede en cero aunque algún proveedor haya fallado.
      const debitar = (importe: number, referencia: string, detalle: string) =>
        pedirJson("/api/admin/movimientos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            origen: "transferencia",
            fecha,
            cuentaOrigenId: banco,
            cuentaDestinoId: tarjeta.id,
            importeOrigen: importe,
            importeDestino: importe,
            monedaOrigen: "ARS",
            monedaDestino: "ARS",
            tc: 1,
            referencia,
            detalle,
          }),
        })
      if (pagadoArs > 0) await debitar(pagadoArs, "Resumen VISA", "Débito del resumen de la tarjeta VISA")
      if (pagadoUsd > 0) {
        await debitar(
          pagadoUsd,
          "Resumen VISA USD",
          `Débito del resumen VISA en dólares, pesificado a ${tc.toLocaleString("es-AR")}`
        )
      }
      const pagado = redondear(pagadoArs + pagadoUsd)
      if (fallas.length) {
        toast.error(`Quedaron sin pagar: ${fallas.join(" · ")}`)
      } else {
        toast.success(`Resumen registrado: ${formatearImporte(pagado)} debitados del banco`)
      }
      setFuera(new Set())
      setTcTexto("")
    } catch (e) {
      toast.error(
        `Los pagos se registraron pero no el débito del banco: ${mensajeError(e)}. Cargalo como transferencia del banco a la tarjeta.`
      )
    } finally {
      setTrabajando(false)
      void invalidar()
    }
  }

  if (facturasQ.isPending) return <LoadingState label="Buscando las facturas VISA…" />
  if (facturasQ.isError) {
    return <ErrorState message={mensajeError(facturasQ.error)} onRetry={() => facturasQ.refetch()} />
  }
  if (facturasQ.data.sinMigracion) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Falta habilitar la marca VISA en la base"
        description="Hay que aplicar la migración 20261026_02_tarjeta_visa."
      />
    )
  }
  if (!facturas.length) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No hay facturas VISA pendientes"
        description="Al cargar una factura de compra, marcá «VISA» arriba a la derecha y aparece acá hasta que se debite el resumen."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-4 px-5 py-4">
        <label className="block">
          <span className="mb-1 block text-[12px] text-ink-muted">Fecha del débito</span>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[160px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-ink-muted">Se debitó de</span>
          <select
            value={banco}
            onChange={(e) => setBancoId(e.target.value)}
            className="h-9 min-w-[200px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            {bancos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {hayDolares && (
          <label className="block">
            <span className="mb-1 block text-[12px] text-ink-muted">TC del débito en dólares</span>
            <Input
              inputMode="decimal"
              placeholder="Ej. 1450,50"
              value={tcTexto}
              onChange={(e) => setTcTexto(e.target.value)}
              className={cn("w-[150px]", faltaTc && "border-warning-line")}
            />
          </label>
        )}
        <div className="ml-auto text-right">
          <p className="eyebrow">Total del resumen</p>
          <p className="num text-[20px] font-bold tracking-[-0.02em] text-brand-600">
            {formatearImporte(totalArs)}
          </p>
          {totalUsd > 0 && (
            <p className="num text-[12px] text-ink-secondary">
              + {formatearImporte(totalUsd, "USD")}
              {tcValido ? ` = ${formatearImporte(usdEnPesos(elegidas))} (2º débito)` : ""}
            </p>
          )}
          <p className="text-[11.5px] text-ink-muted">
            {elegidas.length} factura{elegidas.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={registrar} disabled={!tarjeta || !banco || !elegidas.length || faltaTc || trabajando}>
          {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          Registrar el débito
        </Button>
        {faltaTc && (
          <p className="w-full text-[12px] text-warning-text">
            Cargá el tipo de cambio al que el banco pesificó los dólares, o destildá las facturas en
            dólares.
          </p>
        )}
        {!tarjeta && (
          <p className="w-full text-[12px] text-danger-text">
            Falta la cuenta «TARJETA VISA GALICIA» en Caja y bancos (la crea la migración 20261026_02).
          </p>
        )}
      </div>

      <div className="panel overflow-clip">
        <div className="panel-header">
          <p className="text-[13px] font-semibold text-ink">Facturas VISA pendientes</p>
          <p className="text-[11.5px] text-ink-muted">
            Destildá las que no entran en este resumen. Cada proveedor recibe su pago y en el banco
            queda un único débito.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {porProveedor.map(([proveedor, lista]) => (
            <li key={proveedor} className="px-5 py-3">
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink">{proveedor}</p>
              <ul className="space-y-1">
                {lista.map((f) => {
                  const marcada = !fuera.has(f.id)
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={trabajando}
                          onChange={() => alternar(f.id)}
                        />
                        <span className="num w-[78px] text-ink-muted">{fechaCorta(f.fecha)}</span>
                        <span className="num w-[150px] font-mono text-[11.5px] text-ink">
                          {f.clase} {f.numero}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">{f.detalle}</span>
                        <span className="num font-semibold text-ink">{formatearImporte(f.saldo, f.moneda)}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a.slice(2)}`
}
