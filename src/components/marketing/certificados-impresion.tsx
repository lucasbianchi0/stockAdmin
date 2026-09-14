"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Printer } from "lucide-react"

import { Certificado, type DatosCertificado } from "@/components/marketing/certificado"
import { Button } from "@/components/ui/button"

type Hoja = { id: string; nombre: string; codigo: string; horas: number | null }

/**
 * La tira de hojas A4 y la barra para imprimirlas.
 *
 * EL BOTON ESPERA A LAS FUENTES Y A LOS LOGOS
 *
 * `window.print()` saca la foto de lo que haya en ese instante. Si Space Grotesk
 * todavía no llegó, el nombre sale en Arial; si un logo no terminó de bajar,
 * sale una placa blanca vacía. Y como es un PDF que se le entrega a alguien, eso
 * no se nota hasta que lo abre el cliente. Por eso el botón no se habilita hasta
 * que `document.fonts.ready` y todas las imágenes resolvieron.
 *
 * LA HOJA MIDE 297 × 210 MM, NO 1122 × 793 PX
 *
 * Son casi lo mismo, y ese "casi" es media línea de más que Chrome manda a una
 * segunda hoja en blanco entre certificado y certificado. La caja se fija en
 * milímetros con `overflow: hidden` y la pieza entra adentro.
 */
export function CertificadosImpresion({
  eventoId,
  titulo,
  evento,
  config,
  marcas,
  hojas,
}: {
  eventoId: string
  titulo: string
  evento: DatosCertificado["evento"]
  config: DatosCertificado["config"]
  marcas: DatosCertificado["marcas"]
  hojas: Hoja[]
}) {
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    const imagenes = Array.from(document.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((ok) => { img.onload = img.onerror = () => ok() })
    )
    Promise.all([document.fonts.ready, ...imagenes]).then(() => vivo && setListo(true))
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="cert-impresion min-h-screen bg-[#1A1F29]">
      <style>{`
        @page { size: 297mm 210mm; margin: 0; }
        .cert-hoja { width: 297mm; height: 210mm; overflow: hidden; margin: 0 auto 28px; box-shadow: 0 24px 60px rgba(0,0,0,.45); border-radius: 6px; }
        @media print {
          html, body { background: none !important; }
          .cert-impresion { background: none !important; min-height: 0 !important; }
          .cert-barra { display: none !important; }
          .cert-lista { padding: 0 !important; }
          .cert-hoja { margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-after: page; page-break-after: always; }
          .cert-hoja:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="cert-barra sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#11151C]/90 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="text-white/70 hover:bg-white/10 hover:text-white">
            <Link href={`/marketing/eventos/${eventoId}?tab=asistentes`}>
              <ArrowLeft />
              Volver
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{titulo}</p>
            <p className="text-[11.5px] text-white/55">
              {hojas.length} certificado{hojas.length === 1 ? "" : "s"} · A4 apaisado
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-[11.5px] text-white/50 md:block">
            En el diálogo: destino “Guardar como PDF”, márgenes “Ninguno” y “Gráficos de fondo” activado.
          </p>
          <Button onClick={() => window.print()} disabled={!listo || hojas.length === 0}>
            {listo ? <Printer /> : <Loader2 className="animate-spin" />}
            {listo ? "Imprimir / Guardar PDF" : "Preparando…"}
          </Button>
        </div>
      </div>

      {hojas.length === 0 ? (
        <p className="px-6 py-20 text-center text-[13px] text-white/60">No hay asistentes para imprimir.</p>
      ) : (
        <div className="cert-lista px-6 py-8">
          {hojas.map((h) => (
            <div key={h.id} className="cert-hoja">
              <Certificado
                evento={evento}
                config={config}
                marcas={marcas}
                asistente={{ nombre: h.nombre, codigo: h.codigo, horas: h.horas }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
