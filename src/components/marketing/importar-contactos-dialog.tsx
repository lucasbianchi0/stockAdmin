"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Download,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { descargarCsv } from "@/lib/admin/csv"
import {
  COLUMNAS_PLANTILLA,
  ETIQUETA_CAMPO,
  type FilaImportada,
  type PrevisualizacionImport,
} from "@/lib/marketing/contactos"
import type { Usuario } from "@/lib/tickets"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Importar contactos desde un Excel o un CSV.
 *
 * Dos pasos y nada se guarda en el primero: se sube, se ve qué entra, qué está
 * repetido y qué no se entiende, y recién ahí se confirma. Una planilla de
 * marketing siempre trae filas a medias; mejor que se vean antes que descubrir
 * después cuarenta contactos sin empresa.
 */
export function ImportarContactosDialog({
  abierto,
  equipo,
  onCerrar,
  onImportado,
}: {
  abierto: boolean
  equipo: Usuario[]
  onCerrar: () => void
  onImportado: (insertados: number) => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<PrevisualizacionImport | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [completar, setCompletar] = useState(true)
  const input = useRef<HTMLInputElement>(null)

  const ocupado = leyendo || guardando

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, ocupado, onCerrar])

  // Reabrir arranca de cero. Se limpia al abrir y no al cerrar: si no, el
  // diálogo se iría vaciándose mientras dura la animación de salida.
  const [abiertoPrevio, setAbiertoPrevio] = useState(abierto)
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto)
    if (abierto) {
      setArchivo(null)
      setPrevia(null)
      setError(null)
      setCompletar(true)
    }
  }

  const { montado, saliendo } = usePresencia(abierto)
  if (!montado) return null

  async function leer(f: File) {
    setArchivo(f)
    setPrevia(null)
    setError(null)
    setLeyendo(true)
    try {
      const form = new FormData()
      form.append("archivo", f)
      const res = await fetch("/api/marketing/contactos/importar", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el archivo")
      setPrevia(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo")
    } finally {
      setLeyendo(false)
    }
  }

  const de = (e: FilaImportada["estado"]) => previa?.filas.filter((f) => f.estado === e) ?? []
  const nuevos = de("nuevo")
  const duplicados = de("duplicado")
  const repetidos = de("repetido").length
  const errores = de("error").length
  // De los que ya estaban, los que tienen algo para completar.
  const completables = duplicados.filter((f) => f.completaria?.length)
  const corregidas = previa?.filas.filter((f) => f.arreglos?.length && f.estado !== "error").length ?? 0
  const aCompletar = completar ? completables.length : 0
  const hayAlgo = nuevos.length + aCompletar > 0

  async function confirmar() {
    if (!hayAlgo) return
    setGuardando(true)
    try {
      const res = await fetch("/api/marketing/contactos/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filas: [...nuevos, ...(completar ? completables : [])], completar }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar")
      const partes = [
        data.insertados > 0 && `${data.insertados} ${data.insertados === 1 ? "contacto nuevo" : "contactos nuevos"}`,
        data.completados > 0 && `${data.completados} ${data.completados === 1 ? "completado" : "completados"}`,
      ].filter(Boolean)
      toast.success(partes.length ? partes.join(" · ") : "No había nada para sumar")
      onImportado(data.insertados)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar")
    } finally {
      setGuardando(false)
    }
  }

  const nombreAm = (id: string | null) => equipo.find((u) => u.id === id)?.nombre ?? null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Importar contactos"
    >
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]",
          saliendo
            ? "animate-out fade-out-0 fill-mode-forwards duration-150"
            : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !ocupado && onCerrar()}
      />

      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-3xl sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150 ease-in"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200 ease-out"
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
              Importar contactos
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Un .xlsx o .csv con una fila por persona. Se revisa antes de guardar.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* La zona de carga. Se achica una vez que hay un archivo leído. */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              const f = e.dataTransfer.files[0]
              if (f) void leer(f)
            }}
            onClick={() => !ocupado && input.current?.click()}
            className={cn(
              "group flex cursor-pointer items-center gap-4 rounded-2xl border-[1.5px] border-dashed px-5 transition-all duration-200",
              previa ? "py-3.5" : "flex-col justify-center py-10 text-center",
              arrastrando
                ? "border-brand-400 bg-brand-50/70"
                : "border-line-strong bg-surface-subtle hover:border-brand-300 hover:bg-brand-50/40"
            )}
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-xl bg-surface text-ink-muted ring-1 ring-line",
                previa ? "h-10 w-10" : "h-14 w-14"
              )}
            >
              {leyendo ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className={previa ? "h-5 w-5" : "h-6 w-6"} />
              )}
            </span>
            <div className={cn("min-w-0", previa && "flex-1 text-left")}>
              <p className="truncate text-[13px] font-semibold text-ink">
                {archivo ? archivo.name : "Arrastrá la planilla o hacé click para elegirla"}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {leyendo
                  ? "Leyendo…"
                  : previa
                    ? "Click para cambiar de archivo"
                    : "Excel (.xlsx) o CSV · hasta 2000 filas"}
              </p>
            </div>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void leer(f)
                e.target.value = ""
              }}
            />
          </div>

          {!previa && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink">Columnas que reconoce</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {COLUMNAS_PLANTILLA.map((c) => (
                    <span
                      key={c}
                      className="rounded-md border border-line bg-surface-subtle px-1.5 py-0.5 text-[11px] text-ink-secondary"
                    >
                      {c}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-[11.5px] text-ink-muted">
                  Una fila por persona: Nombre y Empresa son obligatorios (sirve una sola columna “Nombre y apellido”). El AM se reconoce por nombre o iniciales (LB). Si alguien ya está, no se duplica.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  descargarCsv("plantilla-contactos.csv", COLUMNAS_PLANTILLA, [
                    ["LB", "Accenture", "María", "Gómez", "Senior Manager", "Consultoría", "Servicios Profesionales", "m.gomez@accenture.com", "+54 11 4316-9200", "Explorar alianza"],
                  ])
                }}
              >
                <Download />
                Plantilla
              </Button>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {previa && (
            <>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
                <Resumen valor={nuevos.length} rotulo="Nuevos" tono="success" />
                <Resumen valor={duplicados.length} rotulo="Ya estaban" />
                <Resumen valor={repetidos} rotulo="Repetidos en el archivo" />
                <Resumen valor={errores} rotulo="Con problemas" tono={errores > 0 ? "danger" : undefined} />
              </dl>

              {completables.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3.5 py-3">
                  <input
                    type="checkbox"
                    className="checkbox mt-0.5"
                    checked={completar}
                    onChange={(e) => setCompletar(e.target.checked)}
                  />
                  <span className="text-[12.5px] leading-relaxed text-ink-secondary">
                    <span className="font-medium text-ink">
                      Completar los datos que les faltan a {completables.length}{" "}
                      {completables.length === 1 ? "persona que ya estaba" : "personas que ya estaban"}
                    </span>
                    <br />
                    Solo se llenan campos vacíos (teléfono, cargo, AM…). Nada de lo que ya tienen
                    cargado se pisa.
                  </span>
                </label>
              )}

              <ul className="space-y-1 text-[12px] text-ink-muted">
                {corregidas > 0 && (
                  <li>
                    {corregidas} {corregidas === 1 ? "fila se corrigió" : "filas se corrigieron"} al leerla:
                    mails con nombre o con dos direcciones, mayúsculas, empresas escritas distinto. Pasá
                    el mouse por la fila para ver qué cambió.
                  </li>
                )}
                {previa.filaCabecera > 1 && (
                  <li>Los encabezados no estaban en la primera fila: el título de arriba se ignoró.</li>
                )}
                {previa.recodificado && (
                  <li>El archivo venía con la codificación vieja de Excel: los acentos se corrigieron.</li>
                )}
                {previa.columnasIgnoradas.length > 0 && (
                  <li>
                    Columnas que no se usan:{" "}
                    <span className="text-ink-secondary">{previa.columnasIgnoradas.join(", ")}</span>
                  </li>
                )}
              </ul>

              <div className="overflow-hidden rounded-xl border border-line">
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 z-10 bg-surface-subtle text-left text-[10.5px] uppercase tracking-[0.04em] text-ink-muted">
                      <tr className="[&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
                        <th className="w-10">#</th>
                        <th>Persona</th>
                        <th>Empresa</th>
                        <th className="hidden sm:table-cell">Email</th>
                        <th className="hidden sm:table-cell">AM</th>
                        <th className="text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.filas.slice(0, 300).map((f) => (
                        <FilaPrevia key={f.fila} f={f} am={nombreAm(f.amId)} />
                      ))}
                    </tbody>
                  </table>
                </div>
                {previa.filas.length > 300 && (
                  <p className="border-t border-line bg-surface-subtle px-3 py-2 text-[11.5px] text-ink-muted">
                    Se muestran 300 de {previa.filas.length} filas. Se importan todas las válidas.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <Button variant="outline" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!previa || !hayAlgo || ocupado}>
            {guardando && <Loader2 className="animate-spin" />}
            {!previa
              ? "Importar"
              : nuevos.length > 0 && aCompletar > 0
                ? `Importar ${nuevos.length} y completar ${aCompletar}`
                : aCompletar > 0
                  ? `Completar ${aCompletar}`
                  : `Importar ${nuevos.length} contacto${nuevos.length === 1 ? "" : "s"}`}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Resumen({
  valor,
  rotulo,
  tono,
}: {
  valor: number
  rotulo: string
  tono?: "success" | "danger"
}) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <dt className="text-[11.5px] text-ink-muted">{rotulo}</dt>
      <dd
        className={cn(
          "num mt-0.5 text-[18px] font-semibold leading-none",
          tono === "success" && valor > 0 ? "text-success-text" : tono === "danger" ? "text-danger-text" : "text-ink"
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

function FilaPrevia({ f, am }: { f: FilaImportada; am: string | null }) {
  const persona = [f.datos.nombre, f.datos.apellido].filter(Boolean).join(" ")
  const estado =
    f.estado === "nuevo"
      ? { texto: "Nuevo", clase: "text-success-text" }
      : f.estado === "duplicado" && f.completaria?.length
        ? {
            texto: `Ya está · completa ${f.completaria.map((c) => ETIQUETA_CAMPO[c].toLowerCase()).join(", ")}`,
            clase: "text-brand-700",
          }
        : f.estado === "error"
          ? { texto: f.motivo ?? "Con problemas", clase: "text-danger-text" }
          : { texto: f.motivo ?? "", clase: "text-ink-muted" }
  return (
    <tr
      title={f.arreglos?.length ? `Corregido: ${f.arreglos.join(", ")}` : undefined}
      className={cn(
        "[&_td]:border-b [&_td]:border-line-soft [&_td]:px-3 [&_td]:py-2",
        f.estado !== "nuevo" && f.estado !== "duplicado" && "text-ink-muted"
      )}
    >
      <td className="num text-ink-faint">
        {f.fila}
        {f.arreglos?.length ? <span className="ml-1 text-brand-500">•</span> : null}
      </td>
      <td className="max-w-[160px] truncate font-medium text-ink">{persona || "—"}</td>
      <td className="max-w-[160px] truncate">{f.datos.empresa || "—"}</td>
      <td className="hidden max-w-[200px] truncate sm:table-cell">{f.datos.email || "—"}</td>
      <td className="hidden sm:table-cell">
        {am ? <Avatar id={f.amId} nombre={am} size="xs" /> : <span className="text-ink-faint">—</span>}
      </td>
      <td className={cn("max-w-[220px] truncate text-right text-[11.5px] font-medium", estado.clase)} title={estado.texto}>
        {estado.texto}
      </td>
    </tr>
  )
}
