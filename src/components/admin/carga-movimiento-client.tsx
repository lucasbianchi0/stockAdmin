"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftRight, ArrowRight, FileInput, Landmark, Pencil, Receipt } from "lucide-react"
import { toast } from "sonner"

import { ComprobanteDialog } from "@/components/admin/comprobante-dialog"
import { LecturaGastoDialog } from "@/components/admin/lectura-gasto-dialog"
import {
  MovimientoDialog,
  type BorradorMovimiento,
} from "@/components/admin/movimiento-dialog"
import { Button } from "@/components/ui/button"
import type { CuentaFinanciera } from "@/lib/admin/cobros"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

const URL_CUENTAS = "/api/admin/cuentas"
/** Referencia estable: un `[]` nuevo por render dispararía los efectos del
 *  formulario que dependen de la lista. */
const SIN_CUENTAS: CuentaFinanciera[] = []

type Modo = "gasto" | "conIva" | "transferencia" | "ajuste"

const MODOS: { valor: Modo; etiqueta: string; icon: typeof Receipt }[] = [
  { valor: "gasto", etiqueta: "Gasto", icon: Receipt },
  { valor: "conIva", etiqueta: "Con IVA / varias cuentas", icon: Landmark },
  { valor: "transferencia", etiqueta: "Transferencia", icon: ArrowLeftRight },
  { valor: "ajuste", etiqueta: "Ajuste", icon: Pencil },
]

/**
 * Otros movimientos: la pantalla es el formulario, como las otras cinco de
 * carga del módulo.
 *
 * Los tres modos van arriba y no escondidos detrás de un botón cada uno, porque
 * elegir cuál es el primer paso del trabajo, no una variante del mismo. El
 * **ajuste** aparece acá por primera vez: el formulario estaba escrito hace
 * rato y ningún botón de ninguna pantalla lo disparaba, así que la corrección
 * manual —la que el propio código dice que existe "porque siempre hay una"— no
 * se podía hacer.
 *
 * Y arriba de todo, la regla que separa esta pantalla de las facturas de
 * compra. Es la única confusión cara del módulo: un movimiento no tiene entidad
 * ni IVA discriminado (ver `Movimiento` en `lib/admin/movimientos.ts`), así que
 * cargar acá un gasto que sí vino con factura pierde dos cosas de una —el
 * proveedor, que entonces no queda con saldo en su cuenta corriente, y el
 * crédito fiscal—. No se valida ni se bloquea nada: se dice, con el link al
 * lado, que es lo que alcanza cuando el que carga sabe lo que tiene en la mano.
 */
export function CargaMovimientoClient() {
  const [modo, setModo] = useState<Modo>("gasto")
  const [leyendo, setLeyendo] = useState(false)
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null)

  /** Remonta el formulario para vaciarlo. Ver `CargaComprobanteClient`. */
  const [serie, setSerie] = useState(0)
  const limpiar = () => {
    setBorrador(null)
    setSerie((n) => n + 1)
  }

  // La misma lista que piden las otras pantallas del módulo: comparten caché. Si
  // falla, el selector queda vacío, como antes.
  const { data: cuentas = SIN_CUENTAS } = useQuery({
    queryKey: claves.url(URL_CUENTAS),
    queryFn: ({ signal }) =>
      pedirJson<{ cuentas?: CuentaFinanciera[] }>(URL_CUENTAS, { signal }),
    select: (d) => d.cuentas ?? SIN_CUENTAS,
  })

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {MODOS.map((m) => (
            <button
              key={m.valor}
              onClick={() => {
                setModo(m.valor)
                limpiar()
              }}
              aria-pressed={modo === m.valor}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                modo === m.valor
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              <m.icon className="h-3.5 w-3.5" />
              {m.etiqueta}
            </button>
          ))}
        </div>

        {/* Solo para el gasto: un comprobante de transferencia o un ajuste no
            son papeles que haya que leer. */}
        {modo === "gasto" && (
          <Button variant="outline" onClick={() => setLeyendo(true)}>
            <FileInput className="h-3.5 w-3.5" />
            Carga inteligente
          </Button>
        )}
      </div>

      {modo === "gasto" && (
        <p className="rounded-lg border border-warning-line bg-warning-soft/50 px-3.5 py-2.5 text-[12px] text-ink-secondary">
          Si el gasto vino con factura de un proveedor, cargalo en{" "}
          <Link
            href="/admin/compras"
            className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            Facturas de compras
          </Link>
          : acá no se guarda ni el proveedor ni el IVA discriminado.
        </p>
      )}

      {modo === "conIva" ? (
        <GastoConIva key={serie} cuentas={cuentas} onListo={limpiar} />
      ) : (
      <MovimientoDialog
        key={`${modo}-${serie}`}
        modo={modo}
        embebido
        cuentas={cuentas}
        borrador={borrador}
        onCerrar={limpiar}
        onGuardado={() => {
          limpiar()
          toast.success("Movimiento registrado")
        }}
      />
      )}

      <div className="flex justify-center">
        <Link
          href="/admin/movimientos/listado"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-brand-600"
        >
          Ver los movimientos cargados
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <LecturaGastoDialog
        abierto={leyendo}
        onCerrar={() => setLeyendo(false)}
        onUsar={(leido) => {
          setLeyendo(false)
          setBorrador(leido)
          setSerie((n) => n + 1)
        }}
      />
    </div>
  )
}

