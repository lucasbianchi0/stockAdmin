"use client"

import * as React from "react"
import { Check, Code2, Copy, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FIRMA_DEFAULT,
  LOGOS_PREVIA,
  MODELOS,
  firmaHtml,
  firmaTexto,
  type DatosFirma,
  type ModeloFirma,
} from "@/lib/firma-correo"

/**
 * Generador del pie de firma.
 *
 * Se completa una vez arriba y las dos opciones se dibujan abajo con esos
 * mismos datos: elegir entre dos firmas es una decisión visual, y con un
 * selector hay que ir y venir para compararlas. Cada una tiene su propio botón
 * de copiar, así que la elección y la acción están en el mismo lugar.
 *
 * No hay nada que guardar: los campos viven en el estado del componente y se
 * pierden al recargar, a propósito — es una herramienta de un solo uso, no un
 * padrón de empleados.
 *
 * Lo que se dibuja acá abajo trae las imágenes de `public/logos/` y lo que se
 * copia las trae del sitio: son los mismos archivos, pero la previa no tiene por
 * qué esperar a un deploy para mostrarlas.
 */

const CAMPOS: { k: keyof DatosFirma; label: string; ph: string }[] = [
  { k: "nombre", label: "Nombre y apellido", ph: "Carlos Bianchi" },
  { k: "cargo", label: "Cargo", ph: "Director Comercial" },
  { k: "email", label: "Email", ph: "nombre@accedra.com.ar" },
  { k: "linkedin", label: "LinkedIn", ph: "URL del perfil o de la empresa" },
  { k: "celular", label: "Celular", ph: "+54 9 11 0000-0000" },
  { k: "telefono", label: "Teléfono fijo", ph: "+54 11 0000-0000" },
]

export function FirmaCorreoGenerador() {
  const [datos, setDatos] = React.useState<DatosFirma>(FIRMA_DEFAULT)
  /** Qué botón acaba de copiar, como `modelo:firma` o `modelo:html`. */
  const [copiado, setCopiado] = React.useState("")

  React.useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(""), 1800)
    return () => clearTimeout(t)
  }, [copiado])

  const set = (k: keyof DatosFirma) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDatos((d) => ({ ...d, [k]: e.target.value }))

  /**
   * Se copia el HTML con formato, no el texto. Si el navegador no deja escribir
   * `text/html` en el portapapeles, se cae a seleccionar y copiar, que es lo que
   * hacen los generadores viejos y funciona en todos.
   *
   * Lo que se selecciona en ese caso no es la previa sino un nodo aparte, fuera
   * de pantalla: la previa apunta a las imágenes locales, y copiarla dejaría una
   * firma con URLs de localhost adentro del mail.
   */
  async function copiarFirma(modelo: ModeloFirma) {
    const html = firmaHtml(datos, modelo)
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([firmaTexto(datos)], { type: "text/plain" }),
        }),
      ])
    } catch {
      const fuera = document.createElement("div")
      fuera.style.cssText = "position:fixed;left:-9999px;top:0;width:600px;"
      fuera.innerHTML = html
      document.body.appendChild(fuera)
      const rango = document.createRange()
      rango.selectNode(fuera)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(rango)
      document.execCommand("copy")
      sel?.removeAllRanges()
      fuera.remove()
    }
    setCopiado(`${modelo}:firma`)
  }

  async function copiarHtml(modelo: ModeloFirma) {
    await navigator.clipboard.writeText(firmaHtml(datos, modelo))
    setCopiado(`${modelo}:html`)
  }

  return (
    <div className="space-y-6">
      {/* Los datos, una sola vez */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-e1">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <label key={c.k}>
              <span className="mb-1.5 block text-[12px] font-medium text-ink-secondary">
                {c.label}
              </span>
              <Input value={datos[c.k]} onChange={set(c.k)} placeholder={c.ph} />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3.5">
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Un campo vacío no sale en la firma. El logo, la dirección, los partners y los enlaces
            al sitio y a Instagram son fijos; el de LinkedIn es el que cargues acá. Los datos no se
            guardan en ningún lado.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto shrink-0"
            onClick={() => setDatos(FIRMA_DEFAULT)}
          >
            <RotateCcw />
            Restablecer
          </Button>
        </div>
      </div>

      {/* Las dos opciones, con los mismos datos */}
      {MODELOS.map((m, i) => (
        <div key={m.id}>
          <div className="mb-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="eyebrow">Opción {i + 1}</p>
              <h3 className="mt-0.5 text-[14px] font-semibold text-ink">{m.nombre}</h3>
              <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-ink-muted">
                {m.bajada}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" onClick={() => copiarFirma(m.id)}>
                {copiado === `${m.id}:firma` ? <Check className="text-white" /> : <Copy />}
                {copiado === `${m.id}:firma` ? "Copiada" : "Copiar firma"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => copiarHtml(m.id)}>
                {copiado === `${m.id}:html` ? <Check className="text-success-text" /> : <Code2 />}
                HTML
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-white p-6 shadow-e1">
            <div dangerouslySetInnerHTML={{ __html: firmaHtml(datos, m.id, LOGOS_PREVIA) }} />
          </div>
        </div>
      ))}

      <p className="text-[12px] leading-relaxed text-ink-muted">
        <span className="font-medium text-ink-secondary">Copiar firma</span> te la lleva con
        formato: se pega directo en Gmail → Configuración → Firma, o en Redactar para probarla.{" "}
        <span className="font-medium text-ink-secondary">HTML</span> te da el código, para Outlook o
        para pegarlo en otra herramienta.
      </p>
    </div>
  )
}
