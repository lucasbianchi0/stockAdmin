"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { PagoDialog } from "@/components/admin/pago-dialog"
import type { TipoPago } from "@/lib/admin/cobros-server"

/**
 * La pantalla de alta de recibos —cobros de clientes y pagos a proveedores—:
 * el formulario de la orden y nada más, por la misma razón que en facturas —se
 * entra a pagar o a cobrar, no a mirar—. El listado de lo ya registrado queda a
 * un link. Ver `CargaComprobanteClient`.
 */
export function CargaReciboClient({ tipo }: { tipo: TipoPago }) {
  const esCobro = tipo === "cobro"
  const listado = esCobro ? "/admin/cobros/listado" : "/admin/pagos/listado"

  /** Remonta el formulario para vaciarlo. Ver `CargaComprobanteClient`. */
  const [serie, setSerie] = useState(0)
  const limpiar = () => setSerie((n) => n + 1)

  return (
    <div className="space-y-4">
      <PagoDialog
        key={serie}
        abierto
        embebido
        tipo={tipo}
        cobro={null}
        onCerrar={limpiar}
        onGuardado={() => {
          limpiar()
          toast.success(esCobro ? "Cobro registrado" : "Pago registrado")
        }}
      />

      <div className="flex justify-center">
        <Link
          href={listado}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-brand-600"
        >
          {esCobro ? "Ver los cobros registrados" : "Ver los pagos registrados"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