/* ── Gasto con IVA o con varias cuentas ───────────────────────────────────── */

/**
 * El pedido del estudio del 26/10: «poder cargar varias cuentas contables
 * cuando cargo los movimientos y que calcule el IVA como en las facturas», con
 * el resumen del Galicia de ejemplo —gravado, IVA, Ley 25413, percepciones de
 * IIBB y de IVA, cada uno a su cuenta—.
 *
 * Eso ya lo sabe hacer el formulario de facturas de compra: renglones con su
 * cuenta y su alícuota, y los impuestos con su cuenta propia. Así que acá se
 * usa ese mismo formulario, con la clase «EX» (extracto bancario) y el banco
 * como proveedor, y al guardarlo se registra solo el débito desde la cuenta
 * elegida. Queda igual que en su libro: el gasto en IVA Compras, cada importe
 * en su cuenta y un único débito en el extracto del banco.
 */
function GastoConIva({ cuentas, onListo }: { cuentas: CuentaFinanciera[]; onListo: () => void }) {
  const invalidar = useInvalidarAdmin()
  // La tarjeta no: lo que se carga a la tarjeta se marca VISA y lo cancela el
  // débito del resumen, no un débito propio.
  const enPesos = cuentas.filter((c) => c.moneda === "ARS" && c.tipo !== "tarjeta")
  const [cuentaId, setCuentaId] = useState(
    () => enPesos.find((c) => /galicia/i.test(c.nombre))?.id ?? enPesos[0]?.id ?? ""
  )

  const debitar = async (c: {
    id: string
    proveedorId: string | null
    fecha: string
    total: number
    clase: string
    estado: string
    tarjetaVisa: boolean
  }) => {
    if (c.estado !== "confirmado") {
      toast.success("Quedó en borrador. El débito se registra al pagarlo desde Pagos.")
      return onListo()
    }
    if (c.tarjetaVisa) {
      toast.success("Quedó marcado VISA: se cancela con el débito del resumen, en Pago de tarjetas VISA.")
      return onListo()
    }
    const cuenta = cuentas.find((x) => x.id === cuentaId)
    try {
      await pedirJson("/api/admin/pagos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entidadId: c.proveedorId,
          fecha: c.fecha,
          moneda: "ARS",
          tc: null,
          retenciones: [],
          imputaciones: [{ comprobanteId: c.id, importe: c.total, tcAplicado: null }],
          aplicaciones: [],
          medios: [{ cuentaId, importe: c.total, referencia: "Débito en cuenta" }],
          observaciones: `Débito en cuenta ${cuenta?.nombre ?? ""}`.trim(),
        }),
      })
      void invalidar()
      toast.success(`Registrado: ${formatearImporte(c.total)} debitados de ${cuenta?.nombre ?? "la cuenta"}`)
    } catch (e) {
      toast.error(
        `El gasto se guardó pero no el débito: ${e instanceof Error ? e.message : "error"}. Pagalo desde Pagos de facturas.`
      )
    }
    onListo()
  }

  return (
    <div className="space-y-3">
      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <label htmlFor="cuenta-debito" className="text-[12.5px] font-medium text-ink">
          Se debitó de
        </label>
        <select
          id="cuenta-debito"
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          className="h-9 min-w-[220px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
        >
          {enPesos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <p className="text-[11.5px] text-ink-muted">
          Proveedor: el banco (si no está, se crea desde el buscador). Cada importe con su cuenta;
          el IVA y los impuestos van a las suyas y el gasto entra en IVA Compras. Los gastos del
          resumen de la tarjeta (como «BANCO GALICIA TC») se marcan VISA y no se debitan acá.
        </p>
      </div>
      <ComprobanteDialog
        abierto
        embebido
        tipo="compra"
        comprobante={null}
        claseInicial="EXA"
        onCerrar={onListo}
        onGuardado={(c) => void debitar(c)}
      />
    </div>
  )
}
