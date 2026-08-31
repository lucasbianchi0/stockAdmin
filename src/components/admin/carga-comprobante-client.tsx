"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, FileInput } from "lucide-react"
import { toast } from "sonner"

import { ComprobanteDialog } from "@/components/admin/comprobante-dialog"
import { ImpactoDialog } from "@/components/admin/impacto-dialog"
import { ImportarFacturasDialog } from "@/components/admin/importar-facturas-dialog"
import { Button } from "@/components/ui/button"
import { formatearNumero, type TipoComprobante } from "@/lib/admin/comprobantes"
import type { Impacto } from "@/lib/admin/impacto"

/**
 * La pantalla de alta de facturas —de compra y de venta—: el formulario y nada
 * más.
 *
 * Antes acá vivía el listado y el alta era un modal encima. Se dio vuelta
 * porque el uso real de estas pantallas es uno solo —llegó una factura, hay que
 * cargarla—, y en ese uso el listado era un paso previo que había que atravesar
 * y un click extra antes de poder tipear. Ahora se entra escribiendo. El
 * listado sigue existiendo, un link más abajo, para lo otro que se hace con las
 * facturas: revisarlas, confirmarlas, corregirlas.
 *
 * Arriba, los dos caminos de alta del pliego —2.2.A «nuevo ingreso» y 2.2.B
 * «carga inteligente»— quedan a la vista al mismo tiempo. No es que uno sea el
 * modo avanzado del otro: son dos maneras de que entre la misma factura según
 * qué haya en la mano, el papel o el PDF.
 */
export function CargaComprobanteClient({ tipo }: { tipo: TipoComprobante }) {
  const esCompra = tipo === "compra"
  const listado = esCompra ? "/admin/compras/listado" : "/admin/ventas/listado"

  const [importando, setImportando] = useState(false)
  const [impacto, setImpacto] = useState<Impacto | null>(null)

  /**
   * Cambiar esto remonta el formulario, que es como se vacía.
   *
   * El estado del alta vive adentro de `ComprobanteDialog` y se reinicia con
   * `abierto`; acá `abierto` nunca deja de ser `true`, así que el remonte por
   * `key` es lo que hace de "cerrar y volver a abrir" sin que la pantalla
   * parpadee ni tenga que existir un ciclo de cerrado que nadie ve.
   */
  const [serie, setSerie] = useState(0)
  const limpiar = () => setSerie((n) => n + 1)

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-[12.5px] text-ink-muted">
          ¿Tenés el PDF de la factura? Que lo lea el sistema y llene los campos.
        </p>
        <Button variant="outline" onClick={() => setImportando(true)}>
          <FileInput className="h-3.5 w-3.5" />
          Carga inteligente
        </Button>
      </div>

      <ComprobanteDialog
        key={serie}
        abierto
        embebido
        tipo={tipo}
        comprobante={null}
        onCerrar={limpiar}
        onGuardado={(c, _esNuevo, imp) => {
          // Guardar deja la pantalla lista para la siguiente factura: casi
          // nunca llega una sola, y quedarse mirando los campos ya cargados
          // obliga a borrarlos a mano antes de seguir.
          limpiar()
          if (imp) setImpacto(imp)
          else
            toast.success(
              `${c.clase} ${formatearNumero(c.puntoVenta, c.numero)} registrado`
            )
        }}
      />

      <div className="flex justify-center">
        <Link
          href={listado}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-brand-600"
        >
          Ver las facturas cargadas
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ImportarFacturasDialog
        tipo={tipo}
        abierto={importando}
        onCerrar={() => setImportando(false)}
        onImportadas={(i) => {
          setImportando(false)
          setImpacto(i)
        }}
      />

      <ImpactoDialog impacto={impacto} onCerrar={() => setImpacto(null)} />
    </div>
  )
}
