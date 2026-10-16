import { SubdiarioImpresion } from "@/components/admin/subdiario-impresion"

export const metadata = { title: "Subdiario IVA Compras · Imprimir" }

export default function SubdiarioComprasPageImprimir() {
  return <SubdiarioImpresion tipo="compra" />
}
