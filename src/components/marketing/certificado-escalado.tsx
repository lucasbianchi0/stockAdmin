"use client"

import { useEffect, useRef, useState } from "react"

import { CERT_ALTO, CERT_ANCHO, Certificado, type DatosCertificado } from "@/components/marketing/certificado"

/**
 * El certificado entero, achicado hasta el ancho del contenedor.
 *
 * Se escala con `transform` y nunca se reacomoda: lo que se ve acá es el papel,
 * proporcionalmente. El alto del contenedor se fija a mano porque un elemento
 * escalado sigue ocupando su tamaño original en el flujo.
 */
export function CertificadoEscalado(props: DatosCertificado & { className?: string }) {
  const { className, ...datos } = props
  const caja = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.5)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setEscala(el.clientWidth / CERT_ANCHO)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={caja} className={className} style={{ width: "100%", height: CERT_ALTO * escala, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
          borderRadius: 14 / escala,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(10,20,36,0.28), 0 8px 20px rgba(10,20,36,0.14)",
        }}
      >
        <Certificado {...datos} />
      </div>
    </div>
  )
}
