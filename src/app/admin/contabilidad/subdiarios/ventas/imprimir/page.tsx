import { SubdiarioImpresion } from "@/components/admin/subdiario-impresion"

export const metadata = { title: "Subdiario IVA Ventas · Imprimir" }

export default function SubdiarioVentasPageImprimir() {
  return <SubdiarioImpresion tipo="venta" />
}
