"use client"

import { useRef, useState } from "react"
import { Loader2, PenLine, RefreshCw, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LIMITES, type Firmante } from "@/lib/marketing/eventos"

/**
 * Un firmante del certificado: nombre, cargo y la imagen de su firma.
 *
 * La imagen se sube apenas se elige y vuelve ya procesada: sin fondo y en
 * blanco. Por eso la miniatura va sobre navy —en el fondo claro del backoffice
 * una firma blanca sería invisible— y es exactamente como va a verse en el
 * certificado.
 */
export function FirmanteFila({
  firmante,
  onChange,
  onQuitar,
}: {
  firmante: Firmante
  onChange: (f: Firmante) => void
  onQuitar: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  async function subir(archivo: File | null) {
    if (!archivo) return
    setSubiendo(true)
    try {
      const cuerpo = new FormData()
      cuerpo.set("firma", archivo)
      const r = await fetch("/api/marketing/firmas", { method: "POST", body: cuerpo })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudo subir la firma")
      onChange({ ...firmante, firmaRuta: d.ruta, firmaUrl: d.url })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la firma")
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface-subtle p-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          value={firmante.nombre}
          maxLength={LIMITES.firmanteCampo}
          placeholder="Nombre"
          onChange={(e) => onChange({ ...firmante, nombre: e.target.value })}
        />
        <Input
          value={firmante.cargo}
          maxLength={LIMITES.firmanteCampo}
          placeholder="Cargo"
          onChange={(e) => onChange({ ...firmante, cargo: e.target.value })}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onQuitar} title="Quitar firmante">
          <X />
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => subir(e.target.files?.[0] ?? null)}
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          className="grid h-14 w-40 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#0A1424] px-3 transition-opacity hover:opacity-90"
          title={firmante.firmaUrl ? "Cambiar la firma" : "Subir la firma"}
        >
          {subiendo ? (
            <Loader2 className="h-4 w-4 animate-spin text-white/70" />
          ) : firmante.firmaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firmante.firmaUrl} alt="Firma" className="max-h-11 max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-white/70">
              <PenLine className="h-3.5 w-3.5" />
              Subir firma
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-muted">
          {firmante.firmaUrl
            ? "Así sale en el certificado: sin fondo y en blanco."
            : "Foto o escaneo de la firma en tinta oscura sobre papel blanco. PNG o JPG."}
        </div>

        {firmante.firmaUrl && !subiendo && (
          <>
            <Button type="button" variant="outline" size="xs" onClick={() => input.current?.click()}>
              <RefreshCw />
              Cambiar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange({ ...firmante, firmaRuta: "", firmaUrl: "" })}
              title="Quitar la firma"
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
